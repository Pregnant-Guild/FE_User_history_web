import maplibregl from "maplibre-gl";
import { PATH_ARROW_SOURCE_ID } from "@/uhm/lib/map/constants";

// SHIFT/ALT snap should be forgiving while drawing quickly.
// Vertices get a larger radius and always win over edges when both are available.
const VERTEX_SNAP_THRESHOLD_PX = 34;
const EDGE_SNAP_THRESHOLD_PX = 24;
const QUERY_THRESHOLD_PX = Math.max(VERTEX_SNAP_THRESHOLD_PX, EDGE_SNAP_THRESHOLD_PX);

type Coordinate = [number, number];
type GeometryWithCoordinates = Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection> & {
    coordinates: unknown;
};

export function snapToNearestGeometry(
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat,
    pointPx: maplibregl.Point
): maplibregl.LngLat {
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [pointPx.x - QUERY_THRESHOLD_PX, pointPx.y - QUERY_THRESHOLD_PX],
        [pointPx.x + QUERY_THRESHOLD_PX, pointPx.y + QUERY_THRESHOLD_PX],
    ];

    const snapLayerIds = getSnapLayerIds(map);
    if (!snapLayerIds.length) return lngLat;

    const features = map.queryRenderedFeatures(bbox, {
        layers: snapLayerIds,
    });

    let nearestVertexDist = Infinity;
    let nearestVertexLngLat: maplibregl.LngLat | null = null;
    let nearestEdgeDist = Infinity;
    let nearestEdgeLngLat: maplibregl.LngLat | null = null;

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

    const processVertex = (coordinate: Coordinate) => {
        const vertexLngLat = new maplibregl.LngLat(coordinate[0], coordinate[1]);
        const vertexPx = map.project(vertexLngLat);
        const distSq = getDistSq(pointPx, vertexPx);
        if (
            distSq < nearestVertexDist &&
            distSq <= VERTEX_SNAP_THRESHOLD_PX ** 2
        ) {
            nearestVertexDist = distSq;
            nearestVertexLngLat = vertexLngLat;
        }
    };

    const processLineString = (line: number[][]) => {
        if (!line || line.length < 2) return;
        for (let i = 0; i < line.length - 1; i++) {
            const start = toCoordinate(line[i]);
            const end = toCoordinate(line[i + 1]);
            if (!start || !end) continue;

            processVertex(start);
            if (i === line.length - 2) processVertex(end);

            const p1LngLat = new maplibregl.LngLat(start[0], start[1]);
            const p2LngLat = new maplibregl.LngLat(end[0], end[1]);
            const p1 = map.project(p1LngLat);
            const p2 = map.project(p2LngLat);
            
            const closestPx = getClosestPointOnSegment(pointPx, p1, p2);
            const distSq = getDistSq(pointPx, closestPx);
            
            if (distSq < nearestEdgeDist && distSq <= EDGE_SNAP_THRESHOLD_PX ** 2) {
                nearestEdgeDist = distSq;
                nearestEdgeLngLat = map.unproject(closestPx);
            }
        }
    };

    const processPoint = (coordinate: unknown) => {
        const point = toCoordinate(coordinate);
        if (point) processVertex(point);
    };

    for (const feature of features) {
        if (!feature.geometry) continue;
        
        // Bỏ qua các layer preview hoặc edit để không tự snap vào nét đang vẽ dở.
        if (feature.layer.id.includes("preview") || feature.layer.id.includes("edit-")) {
            continue;
        }

        const type = feature.geometry.type;
        if (type === "GeometryCollection") continue;
        const coords = (feature.geometry as GeometryWithCoordinates).coordinates;

        // Xử lý cả Polygon và LineString vì viền bản đồ (border) đôi khi được render dưới dạng LineString
        if (type === "Polygon") {
            for (const ring of asCoordinateMatrix(coords)) processLineString(ring);
        } else if (type === "MultiPolygon") {
            for (const poly of asCoordinateTensor(coords)) {
                for (const ring of poly) processLineString(ring);
            }
        } else if (type === "LineString") {
            processLineString(asCoordinateArray(coords));
        } else if (type === "MultiLineString") {
            for (const line of asCoordinateMatrix(coords)) processLineString(line);
        } else if (type === "Point") {
            processPoint(coords);
        } else if (type === "MultiPoint") {
            for (const point of asCoordinateArray(coords)) processPoint(point);
        }
    }

    return nearestVertexLngLat || nearestEdgeLngLat || lngLat;
}

function getSnapLayerIds(map: maplibregl.Map): string[] {
    const systemGeometrySources = new Set(["countries", "places", PATH_ARROW_SOURCE_ID]);
    const style = map.getStyle();
    if (!style?.layers?.length) return [];

    return style.layers
        .filter((layer) => {
            if (!("source" in layer)) return false;
            if (!systemGeometrySources.has(String(layer.source))) return false;
            if (layer.id.includes("preview") || layer.id.includes("edit-")) return false;
            return true;
        })
        .map((layer) => layer.id)
        .filter((layerId) => Boolean(map.getLayer(layerId)));
}

function toCoordinate(value: unknown): Coordinate | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

function asCoordinateArray(value: unknown): number[][] {
    return Array.isArray(value) ? value as number[][] : [];
}

function asCoordinateMatrix(value: unknown): number[][][] {
    return Array.isArray(value) ? value as number[][][] : [];
}

function asCoordinateTensor(value: unknown): number[][][][] {
    return Array.isArray(value) ? value as number[][][][] : [];
}
