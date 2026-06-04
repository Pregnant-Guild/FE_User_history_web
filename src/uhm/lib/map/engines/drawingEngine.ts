import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import type { ModeGetter } from "@/uhm/lib/map/engines/engineTypes";
import { snapToNearestGeometryDetailed, tracePathBetweenPoints, getRingWithSnaps } from "@/uhm/lib/map/engines/snapUtils";

// Khởi tạo engine vẽ polygon tự do theo chuỗi click.
export function initDrawing(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onComplete: (geometry: Geometry) => void
) {
    let coords: [number, number][] = [];
    let coordMeta: { isTrace: boolean; traceGroupId?: number }[] = [];
    let currentTraceGroupId = 0;

    let isTKeyDown = false;

    // Trạng thái trace tích cực từ điểm bắt đầu
    let traceStartState: {
        startCoord: [number, number];
        startIdx: number;
        targetFeatureId: string | number;
        targetFeatureRing: [number, number][];
        snap1: {
            type: "vertex" | "edge";
            vertexIdx?: number;
            edgeIdx?: number;
            lngLat: { lng: number; lat: number };
        };
    } | null = null;

    const clearPreview = () => {
        if (!map.isStyleLoaded()) return;
        (map.getSource("draw-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: [],
        });
    };

    const cancelDrawing = () => {
        coords = [];
        coordMeta = [];
        traceStartState = null;
        clearPreview();
    };

    // Đóng vòng polygon nếu điểm cuối chưa trùng điểm đầu.
    function closePolygon(c: [number, number][]) {
        if (c.length < 3) return c;
        const first = c[0];
        const last = c[c.length - 1];

        if (first[0] !== last[0] || first[1] !== last[1]) {
            return [...c, first];
        }
        return c;
    }

    // Cập nhật layer preview trong lúc đang vẽ.
    function update(c: [number, number][]) {
        const closed = closePolygon(c);
        if (closed.length === 0) return;

        const features: GeoJSON.Feature[] = [
            {
                type: "Feature",
                properties: { type: "fill" },
                geometry: {
                    type: "Polygon",
                    coordinates: [closed],
                },
            },
            {
                type: "Feature",
                properties: { type: "line" },
                geometry: {
                    type: "LineString",
                    coordinates: closed,
                },
            }
        ];

        if (!map.isStyleLoaded()) return;
        (map.getSource("draw-preview") as maplibregl.GeoJSONSource)?.setData({
            type: "FeatureCollection",
            features: features
        });
    }

    // Ghi nhận đỉnh polygon mới khi click map.
    function onClick(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "draw") return;

        let lngLat = e.lngLat;
        // Snap nếu có phím Shift
        const snapRes = e.originalEvent.shiftKey
            ? snapToNearestGeometryDetailed(map, e.lngLat, e.point)
            : null;

        if (snapRes && snapRes.type !== "none") {
            lngLat = snapRes.lngLat;
        }

        const currentPoint: [number, number] = [lngLat.lng, lngLat.lat];

        // 1. Nếu đang có điểm bắt đầu trace, thử chốt trace
        if (traceStartState) {
            const targetSnap = snapToNearestGeometryDetailed(map, e.lngLat, e.point, null, traceStartState.targetFeatureId);
            if (
                targetSnap.type !== "none" &&
                targetSnap.featureId !== undefined &&
                String(targetSnap.featureId) === String(traceStartState.targetFeatureId) &&
                targetSnap.ringCoords
            ) {
                // Hợp lệ, tiến hành trace dọc biên giới
                const snap1 = traceStartState.snap1;
                const snap2 = {
                    type: targetSnap.type as "vertex" | "edge",
                    vertexIdx: targetSnap.vertexIdx,
                    edgeIdx: targetSnap.edgeIdx,
                    lngLat: { lng: targetSnap.lngLat.lng, lat: targetSnap.lngLat.lat }
                };

                const { ring, idx1, idx2 } = getRingWithSnaps(
                    traceStartState.targetFeatureRing,
                    snap1,
                    snap2
                );

                const path = tracePathBetweenPoints(
                    ring as [number, number][],
                    idx1,
                    idx2
                );

                if (path.length > 0) {
                    const newGroupId = currentTraceGroupId++;
                    for (let i = 1; i < path.length; i++) {
                        coords.push(path[i]);
                        coordMeta.push({ isTrace: true, traceGroupId: newGroupId });
                    }
                }
            } else {
                // Không tìm thấy điểm kết thúc hợp lệ trên cùng Geo, đặt điểm vẽ tự do bình thường
                coords.push(currentPoint);
                coordMeta.push({ isTrace: false });
            }
            traceStartState = null;
            update(coords);
            return;
        }

        // 2. Nếu chưa có trace, kiểm tra xem click này có kích hoạt tạo điểm bắt đầu trace không (Shift + T)
        const isShiftT = e.originalEvent.shiftKey && isTKeyDown;
        if (isShiftT && snapRes && snapRes.type !== "none" && snapRes.featureId !== undefined && snapRes.ringCoords) {
            coords.push(currentPoint);
            coordMeta.push({ isTrace: false }); // start point của trace vẫn tính là điểm bình thường
            
            traceStartState = {
                startCoord: currentPoint,
                startIdx: coords.length - 1,
                targetFeatureId: snapRes.featureId,
                targetFeatureRing: snapRes.ringCoords as [number, number][],
                snap1: {
                    type: snapRes.type as "vertex" | "edge",
                    vertexIdx: snapRes.vertexIdx,
                    edgeIdx: snapRes.edgeIdx,
                    lngLat: { lng: snapRes.lngLat.lng, lat: snapRes.lngLat.lat }
                }
            };
        } else {
            // Click bình thường
            coords.push(currentPoint);
            coordMeta.push({ isTrace: false });
        }

        update(coords);
    }

    // Render preview polygon với điểm chuột hiện tại.
    function onMove(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "draw" || coords.length === 0) return;

        let lngLat = e.lngLat;
        const snapRes = e.originalEvent.shiftKey
            ? snapToNearestGeometryDetailed(map, e.lngLat, e.point)
            : null;

        if (snapRes && snapRes.type !== "none") {
            lngLat = snapRes.lngLat;
        }

        const currentPoint: [number, number] = [lngLat.lng, lngLat.lat];

        // Nếu đang trong quá trình trace, tìm đường đi để vẽ nháp màu vàng
        if (traceStartState) {
            const targetSnap = snapToNearestGeometryDetailed(map, e.lngLat, e.point, null, traceStartState.targetFeatureId);
            if (
                targetSnap.type !== "none" &&
                targetSnap.featureId !== undefined &&
                String(targetSnap.featureId) === String(traceStartState.targetFeatureId) &&
                targetSnap.ringCoords
            ) {
                const snap1 = traceStartState.snap1;
                const snap2 = {
                    type: targetSnap.type as "vertex" | "edge",
                    vertexIdx: targetSnap.vertexIdx,
                    edgeIdx: targetSnap.edgeIdx,
                    lngLat: { lng: targetSnap.lngLat.lng, lat: targetSnap.lngLat.lat }
                };

                const { ring, idx1, idx2 } = getRingWithSnaps(
                    traceStartState.targetFeatureRing,
                    snap1,
                    snap2
                );

                const path = tracePathBetweenPoints(
                    ring as [number, number][],
                    idx1,
                    idx2
                );

                if (path.length > 0) {
                    const previewCoords = [...coords];
                    const traceStartOffset = coords.length;
                    
                    for (let i = 1; i < path.length; i++) {
                        previewCoords.push(path[i]);
                    }
                    
                    update(previewCoords);
                    return;
                }
            }
        }

        // Preview bình thường
        const previewCoords = [...coords, currentPoint];
        update(previewCoords);
    }

    // Hoàn tất polygon, trả geometry ra ngoài và reset preview.
    function finishDrawing() {
        if (getMode() !== "draw" || coords.length < 3) return;

        const geometry: Geometry = {
            type: "Polygon",
            coordinates: [closePolygon(coords)],
        };

        onComplete(geometry);
        cancelDrawing();
    }

    // Lắng nghe Enter/Escape/Backspace.
    function onKeyDown(e: KeyboardEvent) {
        if (getMode() !== "draw") return;
        
        if (e.key.toLowerCase() === "t") {
            isTKeyDown = true;
            return;
        }

        if (e.key === "Enter") {
            e.preventDefault();
            finishDrawing();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            cancelDrawing();
            return;
        }
        if (e.key === "Backspace") {
            e.preventDefault();
            if (coords.length === 0) return;

            const lastMeta = coordMeta[coordMeta.length - 1];
            if (lastMeta && lastMeta.isTrace && lastMeta.traceGroupId !== undefined) {
                const targetGroupId = lastMeta.traceGroupId;
                while (coordMeta.length > 0 && coordMeta[coordMeta.length - 1].traceGroupId === targetGroupId) {
                    coords.pop();
                    coordMeta.pop();
                }
            } else {
                coords.pop();
                coordMeta.pop();
            }

            traceStartState = null;

            if (coords.length) {
                update(coords);
            } else {
                clearPreview();
            }
        }
    }

    function onKeyUp(e: KeyboardEvent) {
        if (e.key.toLowerCase() === "t") {
            isTKeyDown = false;
        }
    }

    function onBlur() {
        isTKeyDown = false;
    }

    // Tắt tính năng box zoom và double click zoom để Shift không bị lỗi
    map.boxZoom.disable();
    map.doubleClickZoom.disable();

    map.on("click", onClick);
    map.on("mousemove", onMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const cleanup = () => {
        try {
            if (map.isStyleLoaded()) {
                map.boxZoom.enable();
                map.doubleClickZoom.enable();
            }
            map.off("click", onClick);
            map.off("mousemove", onMove);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            cancelDrawing();
        } catch {
            // ignore
        }
    };

    return {
        cleanup,
        cancel: cancelDrawing,
    };
}
