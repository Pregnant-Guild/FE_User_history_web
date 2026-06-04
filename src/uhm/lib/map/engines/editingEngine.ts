import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { buildCircleRing, destinationPoint, distanceMeters } from "@/uhm/lib/map/geo/geoMath";
import { snapToNearestGeometry, snapToNearestGeometryDetailed } from "@/uhm/lib/map/engines/snapUtils";

export type EditingHandle = {
    id: string | number;
    ring: [number, number][];
    original: Geometry;
    isCircle?: boolean;
    circleCenter?: [number, number];
    circleRadius?: number;
    geometryType?: "Point" | "LineString" | "Polygon";
};

export type EditingAPI = {
    beginEditing: (feature: maplibregl.MapGeoJSONFeature) => void;
    clearEditing: () => void;
    bindEditEvents: (map: maplibregl.Map) => (() => void);
};

// Tạo engine chỉnh sửa polygon, line, point đã có (kéo đỉnh, thêm đỉnh, commit/cancel).
export function createEditingEngine(options: {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    onUpdate: (id: string | number, geometry: Geometry) => void;
}) {
    const { mapRef, onUpdate } = options;
    const editingRef = { current: null as EditingHandle | null };
    const dragStateRef = { current: null as { idx: number } | null };
    const deleteVertexModeRef = { current: false };
    let vertexSnapStatuses: ("vertex" | "edge" | "none")[] = [];
    let contextMenu: HTMLDivElement | null = null;
    let docClickHandler: ((ev: MouseEvent) => void) | null = null;

    // Hủy trạng thái chỉnh sửa hiện tại và dọn hai source edit.
    const clearEditing = () => {
        editingRef.current = null;
        dragStateRef.current = null;
        vertexSnapStatuses = [];
        setDeleteVertexMode(false);
        hideContextMenu();
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        (map.getSource("edit-shape") as maplibregl.GeoJSONSource | undefined)?.setData(empty);
        (map.getSource("edit-handles") as maplibregl.GeoJSONSource | undefined)?.setData(empty);
    };

    // Đồng bộ polygon/line/point tạm và các handle point lên map source.
    const updateEditSources = () => {
        const editing = editingRef.current;
        const map = mapRef.current;
        console.log("updateEditSources: editing:", editing, "map loaded:", map?.isStyleLoaded());
        if (!editing || !map || !map.isStyleLoaded()) return;

        let shape: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point>;
        let handles: GeoJSON.FeatureCollection<GeoJSON.Point>;

        const geomType = editing.geometryType || "Polygon";

        const getHandleProperties = (idx: number, coordinate: [number, number], extraProps = {}) => {
            let status: "none" | "vertex" | "edge" | "delete" = "none";
            if (deleteVertexModeRef.current) {
                status = "delete";
            } else {
                const isDragging = dragStateRef.current !== null;
                const isDraggedVertex = dragStateRef.current?.idx === idx;
                
                if (isDragging && !isDraggedVertex && vertexSnapStatuses[idx]) {
                    status = vertexSnapStatuses[idx];
                } else {
                    const lngLat = new maplibregl.LngLat(coordinate[0], coordinate[1]);
                    const pointPx = map.project(lngLat);
                    const snapResult = snapToNearestGeometryDetailed(map, lngLat, pointPx, editing.id);
                    
                    if (snapResult.type !== "none") {
                        const dist = distanceMeters(coordinate, [snapResult.lngLat.lng, snapResult.lngLat.lat]);
                        if (dist <= 1.0) {
                            status = snapResult.type;
                        } else {
                            status = "none";
                        }
                    } else {
                        status = "none";
                    }
                    
                    vertexSnapStatuses[idx] = status;
                }
            }
            return {
                idx,
                status,
                ...extraProps
            };
        };

        if (geomType === "Polygon") {
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
                            properties: getHandleProperties(0, editing.circleCenter, { type: "center" }),
                        },
                        {
                            type: "Feature",
                            geometry: { type: "Point", coordinates: radiusHandlePoint },
                            properties: getHandleProperties(1, radiusHandlePoint, { type: "radius" }),
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
                        properties: getHandleProperties(idx, c),
                    })),
                };
            }
        } else if (geomType === "LineString") {
            shape = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "LineString", coordinates: editing.ring },
                        properties: {},
                    },
                ],
            };

            handles = {
                type: "FeatureCollection",
                features: editing.ring.map((c, idx) => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: c },
                    properties: getHandleProperties(idx, c),
                })),
            };
        } else {
            // Point
            shape = {
                type: "FeatureCollection",
                features: [],
            };

            handles = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: editing.ring[0] },
                        properties: getHandleProperties(0, editing.ring[0]),
                    },
                ],
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
        const geomType = editing.geometryType || "Polygon";

        if (geomType === "Polygon") {
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
        } else if (geomType === "LineString") {
            geometry = {
                type: "LineString",
                coordinates: editing.ring,
            };
        } else {
            // Point
            geometry = {
                type: "Point",
                coordinates: editing.ring[0],
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
        updateEditSources();
    };

    // Bắt đầu chỉnh sửa từ feature polygon/line/point được chọn.
    const beginEditing = (feature: maplibregl.MapGeoJSONFeature) => {
        console.log("beginEditing called with feature:", feature);
        if (!feature || !feature.geometry) {
            console.warn("beginEditing: feature or feature.geometry is missing");
            return;
        }
        const geom = feature.geometry as Geometry;
        const type = geom.type;
        console.log("beginEditing: geometry type is", type);
        if (type !== "Polygon" && type !== "LineString" && type !== "Point") {
            console.warn("beginEditing: unsupported geometry type:", type);
            return;
        }

        const isCircle = !!geom.circle_center;

        let ring: [number, number][] = [];
        if (type === "Polygon") {
            const coords = (geom.coordinates?.[0] ?? []) as [number, number][];
            console.log("beginEditing Polygon coords:", coords);
            if (coords.length < 4) {
                console.warn("beginEditing: Polygon coords length is less than 4");
                return;
            }
            // remove duplicated closing point
            ring = coords.slice(0, -1).map((c) => [c[0], c[1]] as [number, number]);
        } else if (type === "LineString") {
            const coords = (geom.coordinates ?? []) as [number, number][];
            console.log("beginEditing LineString coords:", coords);
            if (coords.length < 2) {
                console.warn("beginEditing: LineString coords length is less than 2");
                return;
            }
            ring = coords.map((c) => [c[0], c[1]] as [number, number]);
        } else if (type === "Point") {
            const coords = (geom.coordinates ?? []) as [number, number];
            console.log("beginEditing Point coords:", coords);
            if (coords.length < 2) {
                console.warn("beginEditing: Point coords length is less than 2");
                return;
            }
            ring = [[coords[0], coords[1]]];
        }

        editingRef.current = {
            id: feature.id ?? feature.properties?.id,
            ring,
            original: geom,
            isCircle,
            circleCenter: geom.circle_center,
            circleRadius: geom.circle_radius,
            geometryType: type,
        };
        console.log("beginEditing: initialized editingRef.current:", editingRef.current);
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
            e.originalEvent.stopPropagation(); // Chặn sự kiện lan ra bản đồ tránh gây kéo/pan bản đồ
            if (deleteVertexModeRef.current) {
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
                ? snapToNearestGeometry(map, e.lngLat, e.point, editing.id)
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
            updateEditSources();
        };

        // Bắt phím điều khiển phiên chỉnh sửa.
        const onKeyDown = (e: KeyboardEvent) => {
            const editing = editingRef.current;
            if (!editing) return;
            if (e.key === "Enter") {
                finishEditing();
            } else if (e.key === "Delete" && editing.geometryType !== "Point" && !editing.isCircle) {
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
            if (!editing || editing.geometryType === "Point" || editing.isCircle) return;
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

        const cleanup = () => {
            map.off("mousedown", "edit-handles-circle", onHandleDown);
            map.off("contextmenu", "edit-handles-circle", onHandleContextMenu);
            map.off("mousemove", onHandleMove);
            map.off("mouseup", stopDragging);
            document.removeEventListener("keydown", onKeyDown);
            try {
                map.getCanvas()?.removeEventListener("mouseleave", onCanvasLeave);
            } catch {
                // ignore
            }
            hideContextMenu();
            map.off("remove", cleanup);
        };

        map.on("remove", cleanup);

        return cleanup;
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
        if (!editing) return;

        const isLine = editing.geometryType === "LineString";
        const canDelete = isLine ? editing.ring.length > 2 : editing.ring.length > 3;
        const canInsert = isLine ? idx < editing.ring.length - 1 : true;

        menu.appendChild(createItem("Xóa đỉnh", () => deleteVertex(idx), !canDelete));
        if (canInsert) {
            menu.appendChild(createItem("Thêm đỉnh", () => insertVertexAfter(idx)));
        }

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
        if (!editing || editing.geometryType === "Point" || editing.isCircle) return;
        const isLine = editing.geometryType === "LineString";
        const minLength = isLine ? 2 : 3;
        if (editing.ring.length <= minLength) return;
        if (idx < 0 || idx >= editing.ring.length) return;
        editing.ring.splice(idx, 1);
        vertexSnapStatuses.splice(idx, 1);
        updateEditSources();
    };

    const insertVertexAfter = (idx: number) => {
        const editing = editingRef.current;
        if (!editing || editing.geometryType === "Point" || editing.isCircle || editing.ring.length < 2) return;
        if (idx < 0 || idx >= editing.ring.length) return;
        const isLine = editing.geometryType === "LineString";
        if (isLine && idx === editing.ring.length - 1) return;

        const current = editing.ring[idx];
        const next = editing.ring[(idx + 1) % editing.ring.length];
        const midpoint: [number, number] = [
            (current[0] + next[0]) / 2,
            (current[1] + next[1]) / 2,
        ];
        editing.ring.splice(idx + 1, 0, midpoint);
        vertexSnapStatuses.splice(idx + 1, 0, "none");
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
