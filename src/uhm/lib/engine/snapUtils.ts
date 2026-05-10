import maplibregl from "maplibre-gl";

const SNAP_THRESHOLD_PX = 15;

export function snapToNearestGeometry(
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat,
    pointPx: maplibregl.Point
): maplibregl.LngLat {
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [pointPx.x - SNAP_THRESHOLD_PX, pointPx.y - SNAP_THRESHOLD_PX],
        [pointPx.x + SNAP_THRESHOLD_PX, pointPx.y + SNAP_THRESHOLD_PX],
    ];

    const features = map.queryRenderedFeatures(bbox);

    let nearestDist = Infinity;
    let nearestLngLat: maplibregl.LngLat | null = null;

    const getDistSq = (p1: maplibregl.Point, p2: maplibregl.Point) => {
        return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    };

    // Tìm điểm gần nhất trên đoạn thẳng [a, b] so với điểm p
    const getClosestPointOnSegment = (p: maplibregl.Point, a: maplibregl.Point, b: maplibregl.Point): maplibregl.Point => {
        const atob = { x: b.x - a.x, y: b.y - a.y };
        const atop = { x: p.x - a.x, y: p.y - a.y };
        const lenSq = atob.x * atob.x + atob.y * atob.y;
        if (lenSq === 0) return new maplibregl.Point(a.x, a.y);
        
        let t = (atop.x * atob.x + atop.y * atob.y) / lenSq;
        t = Math.max(0, Math.min(1, t));
        
        return new maplibregl.Point(a.x + atob.x * t, a.y + atob.y * t);
    };

    const processLineString = (line: number[][]) => {
        if (!line || line.length < 2) return;
        for (let i = 0; i < line.length - 1; i++) {
            const p1LngLat = new maplibregl.LngLat(line[i][0], line[i][1]);
            const p2LngLat = new maplibregl.LngLat(line[i + 1][0], line[i + 1][1]);
            const p1 = map.project(p1LngLat);
            const p2 = map.project(p2LngLat);
            
            const closestPx = getClosestPointOnSegment(pointPx, p1, p2);
            const distSq = getDistSq(pointPx, closestPx);
            
            if (distSq < nearestDist && distSq <= SNAP_THRESHOLD_PX ** 2) {
                nearestDist = distSq;
                nearestLngLat = map.unproject(closestPx);
            }
        }
    };

    for (const feature of features) {
        if (!feature.geometry) continue;
        
        // Bỏ qua các layer preview hoặc edit để không tự snap vào nét đang vẽ dở.
        if (feature.layer.id.includes("preview") || feature.layer.id.includes("edit-")) {
            continue;
        }

        const type = feature.geometry.type;
        if (type === "GeometryCollection") continue;
        const coords = (feature.geometry as any).coordinates;

        // Xử lý cả Polygon và LineString vì viền bản đồ (border) đôi khi được render dưới dạng LineString
        if (type === "Polygon") {
            for (const ring of coords) processLineString(ring);
        } else if (type === "MultiPolygon") {
            for (const poly of coords) {
                for (const ring of poly) processLineString(ring);
            }
        } else if (type === "LineString") {
            processLineString(coords);
        } else if (type === "MultiLineString") {
            for (const line of coords) processLineString(line);
        }
    }

    return nearestLngLat || lngLat;
}
