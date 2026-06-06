import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { buildCircleRing, destinationPoint, distanceMeters } from "@/uhm/lib/map/geo/geoMath";
import { getSnapVertexCoordinate, snapToNearestGeometry, snapToNearestGeometryDetailed, tracePathBetweenPoints } from "@/uhm/lib/map/engines/snapUtils";

const HANDLE_VERTEX_MATCH_EPSILON_DEGREES = 1e-12;
const HANDLE_EDGE_MATCH_EPSILON_METERS = 0.05;
const SNAP_STATUS_SOURCE_IDS = ["countries", "places"] as const;

type HandleStatus = "unknown" | "none" | "vertex" | "edge" | "delete";

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
    editingRef: React.MutableRefObject<{ id: string | number } | null>;
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
    let vertexSnapCache = new WeakMap<[number, number], HandleStatus>();
    let lastHandlesJson = "";
    let lastShapeJson = "";
    let needsCacheClear = false;
    let deleteRangeStartIdx: number | null = null;
    let deleteRangeHoverIdx: number | null = null;
    let deleteRangeIndices: number[] = [];
    let isAltKeyDown = false;
    let lastMousePointPx: maplibregl.Point | null = null;
    let contextMenu: HTMLDivElement | null = null;
    let docClickHandler: ((ev: MouseEvent) => void) | null = null;
    let pendingSnapStatusRefresh = false;

    // Trạng thái vẽ tiếp (Continue Draw) để vẽ nối tiếp/sửa từ một đỉnh
    let isDrawingContinued = false;
    let isTKeyDown = false;
    let originalRingBackup: [number, number][] | null = null;
    let coordMeta: { isTrace: boolean; traceGroupId?: number }[] = [];
    let traceStartState: {
        startCoord: [number, number];
        startIdx: number;
        targetFeatureId: string | number;
        targetFeatureRing: [number, number][];
        targetVertexIdx: number;
    } | null = null;
    let currentTraceGroupId = 1;

    let drawnPoints: [number, number][] = [];
    let continueDrawConfig: {
        i: number;
        j: number;
        reverseDrawn: boolean;
        prefix: [number, number][];
        suffix: [number, number][];
    } | null = null;

    // Hủy trạng thái chỉnh sửa hiện tại và dọn hai source edit.
    const clearEditing = () => {
        if (isDrawingContinued) {
            stopContinueDraw(false);
        }
        editingRef.current = null;
        dragStateRef.current = null;
        vertexSnapCache = new WeakMap();
        lastHandlesJson = "";
        lastShapeJson = "";
        needsCacheClear = false;
        setDeleteVertexMode(false);
        hideContextMenu();
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        (map.getSource("edit-shape") as maplibregl.GeoJSONSource | undefined)?.setData(empty);
        (map.getSource("edit-handles") as maplibregl.GeoJSONSource | undefined)?.setData(empty);
    };

    const coordinatesAlmostEqual = (
        a: [number, number],
        b: [number, number],
        epsilon: number
    ) => Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;

    const areSnapStatusSourcesReady = (map: maplibregl.Map) => {
        if (map.isMoving() || !map.areTilesLoaded()) return false;
        return SNAP_STATUS_SOURCE_IDS.every((sourceId) => {
            if (!map.getSource(sourceId)) return false;
            return map.isSourceLoaded(sourceId);
        });
    };

    const scheduleSnapStatusRefresh = (map: maplibregl.Map) => {
        if (pendingSnapStatusRefresh) return;
        pendingSnapStatusRefresh = true;
        map.once("idle", () => {
            pendingSnapStatusRefresh = false;
            updateEditSources();
        });
    };

    // Đồng bộ polygon/line/point tạm và các handle point lên map source.
    const updateEditSources = () => {
        const editing = editingRef.current;
        const map = mapRef.current;
        if (!editing || !map || !map.isStyleLoaded()) return;
        const snapSourcesReady = areSnapStatusSourcesReady(map);
        if (!snapSourcesReady) {
            scheduleSnapStatusRefresh(map);
        } else if (needsCacheClear) {
            vertexSnapCache = new WeakMap();
            needsCacheClear = false;
        }

        let shape: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point>;
        let handles: GeoJSON.FeatureCollection<GeoJSON.Point>;

        const geomType = editing.geometryType || "Polygon";

        const getHandleProperties = (idx: number, coordinate: [number, number], extraProps = {}) => {
            let status: HandleStatus = snapSourcesReady ? "none" : "unknown";
            if (deleteVertexModeRef.current) {
                if (deleteRangeStartIdx !== null) {
                    if (idx === deleteRangeStartIdx || idx === deleteRangeHoverIdx) {
                        status = "vertex";
                    } else if (deleteRangeIndices.includes(idx)) {
                        status = "delete";
                    } else {
                        status = "none";
                    }
                } else {
                    status = "delete";
                }
            } else {
                const isDraggedVertex = dragStateRef.current?.idx === idx;
                
                if (!isDraggedVertex && vertexSnapCache.has(coordinate) && vertexSnapCache.get(coordinate) !== "unknown") {
                    status = vertexSnapCache.get(coordinate)!;
                } else if (!snapSourcesReady) {
                    status = "unknown";
                } else {
                    const lngLat = new maplibregl.LngLat(coordinate[0], coordinate[1]);
                    const pointPx = map.project(lngLat);
                    const snapResult = snapToNearestGeometryDetailed(map, lngLat, pointPx, editing.id);
                    
                    if (snapResult.type === "vertex") {
                        const snapCoordinate = getSnapVertexCoordinate(snapResult);
                        status = snapCoordinate && coordinatesAlmostEqual(
                            coordinate,
                            snapCoordinate,
                            HANDLE_VERTEX_MATCH_EPSILON_DEGREES
                        ) ? "vertex" : "none";
                    } else if (snapResult.type === "edge") {
                        const dist = distanceMeters(coordinate, [snapResult.lngLat.lng, snapResult.lngLat.lat]);
                        status = dist <= HANDLE_EDGE_MATCH_EPSILON_METERS ? "edge" : "none";
                    } else {
                        status = "none";
                    }
                    
                    vertexSnapCache.set(coordinate, status);
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
                    features: isDrawingContinued
                        ? []
                        : editing.ring.map((c, idx) => ({
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
                features: isDrawingContinued
                    ? []
                    : editing.ring.map((c, idx) => ({
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

        const shapeJson = JSON.stringify(shape);
        if (shapeJson !== lastShapeJson) {
            lastShapeJson = shapeJson;
            (map.getSource("edit-shape") as maplibregl.GeoJSONSource | undefined)?.setData(shape);
        }

        const handlesJson = JSON.stringify(handles);
        if (handlesJson !== lastHandlesJson) {
            lastHandlesJson = handlesJson;
            (map.getSource("edit-handles") as maplibregl.GeoJSONSource | undefined)?.setData(handles);
        }
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
        deleteRangeStartIdx = null;
        deleteRangeHoverIdx = null;
        deleteRangeIndices = [];
        updateEditSources();
    };

    // Bắt đầu chỉnh sửa từ feature polygon/line/point được chọn.
    const beginEditing = (feature: maplibregl.MapGeoJSONFeature) => {
        if (!feature || !feature.geometry) {
            return;
        }
        const geom = feature.geometry as Geometry;
        const type = geom.type;
        if (type !== "Polygon" && type !== "LineString" && type !== "Point") {
            return;
        }

        const isCircle = !!geom.circle_center;

        let ring: [number, number][] = [];
        if (type === "Polygon") {
            const coords = (geom.coordinates?.[0] ?? []) as [number, number][];
            if (coords.length < 4) {
                return;
            }
            // remove duplicated closing point
            ring = coords.slice(0, -1).map((c) => [c[0], c[1]] as [number, number]);
        } else if (type === "LineString") {
            const coords = (geom.coordinates ?? []) as [number, number][];
            if (coords.length < 2) {
                return;
            }
            ring = coords.map((c) => [c[0], c[1]] as [number, number]);
        } else if (type === "Point") {
            const coords = (geom.coordinates ?? []) as [number, number];
            if (coords.length < 2) {
                return;
            }
            ring = [[coords[0], coords[1]]];
        }

        editingRef.current = {
            id: feature.properties?.id ?? feature.id,
            ring,
            original: geom,
            isCircle,
            circleCenter: geom.circle_center,
            circleRadius: geom.circle_radius,
            geometryType: type,
        };
        vertexSnapCache = new WeakMap();
        needsCacheClear = false;
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

    const updateDeleteRange = (pointPx: maplibregl.Point) => {
        const editing = editingRef.current;
        const map = mapRef.current;
        if (!editing || !map || deleteRangeStartIdx === null || deleteRangeHoverIdx === null) {
            deleteRangeIndices = [];
            return;
        }

        const n = editing.ring.length;
        if (deleteRangeStartIdx === deleteRangeHoverIdx) {
            deleteRangeIndices = [];
            updateEditSources();
            return;
        }

        const isLine = editing.geometryType === "LineString";

        if (isLine) {
            const start = Math.min(deleteRangeStartIdx, deleteRangeHoverIdx);
            const end = Math.max(deleteRangeStartIdx, deleteRangeHoverIdx);
            deleteRangeIndices = [];
            for (let i = start + 1; i < end; i++) {
                deleteRangeIndices.push(i);
            }
        } else {
            // Path A: clockwise/forward (exclusive)
            const pathA: number[] = [];
            let idx = (deleteRangeStartIdx + 1) % n;
            while (idx !== deleteRangeHoverIdx) {
                pathA.push(idx);
                idx = (idx + 1) % n;
            }

            // Path B: counter-clockwise/backward (exclusive)
            const pathB: number[] = [];
            idx = (deleteRangeStartIdx - 1 + n) % n;
            while (idx !== deleteRangeHoverIdx) {
                pathB.push(idx);
                idx = (idx - 1 + n) % n;
            }

            // Determine which path's midpoint is closer to the mouse cursor
            const getPathMidpointPx = (indices: number[]) => {
                if (indices.length === 0) {
                    const p1 = editing.ring[deleteRangeStartIdx!];
                    const p2 = editing.ring[deleteRangeHoverIdx!];
                    const midLngLat = new maplibregl.LngLat((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
                    return map.project(midLngLat);
                }
                const midIdx = indices[Math.floor(indices.length / 2)];
                const coord = editing.ring[midIdx];
                return map.project(new maplibregl.LngLat(coord[0], coord[1]));
            };

            const midPxA = getPathMidpointPx(pathA);
            const midPxB = getPathMidpointPx(pathB);

            const distA = Math.hypot(pointPx.x - midPxA.x, pointPx.y - midPxA.y);
            const distB = Math.hypot(pointPx.x - midPxB.x, pointPx.y - midPxB.y);

            const smartChoice = distA <= distB ? pathA : pathB;
            const alternativeChoice = distA <= distB ? pathB : pathA;

            deleteRangeIndices = isAltKeyDown ? alternativeChoice : smartChoice;
        }

        updateEditSources();
    };

    const performRangeDelete = (endIdx: number, pointPx: maplibregl.Point) => {
        const editing = editingRef.current;
        if (!editing || deleteRangeStartIdx === null) return;

        const isLine = editing.geometryType === "LineString";
        const minLength = isLine ? 2 : 3;

        // Recalculate range indices one last time to make sure they are up-to-date
        deleteRangeHoverIdx = endIdx;
        updateDeleteRange(pointPx);

        const toDeleteCount = deleteRangeIndices.length;
        if (toDeleteCount > 0 && editing.ring.length - toDeleteCount >= minLength) {
            const sortedIndices = [...deleteRangeIndices].sort((a, b) => b - a);
            for (const idx of sortedIndices) {
                editing.ring.splice(idx, 1);
            }
        }

        // Reset state
        deleteRangeStartIdx = null;
        deleteRangeHoverIdx = null;
        deleteRangeIndices = [];
        updateEditSources();
    };

    // Gắn toàn bộ sự kiện phục vụ chỉnh sửa hình.
    const bindEditEvents = (map: maplibregl.Map) => {
        // Bắt đầu kéo một handle point.
        const onHandleDown = (e: maplibregl.MapLayerMouseEvent) => {
            if (isDrawingContinued) return;
            if (!editingRef.current) return;
            if (e.originalEvent.button === 2) return;
            const feature = e.features?.[0];
            const idx = Number(feature?.properties?.idx);
            if (!Number.isInteger(idx)) return;
            e.preventDefault();
            e.originalEvent.stopPropagation(); // Chặn sự kiện lan ra bản đồ tránh gây kéo/pan bản đồ
            if (deleteVertexModeRef.current) {
                if (deleteRangeStartIdx !== null) {
                    performRangeDelete(idx, e.point);
                } else if (e.originalEvent.shiftKey) {
                    deleteRangeStartIdx = idx;
                    updateEditSources();
                } else {
                    deleteVertex(idx);
                }
                return;
            }
            dragStateRef.current = { idx };
            map.getCanvas().style.cursor = "grabbing";
            map.dragPan.disable();
        };

        const onHandleMouseEnter = (e: maplibregl.MapLayerMouseEvent) => {
            if (isDrawingContinued) return;
            const feature = e.features?.[0];
            const idx = Number(feature?.properties?.idx);
            if (!Number.isInteger(idx)) return;

            lastMousePointPx = e.point;
            if (deleteVertexModeRef.current && deleteRangeStartIdx !== null) {
                deleteRangeHoverIdx = idx;
                updateDeleteRange(e.point);
            }
        };

        const onHandleMouseLeave = () => {
            if (isDrawingContinued) return;
            lastMousePointPx = null;
            if (deleteRangeStartIdx !== null && deleteRangeHoverIdx !== null) {
                deleteRangeHoverIdx = null;
                deleteRangeIndices = [];
                updateEditSources();
            }
        };

        const onHandleMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
            if (isDrawingContinued) return;
            const feature = e.features?.[0];
            const idx = Number(feature?.properties?.idx);
            if (!Number.isInteger(idx)) return;

            lastMousePointPx = e.point;
            if (deleteVertexModeRef.current && deleteRangeStartIdx !== null) {
                deleteRangeHoverIdx = idx;
                updateDeleteRange(e.point);
            }
        };

        const onGeneralMapClick = (e: maplibregl.MapMouseEvent) => {
            if (isDrawingContinued) return;
            const features = map.queryRenderedFeatures(e.point, { layers: ["edit-handles-circle"] });
            if (features.length > 0) return;

            if (deleteRangeStartIdx !== null) {
                deleteRangeStartIdx = null;
                deleteRangeHoverIdx = null;
                deleteRangeIndices = [];
                updateEditSources();
            }
        };

        // Cập nhật vị trí đỉnh trong lúc kéo chuột.
        const onHandleMove = (e: maplibregl.MapMouseEvent) => {
            if (isDrawingContinued) return;
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
            if (isDrawingContinued) return;
            dragStateRef.current = null;
            map.getCanvas().style.cursor = "";
            map.dragPan.enable();
            updateEditSources();
        };

        // Bắt phím điều khiển phiên chỉnh sửa.
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === "t") {
                isTKeyDown = true;
            }
            if (e.key === "Alt") {
                isAltKeyDown = true;
                if (deleteRangeStartIdx !== null && deleteRangeHoverIdx !== null && lastMousePointPx) {
                    updateDeleteRange(lastMousePointPx);
                }
            }

            const editing = editingRef.current;
            if (!editing) return;

            if (isDrawingContinued) {
                if (e.key.toLowerCase() === "t") {
                    return;
                }

                if (e.key === "Enter") {
                    e.preventDefault();
                    stopContinueDraw(true);
                    return;
                }

                if (e.key === "Escape") {
                    e.preventDefault();
                    stopContinueDraw(false);
                    return;
                }

                if (e.key === "Backspace") {
                    e.preventDefault();
                    if (editing.ring.length <= 1) return;

                    const lastMeta = coordMeta[coordMeta.length - 1];
                    if (lastMeta && lastMeta.isTrace && lastMeta.traceGroupId !== undefined) {
                        const targetGroupId = lastMeta.traceGroupId;
                        while (coordMeta.length > 0 && coordMeta[coordMeta.length - 1].traceGroupId === targetGroupId) {
                            editing.ring.pop();
                            coordMeta.pop();
                        }
                    } else {
                        editing.ring.pop();
                        coordMeta.pop();
                    }

                    traceStartState = null;
                    updateEditSources();
                    return;
                }
                return;
            }

            if (e.key === "Enter") {
                finishEditing();
            } else if (e.key === "Delete" && editing.geometryType !== "Point" && !editing.isCircle) {
                e.preventDefault();
                if (e.repeat) return;
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
            if (deleteVertexModeRef.current) {
                if (deleteRangeStartIdx !== null) {
                    deleteRangeStartIdx = null;
                    deleteRangeHoverIdx = null;
                    deleteRangeIndices = [];
                    updateEditSources();
                }
                return;
            }
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

        const onWindowBlur = () => {
            isAltKeyDown = false;
            isTKeyDown = false;
            if (deleteRangeStartIdx !== null && deleteRangeHoverIdx !== null && lastMousePointPx) {
                updateDeleteRange(lastMousePointPx);
            }
        };

        const onMapViewportChange = () => {
            if (!editingRef.current) return;
            needsCacheClear = true;
            updateEditSources();
        };

        map.on("mousedown", "edit-handles-circle", onHandleDown);
        map.on("contextmenu", "edit-handles-circle", onHandleContextMenu);
        map.on("mouseenter", "edit-handles-circle", onHandleMouseEnter);
        map.on("mouseleave", "edit-handles-circle", onHandleMouseLeave);
        map.on("mousemove", "edit-handles-circle", onHandleMouseMove);
        map.on("click", onGeneralMapClick);
        map.on("mousemove", onHandleMove);
        map.on("mouseup", stopDragging);
        map.on("moveend", onMapViewportChange);
        map.on("zoomend", onMapViewportChange);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onWindowBlur);
        
        const canvas = map.getCanvas();
        if (canvas) {
            canvas.addEventListener("mouseleave", onCanvasLeave);
        }

        const cleanup = () => {
            if (isDrawingContinued) {
                stopContinueDraw(false);
            }
            map.off("mousedown", "edit-handles-circle", onHandleDown);
            map.off("contextmenu", "edit-handles-circle", onHandleContextMenu);
            map.off("mouseenter", "edit-handles-circle", onHandleMouseEnter);
            map.off("mouseleave", "edit-handles-circle", onHandleMouseLeave);
            map.off("mousemove", "edit-handles-circle", onHandleMouseMove);
            map.off("click", onGeneralMapClick);
            map.off("mousemove", onHandleMove);
            map.off("mouseup", stopDragging);
            map.off("moveend", onMapViewportChange);
            map.off("zoomend", onMapViewportChange);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onWindowBlur);
            try {
                const canvas = map.getCanvas();
                if (canvas) {
                    canvas.removeEventListener("mouseleave", onCanvasLeave);
                }
            } catch {
                // ignore
            }
            hideContextMenu();
            map.off("remove", cleanup);
        };

        map.on("remove", cleanup);

        return cleanup;
    };

    const updateEditSourcesWithPreview = (previewRing: [number, number][]) => {
        const editing = editingRef.current;
        const map = mapRef.current;
        if (!editing || !map || !map.isStyleLoaded()) return;

        let shape: GeoJSON.FeatureCollection;
        const geomType = editing.geometryType || "Polygon";

        if (geomType === "Polygon") {
            const closedRing = [...previewRing, previewRing[0]];
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
        } else {
            shape = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "LineString", coordinates: previewRing },
                        properties: {},
                    },
                ],
            };
        }

        lastShapeJson = "";
        lastHandlesJson = "";
        (map.getSource("edit-shape") as maplibregl.GeoJSONSource | undefined)?.setData(shape);
        (map.getSource("edit-handles") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: [],
        });
    };

    const startContinueDraw = (idx: number, side: "left" | "right") => {
        const map = mapRef.current;
        const editing = editingRef.current;
        if (!map || !editing) return;

        const isLine = editing.geometryType === "LineString";
        const len = editing.ring.length;

        // 1. Sao lưu ring gốc để hoàn tác nếu nhấn ESC
        originalRingBackup = [...editing.ring.map((c) => [c[0], c[1]] as [number, number])];

        // 2. Xác định nốt bắt đầu (startVertex) và nốt lân cận mục tiêu (endVertex)
        const current = editing.ring[idx];
        let targetNeighborIdx = -1;

        if (isLine) {
            if (idx === 0) {
                targetNeighborIdx = 1;
            } else if (idx === len - 1) {
                targetNeighborIdx = len - 2;
            } else {
                const prev = editing.ring[idx - 1];
                const next = editing.ring[idx + 1];
                const nextIsRight = isToTheRight(next, prev);
                if (side === "right") {
                    targetNeighborIdx = nextIsRight ? idx + 1 : idx - 1;
                } else {
                    targetNeighborIdx = nextIsRight ? idx - 1 : idx + 1;
                }
            }
        } else {
            // Polygon
            const prevIdx = (idx - 1 + len) % len;
            const nextIdx = (idx + 1) % len;
            const prev = editing.ring[prevIdx];
            const next = editing.ring[nextIdx];
            const nextIsRight = isToTheRight(next, prev);
            if (side === "right") {
                targetNeighborIdx = nextIsRight ? nextIdx : prevIdx;
            } else {
                targetNeighborIdx = nextIsRight ? prevIdx : nextIdx;
            }
        }

        const startVertex = idx;
        const endVertex = targetNeighborIdx;

        let i: number;
        let j: number;
        let reverseDrawn = false;

        if (startVertex === len - 1 && endVertex === 0 && !isLine) {
            i = startVertex;
            j = endVertex;
            reverseDrawn = false;
        } else if (startVertex === 0 && endVertex === len - 1 && !isLine) {
            i = endVertex;
            j = startVertex;
            reverseDrawn = true;
        } else if (startVertex < endVertex) {
            i = startVertex;
            j = endVertex;
            reverseDrawn = false;
        } else {
            i = endVertex;
            j = startVertex;
            reverseDrawn = true;
        }

        const prefix = editing.ring.slice(0, i + 1);
        const suffix = (j === 0 && !isLine) ? [] : editing.ring.slice(j);

        continueDrawConfig = {
            i,
            j,
            reverseDrawn,
            prefix,
            suffix
        };

        // 4. Khởi tạo mảng drawnPoints với điểm bắt đầu
        drawnPoints = [[current[0], current[1]]];

        // 5. Khởi tạo coordMeta tương ứng với các điểm vẽ tiếp
        coordMeta = [{ isTrace: false }];

        isDrawingContinued = true;
        isTKeyDown = false;
        traceStartState = null;

        // Vô hiệu hóa chế độ xóa đỉnh
        setDeleteVertexMode(false);

        // 6. Gắn các sự kiện vẽ bản đồ
        map.on("click", onMapClick);
        map.on("mousemove", onMapMove);
        map.on("contextmenu", onMapContextMenu);
        
        if (map.getCanvas()) {
            map.getCanvas().style.cursor = "crosshair";
        }

        // 7. Cập nhật hiển thị
        updateEditSources();
    };

    const stopContinueDraw = (save: boolean) => {
        const map = mapRef.current;
        if (!map) return;

        isDrawingContinued = false;
        isTKeyDown = false;
        traceStartState = null;

        // Gỡ các sự kiện vẽ bản đồ
        map.off("click", onMapClick);
        map.off("mousemove", onMapMove);
        map.off("contextmenu", onMapContextMenu);

        if (map.getCanvas()) {
            map.getCanvas().style.cursor = "";
        }

        if (!save && originalRingBackup && editingRef.current) {
            // Khôi phục lại mảng cũ
            editingRef.current.ring = [...originalRingBackup];
        }

        originalRingBackup = null;
        drawnPoints = [];
        continueDrawConfig = null;
        coordMeta = [];

        // Cập nhật lại nguồn dữ liệu (hiển thị lại các handle points chỉnh sửa bình thường)
        updateEditSources();
    };

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
        const map = mapRef.current;
        const editing = editingRef.current;
        if (!isDrawingContinued || !map || !editing || !continueDrawConfig) return;

        let lngLat = e.lngLat;
        const snapRes = e.originalEvent.shiftKey
            ? snapToNearestGeometryDetailed(
                map,
                e.lngLat,
                e.point,
                editing.id,
                traceStartState ? traceStartState.targetFeatureId : null
            )
            : null;

        if (snapRes && snapRes.type !== "none") {
            lngLat = snapRes.lngLat;
        }

        const currentPoint: [number, number] = [lngLat.lng, lngLat.lat];

        // 1. Thử chốt trace dọc biên giới
        if (traceStartState) {
            const targetSnap = snapToNearestGeometryDetailed(map, e.lngLat, e.point, editing.id, traceStartState.targetFeatureId);
            if (
                targetSnap.type === "vertex" &&
                targetSnap.featureId !== undefined &&
                String(targetSnap.featureId) === String(traceStartState.targetFeatureId) &&
                targetSnap.vertexIdx !== undefined
            ) {
                const path = tracePathBetweenPoints(
                    traceStartState.targetFeatureRing,
                    traceStartState.targetVertexIdx,
                    targetSnap.vertexIdx
                );

                if (path.length > 0) {
                    const newGroupId = currentTraceGroupId++;
                    for (let i = 1; i < path.length; i++) {
                        drawnPoints.push(path[i]);
                        coordMeta.push({ isTrace: true, traceGroupId: newGroupId });
                    }
                    traceStartState = null;

                    const { prefix, suffix, reverseDrawn } = continueDrawConfig;
                    const activeDrawn = reverseDrawn ? [...drawnPoints].reverse() : drawnPoints;
                    const isLine = editing.geometryType === "LineString";
                    editing.ring = stitchRing(prefix, suffix, activeDrawn, reverseDrawn, isLine);
                    updateEditSources();
                    return;
                }
            }
            if (e.originalEvent.shiftKey) {
                updateEditSources();
                return;
            }
        }

        // 2. Shift + T để kích hoạt start trace
        const isShiftT = e.originalEvent.shiftKey && isTKeyDown;
        const traceStartCoordinate = snapRes ? getSnapVertexCoordinate(snapRes) : null;
        if (
            isShiftT &&
            snapRes &&
            snapRes.type === "vertex" &&
            snapRes.featureId !== undefined &&
            snapRes.ringCoords &&
            snapRes.vertexIdx !== undefined &&
            traceStartCoordinate
        ) {
            drawnPoints.push(traceStartCoordinate);
            coordMeta.push({ isTrace: false });
            
            traceStartState = {
                startCoord: traceStartCoordinate,
                startIdx: drawnPoints.length - 1,
                targetFeatureId: snapRes.featureId,
                targetFeatureRing: snapRes.ringCoords as [number, number][],
                targetVertexIdx: snapRes.vertexIdx
            };
        } else {
            if (isShiftT) {
                updateEditSources();
                return;
            }

            drawnPoints.push(currentPoint);
            coordMeta.push({ isTrace: false });
            traceStartState = null;
        }

        const { prefix, suffix, reverseDrawn } = continueDrawConfig;
        const activeDrawn = reverseDrawn ? [...drawnPoints].reverse() : drawnPoints;
        const isLine = editing.geometryType === "LineString";
        editing.ring = stitchRing(prefix, suffix, activeDrawn, reverseDrawn, isLine);
        updateEditSources();
    };

    const onMapMove = (e: maplibregl.MapMouseEvent) => {
        const map = mapRef.current;
        const editing = editingRef.current;
        if (!isDrawingContinued || !map || !editing || !continueDrawConfig) return;

        let lngLat = e.lngLat;
        const snapRes = e.originalEvent.shiftKey
            ? snapToNearestGeometryDetailed(
                map,
                e.lngLat,
                e.point,
                editing.id,
                traceStartState ? traceStartState.targetFeatureId : null
            )
            : null;

        if (snapRes && snapRes.type !== "none") {
            lngLat = snapRes.lngLat;
        }

        const currentPoint: [number, number] = [lngLat.lng, lngLat.lat];
        const isLine = editing.geometryType === "LineString";

        // Nếu đang trong quá trình trace, tìm đường đi nháp
        if (traceStartState) {
            const targetSnap = snapToNearestGeometryDetailed(map, e.lngLat, e.point, editing.id, traceStartState.targetFeatureId);
            if (
                targetSnap.type === "vertex" &&
                targetSnap.featureId !== undefined &&
                String(targetSnap.featureId) === String(traceStartState.targetFeatureId) &&
                targetSnap.vertexIdx !== undefined
            ) {
                const path = tracePathBetweenPoints(
                    traceStartState.targetFeatureRing,
                    traceStartState.targetVertexIdx,
                    targetSnap.vertexIdx
                );

                if (path.length > 0) {
                    const previewDrawn = [...drawnPoints];
                    for (let i = 1; i < path.length; i++) {
                        previewDrawn.push(path[i]);
                    }
                    const { prefix, suffix, reverseDrawn } = continueDrawConfig;
                    const activeDrawn = reverseDrawn ? [...previewDrawn].reverse() : previewDrawn;
                    const combinedPreview = stitchRing(prefix, suffix, activeDrawn, reverseDrawn, isLine);
                    updateEditSourcesWithPreview(combinedPreview);
                    return;
                }
            }
        }

        const previewDrawn = [...drawnPoints, currentPoint];
        const { prefix, suffix, reverseDrawn } = continueDrawConfig;
        const activeDrawn = reverseDrawn ? [...previewDrawn].reverse() : previewDrawn;
        const combinedPreview = stitchRing(prefix, suffix, activeDrawn, reverseDrawn, isLine);
        updateEditSourcesWithPreview(combinedPreview);
    };

    const onMapContextMenu = (e: maplibregl.MapMouseEvent) => {
        if (isDrawingContinued) {
            e.preventDefault();
        }
    };

    const onKeyUp = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === "t") {
            isTKeyDown = false;
        }
        if (e.key === "Alt") {
            isAltKeyDown = false;
            if (deleteRangeStartIdx !== null && deleteRangeHoverIdx !== null && lastMousePointPx) {
                updateDeleteRange(lastMousePointPx);
            }
        }
    };

    const isToTheRight = (pointA: [number, number], pointB: [number, number]) => {
        if (pointA[0] !== pointB[0]) {
            return pointA[0] > pointB[0];
        }
        return pointA[1] < pointB[1];
    };

    const cleanRing = (ring: [number, number][]): [number, number][] => {
        const cleaned: [number, number][] = [];
        for (const pt of ring) {
            if (cleaned.length === 0) {
                cleaned.push(pt);
            } else {
                const last = cleaned[cleaned.length - 1];
                if (Math.abs(pt[0] - last[0]) > 1e-9 || Math.abs(pt[1] - last[1]) > 1e-9) {
                    cleaned.push(pt);
                }
            }
        }
        return cleaned;
    };

    const stitchRing = (
        prefix: [number, number][],
        suffix: [number, number][],
        activeDrawn: [number, number][],
        reverseDrawn: boolean,
        isLine: boolean
    ): [number, number][] => {
        if (!continueDrawConfig) return activeDrawn;

        const combined = prefix.concat(activeDrawn).concat(suffix);

        // Đối với polygon khép kín nếu bị quấn vòng qua điểm bắt đầu/kết thúc
        if (!isLine && combined.length > 1) {
            const first = combined[0];
            const last = combined[combined.length - 1];
            if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
                combined.pop();
            }
        }

        return cleanRing(combined);
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

        menu.appendChild(createItem("Xóa đỉnh", () => deleteVertex(idx), !canDelete));

        const current = editing.ring[idx];
        const len = editing.ring.length;

        if (isLine) {
            if (idx === 0) {
                // Chỉ có next (idx = 1)
                const next = editing.ring[1];
                if (isToTheRight(next, current)) {
                    menu.appendChild(createItem("Thêm đỉnh vào bên phải", () => insertVertexRight(0)));
                } else {
                    menu.appendChild(createItem("Thêm đỉnh vào bên trái", () => insertVertexRight(0)));
                }
            } else if (idx === len - 1) {
                // Chỉ có prev (idx = len - 2)
                const prev = editing.ring[len - 2];
                if (isToTheRight(prev, current)) {
                    menu.appendChild(createItem("Thêm đỉnh vào bên phải", () => insertVertexLeft(len - 1)));
                } else {
                    menu.appendChild(createItem("Thêm đỉnh vào bên trái", () => insertVertexLeft(len - 1)));
                }
            } else {
                // Có cả prev và next
                const prev = editing.ring[idx - 1];
                const next = editing.ring[idx + 1];
                const nextIsRight = isToTheRight(next, prev);
                if (nextIsRight) {
                    menu.appendChild(createItem("Thêm đỉnh vào bên trái", () => insertVertexLeft(idx)));
                    menu.appendChild(createItem("Thêm đỉnh vào bên phải", () => insertVertexRight(idx)));
                } else {
                    menu.appendChild(createItem("Thêm đỉnh vào bên phải", () => insertVertexLeft(idx)));
                    menu.appendChild(createItem("Thêm đỉnh vào bên trái", () => insertVertexRight(idx)));
                }
            }
        } else {
            // Polygon
            const prev = editing.ring[(idx - 1 + len) % len];
            const next = editing.ring[(idx + 1) % len];
            const nextIsRight = isToTheRight(next, prev);
            if (nextIsRight) {
                menu.appendChild(createItem("Thêm đỉnh vào bên trái", () => insertVertexLeft(idx)));
                menu.appendChild(createItem("Thêm đỉnh vào bên phải", () => insertVertexRight(idx)));
            } else {
                menu.appendChild(createItem("Thêm đỉnh vào bên phải", () => insertVertexLeft(idx)));
                menu.appendChild(createItem("Thêm đỉnh vào bên trái", () => insertVertexRight(idx)));
            }
        }

        // Vẽ tiếp từ nốt này
        if (!editing.isCircle && (editing.geometryType === "Polygon" || editing.geometryType === "LineString")) {
            if (isLine) {
                if (idx === 0) {
                    const next = editing.ring[1];
                    if (isToTheRight(next, current)) {
                        menu.appendChild(createItem("Vẽ tiếp về bên phải", () => startContinueDraw(0, "right")));
                    } else {
                        menu.appendChild(createItem("Vẽ tiếp về bên trái", () => startContinueDraw(0, "left")));
                    }
                } else if (idx === len - 1) {
                    const prev = editing.ring[len - 2];
                    if (isToTheRight(prev, current)) {
                        menu.appendChild(createItem("Vẽ tiếp về bên phải", () => startContinueDraw(len - 1, "right")));
                    } else {
                        menu.appendChild(createItem("Vẽ tiếp về bên trái", () => startContinueDraw(len - 1, "left")));
                    }
                } else {
                    menu.appendChild(createItem("Vẽ tiếp về bên trái", () => startContinueDraw(idx, "left")));
                    menu.appendChild(createItem("Vẽ tiếp về bên phải", () => startContinueDraw(idx, "right")));
                }
            } else {
                // Polygon
                menu.appendChild(createItem("Vẽ tiếp về bên trái", () => startContinueDraw(idx, "left")));
                menu.appendChild(createItem("Vẽ tiếp về bên phải", () => startContinueDraw(idx, "right")));
            }
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
        updateEditSources();
    };

    const insertVertexLeft = (idx: number) => {
        const editing = editingRef.current;
        if (!editing || editing.geometryType === "Point" || editing.isCircle || editing.ring.length < 2) return;
        if (idx < 0 || idx >= editing.ring.length) return;
        const isLine = editing.geometryType === "LineString";
        if (isLine && idx === 0) return;

        const current = editing.ring[idx];
        const prev = editing.ring[(idx - 1 + editing.ring.length) % editing.ring.length];
        const midpoint: [number, number] = [
            (current[0] + prev[0]) / 2,
            (current[1] + prev[1]) / 2,
        ];
        editing.ring.splice(idx, 0, midpoint);
        updateEditSources();
    };

    const insertVertexRight = (idx: number) => {
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
