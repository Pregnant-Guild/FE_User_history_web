import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { buildCircleRing, destinationPoint, distanceMeters } from "@/uhm/lib/map/geo/geoMath";

export type EditingHandle = {
    id: string | number;
    ring: [number, number][];
    original: Geometry;
    isCircle?: boolean;
    circleCenter?: [number, number];
    circleRadius?: number;
};

export type EditingAPI = {
    beginEditing: (feature: maplibregl.MapGeoJSONFeature) => void;
    clearEditing: () => void;
    bindEditEvents: (map: maplibregl.Map) => void;
};

// Tạo engine chỉnh sửa polygon đã có (kéo đỉnh, thêm đỉnh, commit/cancel).
export function createEditingEngine(options: {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    onUpdate: (id: string | number, geometry: Geometry) => void;
}) {
    const { mapRef, onUpdate } = options;
    const editingRef = { current: null as EditingHandle | null };
    const dragStateRef = { current: null as { idx: number } | null };
    const modifierRef = { current: { ctrl: false, meta: false } };

    // Hủy trạng thái chỉnh sửa hiện tại và dọn hai source edit.
    const clearEditing = () => {
        editingRef.current = null;
        dragStateRef.current = null;
        const map = mapRef.current;
        if (!map) return;
        const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        (map.getSource("edit-shape") as maplibregl.GeoJSONSource | undefined)?.setData(empty);
        (map.getSource("edit-handles") as maplibregl.GeoJSONSource | undefined)?.setData(empty);
    };

    // Đồng bộ polygon tạm và các handle point lên map source.
    const updateEditSources = () => {
        const editing = editingRef.current;
        const map = mapRef.current;
        if (!editing || !map) return;

        let shape: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
        let handles: GeoJSON.FeatureCollection<GeoJSON.Point>;

        if (editing.isCircle && editing.circleCenter && editing.circleRadius !== undefined) {
            const ring = buildCircleRing(editing.circleCenter, editing.circleRadius);
            const closedRing = [...ring, ring[0]];
            shape = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "Polygon", coordinates: [closedRing] },
                        properties: {},
                    },
                ],
            };

            // Circle handles: 0 = center, 1 = radius control
            const radiusHandlePoint = destinationPoint(editing.circleCenter, editing.circleRadius, 90);
            handles = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: editing.circleCenter },
                        properties: { idx: 0, type: "center" },
                    },
                    {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: radiusHandlePoint },
                        properties: { idx: 1, type: "radius" },
                    },
                ],
            };
        } else {
            const closedRing = [...editing.ring, editing.ring[0]];
            shape = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "Polygon", coordinates: [closedRing] },
                        properties: {},
                    },
                ],
            };

            handles = {
                type: "FeatureCollection",
                features: editing.ring.map((c, idx) => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: c },
                    properties: { idx },
                })),
            };
        }

        (map.getSource("edit-shape") as maplibregl.GeoJSONSource | undefined)?.setData(shape);
        (map.getSource("edit-handles") as maplibregl.GeoJSONSource | undefined)?.setData(handles);
    };

    // Chốt chỉnh sửa và emit geometry mới cho caller.
    const finishEditing = () => {
        const editing = editingRef.current;
        if (!editing) return;

        let geometry: Geometry;
        if (editing.isCircle && editing.circleCenter && editing.circleRadius !== undefined) {
            const ring = buildCircleRing(editing.circleCenter, editing.circleRadius);
            geometry = {
                type: "Polygon",
                coordinates: [[...ring, ring[0]]],
                circle_center: editing.circleCenter,
                circle_radius: editing.circleRadius,
            };
        } else {
            geometry = {
                type: "Polygon",
                coordinates: [[...editing.ring, editing.ring[0]]],
            };
        }

        onUpdate(editing.id, geometry);
        clearEditing();
    };

    // Thoát chế độ chỉnh sửa mà không lưu thay đổi.
    const cancelEditing = () => {
        clearEditing();
    };

    // Bắt đầu chỉnh sửa từ feature polygon được chọn.
    const beginEditing = (feature: maplibregl.MapGeoJSONFeature) => {
        if (feature.geometry.type !== "Polygon") return;
        const geom = feature.geometry as Geometry;
        const coords = (geom.coordinates?.[0] ?? []) as [number, number][];
        if (coords.length < 4) return;

        const isCircle = !!geom.circle_center;

        // remove duplicated closing point
        const ring = coords.slice(0, -1).map((c) => [c[0], c[1]] as [number, number]);
        editingRef.current = {
            id: feature.id ?? feature.properties?.id,
            ring,
            original: geom,
            isCircle,
            circleCenter: geom.circle_center,
            circleRadius: geom.circle_radius,
        };
        updateEditSources();
    };

    // Kiểm tra trạng thái nhấn phím modifier để bật thao tác chèn đỉnh.
    const isModifierPressed = (e?: maplibregl.MapLayerMouseEvent | maplibregl.MapMouseEvent) => {
        const oe = e?.originalEvent as MouseEvent | undefined;
        return (
            modifierRef.current.ctrl ||
            modifierRef.current.meta ||
            !!oe?.ctrlKey ||
            !!oe?.metaKey
        );
    };

    // Gắn toàn bộ sự kiện phục vụ chỉnh sửa hình.
    const bindEditEvents = (map: maplibregl.Map) => {
        // Bắt đầu kéo một handle point.
        const onHandleDown = (e: maplibregl.MapLayerMouseEvent) => {
            if (!editingRef.current) return;
            const feature = e.features?.[0];
            const idx = feature?.properties?.idx;
            if (idx === undefined) return;
            e.preventDefault();
            dragStateRef.current = { idx };
            map.getCanvas().style.cursor = "grabbing";
            map.dragPan.disable();
        };

        // Cập nhật vị trí đỉnh trong lúc kéo chuột.
        const onHandleMove = (e: maplibregl.MapMouseEvent) => {
            const drag = dragStateRef.current;
            const editing = editingRef.current;
            if (!drag || !editing) return;

            if (editing.isCircle && editing.circleCenter && editing.circleRadius !== undefined) {
                if (drag.idx === 0) {
                    // Move center
                    editing.circleCenter = [e.lngLat.lng, e.lngLat.lat];
                } else if (drag.idx === 1) {
                    // Change radius
                    editing.circleRadius = distanceMeters(editing.circleCenter, [
                        e.lngLat.lng,
                        e.lngLat.lat,
                    ]);
                }
            } else {
                editing.ring[drag.idx] = [e.lngLat.lng, e.lngLat.lat];
            }
            updateEditSources();
        };

        // Kết thúc kéo đỉnh và khôi phục trạng thái tương tác map.
        const stopDragging = () => {
            dragStateRef.current = null;
            map.getCanvas().style.cursor = "";
            map.dragPan.enable();
        };

        // Bắt phím điều khiển phiên chỉnh sửa (Enter/Escape + modifier flags).
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                modifierRef.current.ctrl = true;
            } else if (e.key === "Meta") {
                modifierRef.current.meta = true;
            }
            if (!editingRef.current) return;
            if (e.key === "Enter") {
                finishEditing();
            } else if (e.key === "Escape") {
                cancelEditing();
            }
        };

        // Hạ cờ modifier khi nhả phím.
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                modifierRef.current.ctrl = false;
            } else if (e.key === "Meta") {
                modifierRef.current.meta = false;
            }
        };

        // Chèn thêm một đỉnh mới vào ring tại vị trí gần điểm click nhất.
        const onInsertHandle = (e: maplibregl.MapLayerMouseEvent) => {
            if (!editingRef.current || editingRef.current.isCircle) return;
            if (!isModifierPressed(e)) return;
            e.preventDefault();
            const editing = editingRef.current;
            const ring = editing.ring;
            const click = [e.lngLat.lng, e.lngLat.lat] as [number, number];
            let nearestIdx = 0;
            let bestDist = Number.POSITIVE_INFINITY;
            ring.forEach((pt, idx) => {
                const dx = pt[0] - click[0];
                const dy = pt[1] - click[1];
                const d = dx * dx + dy * dy; // Dùng khoảng cách Euclid bình phương để so sánh nhanh, không cần sqrt.
                if (d < bestDist) {
                    bestDist = d;
                    nearestIdx = idx;
                }
            });
            const insertIdx = nearestIdx + 1;
            ring.splice(insertIdx, 0, click);
            dragStateRef.current = { idx: insertIdx };
            map.getCanvas().style.cursor = "grabbing";
            map.dragPan.disable();
            updateEditSources();
        };

        // Ngắt kéo nếu con trỏ rời canvas.
        const onCanvasLeave = () => {
            stopDragging();
        };

        map.on("mousedown", "edit-handles-circle", onHandleDown);
        map.on("mousedown", "edit-shape-line", onInsertHandle);
        map.on("mousemove", onHandleMove);
        map.on("mouseup", stopDragging);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        map.getCanvas().addEventListener("mouseleave", onCanvasLeave);

        map.on("remove", () => {
            map.off("mousedown", "edit-handles-circle", onHandleDown);
            map.off("mousedown", "edit-shape-line", onInsertHandle);
            map.off("mousemove", onHandleMove);
            map.off("mouseup", stopDragging);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            map.getCanvas().removeEventListener("mouseleave", onCanvasLeave);
        });
    };

    return {
        beginEditing,
        clearEditing,
        bindEditEvents,
        updateEditSources,
        editingRef,
        dragStateRef,
    };
}
