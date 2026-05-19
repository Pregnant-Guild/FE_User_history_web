import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { buildCircleRing, destinationPoint, distanceMeters } from "@/uhm/lib/map/geo/geoMath";
import { snapToNearestGeometry } from "@/uhm/lib/map/engines/snapUtils";

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
    const deleteVertexModeRef = { current: false };
    let contextMenu: HTMLDivElement | null = null;
    let docClickHandler: ((ev: MouseEvent) => void) | null = null;

    // Hủy trạng thái chỉnh sửa hiện tại và dọn hai source edit.
    const clearEditing = () => {
        editingRef.current = null;
        dragStateRef.current = null;
        setDeleteVertexMode(false);
        hideContextMenu();
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

    const setDeleteVertexMode = (enabled: boolean) => {
        deleteVertexModeRef.current = enabled;
        const map = mapRef.current;
        if (!map?.getLayer("edit-handles-circle")) return;
        map.setPaintProperty("edit-handles-circle", "circle-color", enabled ? "#ef4444" : "#f97316");
        map.setPaintProperty("edit-handles-circle", "circle-stroke-color", enabled ? "#7f1d1d" : "#0f172a");
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
        setDeleteVertexMode(false);
        updateEditSources();
    };

    const hideContextMenu = () => {
        if (contextMenu) {
            contextMenu.remove();
            contextMenu = null;
        }
        if (docClickHandler) {
            document.removeEventListener("click", docClickHandler);
            docClickHandler = null;
        }
    };

    // Gắn toàn bộ sự kiện phục vụ chỉnh sửa hình.
    const bindEditEvents = (map: maplibregl.Map) => {
        // Bắt đầu kéo một handle point.
        const onHandleDown = (e: maplibregl.MapLayerMouseEvent) => {
            if (!editingRef.current) return;
            if (e.originalEvent.button === 2) return;
            const feature = e.features?.[0];
            const idx = Number(feature?.properties?.idx);
            if (!Number.isInteger(idx)) return;
            e.preventDefault();
            if (deleteVertexModeRef.current) {
                e.originalEvent.stopPropagation();
                deleteVertex(idx);
                return;
            }
            dragStateRef.current = { idx };
            map.getCanvas().style.cursor = "grabbing";
            map.dragPan.disable();
        };

        // Cập nhật vị trí đỉnh trong lúc kéo chuột.
        const onHandleMove = (e: maplibregl.MapMouseEvent) => {
            const drag = dragStateRef.current;
            const editing = editingRef.current;
            if (!drag || !editing) return;

            const lngLat = e.originalEvent.shiftKey
                ? snapToNearestGeometry(map, e.lngLat, e.point)
                : e.lngLat;
            const nextCoordinate: [number, number] = [lngLat.lng, lngLat.lat];

            if (editing.isCircle && editing.circleCenter && editing.circleRadius !== undefined) {
                if (drag.idx === 0) {
                    // Move center
                    editing.circleCenter = nextCoordinate;
                } else if (drag.idx === 1) {
                    // Change radius
                    editing.circleRadius = distanceMeters(editing.circleCenter, nextCoordinate);
                }
            } else {
                editing.ring[drag.idx] = nextCoordinate;
            }
            updateEditSources();
        };

        // Kết thúc kéo đỉnh và khôi phục trạng thái tương tác map.
        const stopDragging = () => {
            dragStateRef.current = null;
            map.getCanvas().style.cursor = "";
            map.dragPan.enable();
        };

        // Bắt phím điều khiển phiên chỉnh sửa.
        const onKeyDown = (e: KeyboardEvent) => {
            const editing = editingRef.current;
            if (!editing) return;
            if (e.key === "Enter") {
                finishEditing();
            } else if (e.key === "Delete" && !editing.isCircle) {
                e.preventDefault();
                setDeleteVertexMode(!deleteVertexModeRef.current);
            } else if (e.key === "Escape") {
                if (deleteVertexModeRef.current) {
                    e.preventDefault();
                    setDeleteVertexMode(false);
                    return;
                }
                cancelEditing();
            }
        };

        // Chuột phải vào handle để mở menu xóa/thêm đỉnh.
        const onHandleContextMenu = (e: maplibregl.MapLayerMouseEvent) => {
            const editing = editingRef.current;
            if (!editing || editing.isCircle) return;
            e.preventDefault();
            e.originalEvent.stopPropagation();
            const feature = e.features?.[0];
            const idx = Number(feature?.properties?.idx);
            if (!Number.isInteger(idx)) return;
            showHandleContextMenu(
                e.originalEvent.clientX,
                e.originalEvent.clientY,
                idx
            );
        };

        // Ngắt kéo nếu con trỏ rời canvas.
        const onCanvasLeave = () => {
            stopDragging();
        };

        map.on("mousedown", "edit-handles-circle", onHandleDown);
        map.on("contextmenu", "edit-handles-circle", onHandleContextMenu);
        map.on("mousemove", onHandleMove);
        map.on("mouseup", stopDragging);
        document.addEventListener("keydown", onKeyDown);
        map.getCanvas().addEventListener("mouseleave", onCanvasLeave);

        map.on("remove", () => {
            map.off("mousedown", "edit-handles-circle", onHandleDown);
            map.off("contextmenu", "edit-handles-circle", onHandleContextMenu);
            map.off("mousemove", onHandleMove);
            map.off("mouseup", stopDragging);
            document.removeEventListener("keydown", onKeyDown);
            map.getCanvas().removeEventListener("mouseleave", onCanvasLeave);
            hideContextMenu();
        });
    };

    const showHandleContextMenu = (x: number, y: number, idx: number) => {
        hideContextMenu();

        const menu = document.createElement("div");
        menu.style.position = "fixed";
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.background = "#0f172a";
        menu.style.color = "white";
        menu.style.border = "1px solid #1f2937";
        menu.style.borderRadius = "6px";
        menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        menu.style.zIndex = "9999";
        menu.style.minWidth = "120px";
        menu.style.fontSize = "14px";
        menu.style.padding = "4px 0";

        const createItem = (label: string, onClick: () => void, disabled = false) => {
            const item = document.createElement("div");
            item.textContent = label;
            item.style.padding = "8px 12px";
            item.style.cursor = disabled ? "not-allowed" : "pointer";
            item.style.opacity = disabled ? "0.45" : "1";
            item.onmouseenter = () => {
                if (!disabled) item.style.background = "#1f2937";
            };
            item.onmouseleave = () => (item.style.background = "transparent");
            item.onclick = () => {
                if (disabled) return;
                onClick();
                hideContextMenu();
            };
            return item;
        };

        const editing = editingRef.current;
        const canDelete = Boolean(editing && !editing.isCircle && editing.ring.length > 3);
        menu.appendChild(createItem("Xóa đỉnh", () => deleteVertex(idx), !canDelete));
        menu.appendChild(createItem("Thêm đỉnh", () => insertVertexAfter(idx)));

        document.body.appendChild(menu);
        contextMenu = menu;

        const onDocClick = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                hideContextMenu();
            }
        };
        docClickHandler = onDocClick;
        setTimeout(() => document.addEventListener("click", onDocClick), 0);
    };

    const deleteVertex = (idx: number) => {
        const editing = editingRef.current;
        if (!editing || editing.isCircle || editing.ring.length <= 3) return;
        if (idx < 0 || idx >= editing.ring.length) return;
        editing.ring.splice(idx, 1);
        updateEditSources();
    };

    const insertVertexAfter = (idx: number) => {
        const editing = editingRef.current;
        if (!editing || editing.isCircle || editing.ring.length < 2) return;
        if (idx < 0 || idx >= editing.ring.length) return;
        const current = editing.ring[idx];
        const next = editing.ring[(idx + 1) % editing.ring.length];
        const midpoint: [number, number] = [
            (current[0] + next[0]) / 2,
            (current[1] + next[1]) / 2,
        ];
        editing.ring.splice(idx + 1, 0, midpoint);
        updateEditSources();
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
