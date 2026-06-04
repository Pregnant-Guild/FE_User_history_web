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

export type SnapResult = {
    lngLat: maplibregl.LngLat;
    type: "vertex" | "edge" | "none";
    featureId?: string | number;
    ringCoords?: Coordinate[];
    vertexIdx?: number;
    edgeIdx?: number;
};

export function snapToNearestGeometry(
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat,
    pointPx: maplibregl.Point,
    excludeFeatureId?: string | number | null
): maplibregl.LngLat {
    return snapToNearestGeometryDetailed(map, lngLat, pointPx, excludeFeatureId).lngLat;
}

export function snapToNearestGeometryDetailed(
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat,
    pointPx: maplibregl.Point,
    excludeFeatureId?: string | number | null,
    includeFeatureId?: string | number | null
): SnapResult {
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [pointPx.x - QUERY_THRESHOLD_PX, pointPx.y - QUERY_THRESHOLD_PX],
        [pointPx.x + QUERY_THRESHOLD_PX, pointPx.y + QUERY_THRESHOLD_PX],
    ];

    const snapLayerIds = getSnapLayerIds(map);
    if (!snapLayerIds.length) return { lngLat, type: "none" };

    const features = map.queryRenderedFeatures(bbox, {
        layers: snapLayerIds,
    });

    let nearestVertexDist = Infinity;
    let nearestVertexLngLat: maplibregl.LngLat | null = null;
    let nearestVertexFeatureId: string | number | undefined = undefined;
    let nearestVertexRing: Coordinate[] | null = null;
    let nearestVertexIdx: number = -1;

    let nearestEdgeDist = Infinity;
    let nearestEdgeLngLat: maplibregl.LngLat | null = null;
    let nearestEdgeFeatureId: string | number | undefined = undefined;
    let nearestEdgeRing: Coordinate[] | null = null;
    let nearestEdgeIdx: number = -1;

    const getDistSq = (p1: maplibregl.Point, p2: maplibregl.Point) => {
        return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    };

    // Tìm điểm gần nhất trên đoạn thẳng [a, b] so với điểm p (tính trên pixel màn hình)
    const getClosestPointOnSegment = (p: maplibregl.Point, a: maplibregl.Point, b: maplibregl.Point): maplibregl.Point => {
        const atob = { x: b.x - a.x, y: b.y - a.y };
        const atop = { x: p.x - a.x, y: p.y - a.y };
        const lenSq = atob.x * atob.x + atob.y * atob.y;
        if (lenSq === 0) return new maplibregl.Point(a.x, a.y);
        
        let t = (atop.x * atob.x + atop.y * atob.y) / lenSq;
        t = Math.max(0, Math.min(1, t));
        
        return new maplibregl.Point(a.x + atob.x * t, a.y + atob.y * t);
    };

    // Tìm điểm gần nhất trên đoạn thẳng kinh vĩ độ [a, b] so với tọa độ con trỏ p (bảo toàn độ chính xác 64-bit)
    const getClosestPointOnLngLatSegment = (p: maplibregl.LngLat, a: Coordinate, b: Coordinate): maplibregl.LngLat => {
        const toMercatorY = (lat: number) => {
            if (lat > 85.0511) lat = 85.0511;
            if (lat < -85.0511) lat = -85.0511;
            return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
        };

        const fromMercatorY = (y: number) => {
            return (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;
        };

        const ax = a[0], ay = toMercatorY(a[1]);
        const bx = b[0], by = toMercatorY(b[1]);
        const px = p.lng, py = toMercatorY(p.lat);

        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) return new maplibregl.LngLat(a[0], a[1]);

        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const resultLng = ax + dx * t;
        const resultLat = fromMercatorY(ay + dy * t);

        return new maplibregl.LngLat(resultLng, resultLat);
    };

    const processVertex = (coordinate: Coordinate, featureId: string | number | undefined, ring: Coordinate[], idx: number) => {
        const vertexLngLat = new maplibregl.LngLat(coordinate[0], coordinate[1]);
        const vertexPx = map.project(vertexLngLat);
        const distSq = getDistSq(pointPx, vertexPx);
        if (
            distSq < nearestVertexDist &&
            distSq <= VERTEX_SNAP_THRESHOLD_PX ** 2
        ) {
            nearestVertexDist = distSq;
            nearestVertexLngLat = vertexLngLat;
            nearestVertexFeatureId = featureId;
            nearestVertexRing = ring;
            nearestVertexIdx = idx;
        }
    };

    const processLineString = (line: number[][], featureId: string | number | undefined) => {
        if (!line || line.length < 2) return;
        const lineCoords = line.map(c => toCoordinate(c)).filter((c): c is Coordinate => c !== null);
        for (let i = 0; i < lineCoords.length - 1; i++) {
            const start = lineCoords[i];
            const end = lineCoords[i + 1];

            processVertex(start, featureId, lineCoords, i);
            if (i === lineCoords.length - 2) {
                processVertex(end, featureId, lineCoords, i + 1);
            }

            const p1LngLat = new maplibregl.LngLat(start[0], start[1]);
            const p2LngLat = new maplibregl.LngLat(end[0], end[1]);
            const p1 = map.project(p1LngLat);
            const p2 = map.project(p2LngLat);
            
            const closestPx = getClosestPointOnSegment(pointPx, p1, p2);
            const distSq = getDistSq(pointPx, closestPx);
            
            if (distSq < nearestEdgeDist && distSq <= EDGE_SNAP_THRESHOLD_PX ** 2) {
                nearestEdgeDist = distSq;
                nearestEdgeLngLat = getClosestPointOnLngLatSegment(lngLat, start, end);
                nearestEdgeFeatureId = featureId;
                nearestEdgeRing = lineCoords;
                nearestEdgeIdx = i;
            }
        }
    };

    const processPoint = (coordinate: unknown, featureId: string | number | undefined) => {
        const point = toCoordinate(coordinate);
        if (point) processVertex(point, featureId, [point], 0);
    };

    for (const feature of features) {
        if (!feature.geometry) continue;
        
        // Bỏ qua các layer preview hoặc edit để không tự snap vào nét đang vẽ dở.
        if (feature.layer.id.includes("preview") || feature.layer.id.includes("edit-")) {
            continue;
        }

        // Bỏ qua chính đối tượng đang được chỉnh sửa để không tự snap vào chính nó
        const fId = feature.properties?.id ?? feature.id;
        if (excludeFeatureId !== undefined && excludeFeatureId !== null && fId !== undefined && fId !== null) {
            if (String(fId) === String(excludeFeatureId)) {
                continue;
            }
        }
        if (includeFeatureId !== undefined && includeFeatureId !== null && fId !== undefined && fId !== null) {
            if (String(fId) !== String(includeFeatureId)) {
                continue;
            }
        }

        let geometry = feature.geometry;
        const sourceId = feature.layer.source;
        const origFeature = getOriginalFeature(map, sourceId, fId);
        if (origFeature && origFeature.geometry) {
            geometry = origFeature.geometry;
        }

        const type = geometry.type;
        if (type === "GeometryCollection") continue;
        const coords = (geometry as GeometryWithCoordinates).coordinates;

        // Xử lý cả Polygon và LineString vì viền bản đồ (border) đôi khi được render dưới dạng LineString
        if (type === "Polygon") {
            for (const ring of asCoordinateMatrix(coords)) processLineString(ring, fId);
        } else if (type === "MultiPolygon") {
            for (const poly of asCoordinateTensor(coords)) {
                for (const ring of poly) processLineString(ring, fId);
            }
        } else if (type === "LineString") {
            processLineString(asCoordinateArray(coords), fId);
        } else if (type === "MultiLineString") {
            for (const line of asCoordinateMatrix(coords)) processLineString(line, fId);
        } else if (type === "Point") {
            processPoint(coords, fId);
        } else if (type === "MultiPoint") {
            for (const point of asCoordinateArray(coords)) processPoint(point, fId);
        }
    }

    if (nearestVertexLngLat) {
        return {
            lngLat: nearestVertexLngLat,
            type: "vertex",
            featureId: nearestVertexFeatureId,
            ringCoords: nearestVertexRing || undefined,
            vertexIdx: nearestVertexIdx
        };
    }
    if (nearestEdgeLngLat && nearestEdgeRing) {
        const edgeLngLat = nearestEdgeLngLat as maplibregl.LngLat;
        const edgeRing = nearestEdgeRing as Coordinate[];
        return {
            lngLat: edgeLngLat,
            type: "edge",
            featureId: nearestEdgeFeatureId,
            ringCoords: edgeRing,
            edgeIdx: nearestEdgeIdx
        };
    }
    return { lngLat, type: "none" };
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

export function getArea(points: [number, number][]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        area += (p1[0] + p2[0]) * (p1[1] - p2[1]);
    }
    return Math.abs(area / 2);
}

export function tracePathBetweenPoints(
    ring: [number, number][],
    startIdx: number,
    endIdx: number
): [number, number][] {
    const n = ring.length;
    if (startIdx < 0 || startIdx >= n || endIdx < 0 || endIdx >= n) {
        return [];
    }

    const isClosed = n > 2 &&
        Math.abs(ring[0][0] - ring[n - 1][0]) < 1e-9 &&
        Math.abs(ring[0][1] - ring[n - 1][1]) < 1e-9;

    if (!isClosed) {
        // Case LineString
        if (startIdx <= endIdx) {
            return ring.slice(startIdx, endIdx + 1);
        } else {
            return ring.slice(endIdx, startIdx + 1).reverse();
        }
    }

    // Case Closed Polygon
    // Path 1: Forward
    const path1: [number, number][] = [];
    let idx = startIdx;
    while (idx !== endIdx) {
        path1.push(ring[idx]);
        idx = (idx + 1) % n;
    }
    path1.push(ring[endIdx]);

    // Path 2: Backward
    const path2: [number, number][] = [];
    idx = startIdx;
    while (idx !== endIdx) {
        path2.push(ring[idx]);
        idx = (idx - 1 + n) % n;
    }
    path2.push(ring[endIdx]);

    const poly1 = [...path1, ring[startIdx]];
    const poly2 = [...path2, ring[startIdx]];

    const area1 = getArea(poly1);
    const area2 = getArea(poly2);

    return area1 <= area2 ? path1 : path2;
}

export function getRingWithSnaps(
    ring: Coordinate[],
    snap1: { type: "vertex" | "edge"; vertexIdx?: number; edgeIdx?: number; lngLat: { lng: number; lat: number } },
    snap2: { type: "vertex" | "edge"; vertexIdx?: number; edgeIdx?: number; lngLat: { lng: number; lat: number } }
): { ring: Coordinate[]; idx1: number; idx2: number } {
    let tempRing = [...ring];
    
    const coord1: Coordinate = [snap1.lngLat.lng, snap1.lngLat.lat];
    const coord2: Coordinate = [snap2.lngLat.lng, snap2.lngLat.lat];

    let idx1 = -1;
    let idx2 = -1;

    if (snap1.type === "vertex" && snap2.type === "vertex") {
        idx1 = snap1.vertexIdx!;
        idx2 = snap2.vertexIdx!;
    } else if (snap1.type === "vertex" && snap2.type === "edge") {
        idx1 = snap1.vertexIdx!;
        const eIdx2 = snap2.edgeIdx!;
        tempRing.splice(eIdx2 + 1, 0, coord2);
        idx2 = eIdx2 + 1;
        if (idx1 > eIdx2) {
            idx1 += 1;
        }
    } else if (snap1.type === "edge" && snap2.type === "vertex") {
        idx2 = snap2.vertexIdx!;
        const eIdx1 = snap1.edgeIdx!;
        tempRing.splice(eIdx1 + 1, 0, coord1);
        idx1 = eIdx1 + 1;
        if (idx2 > eIdx1) {
            idx2 += 1;
        }
    } else {
        const eIdx1 = snap1.edgeIdx!;
        const eIdx2 = snap2.edgeIdx!;

        if (eIdx1 < eIdx2) {
            tempRing.splice(eIdx2 + 1, 0, coord2);
            tempRing.splice(eIdx1 + 1, 0, coord1);
            idx1 = eIdx1 + 1;
            idx2 = eIdx2 + 2;
        } else if (eIdx1 > eIdx2) {
            tempRing.splice(eIdx1 + 1, 0, coord1);
            tempRing.splice(eIdx2 + 1, 0, coord2);
            idx1 = eIdx1 + 2;
            idx2 = eIdx2 + 1;
        } else {
            const segStart = ring[eIdx1];
            const dist1 = Math.hypot(coord1[0] - segStart[0], coord1[1] - segStart[1]);
            const dist2 = Math.hypot(coord2[0] - segStart[0], coord2[1] - segStart[1]);

            if (dist1 <= dist2) {
                tempRing.splice(eIdx1 + 1, 0, coord1, coord2);
                idx1 = eIdx1 + 1;
                idx2 = eIdx1 + 2;
            } else {
                tempRing.splice(eIdx1 + 1, 0, coord2, coord1);
                idx1 = eIdx1 + 2;
                idx2 = eIdx1 + 1;
            }
        }
    }

    return { ring: tempRing, idx1, idx2 };
}

export function getOriginalFeature(
    map: maplibregl.Map,
    sourceId: string,
    featureId: string | number | undefined
): GeoJSON.Feature | null {
    if (featureId === undefined || featureId === null) return null;

    // 1. Prioritize direct lookup inside the React/Zustand draft ref attached to the map instance.
    // This contains the exact, unsimplified 64-bit coordinates for all local, baseline, and global features.
    const renderDraft = (map as any)._renderDraftRef?.current;
    if (renderDraft && Array.isArray(renderDraft.features)) {
        const found = renderDraft.features.find((f: any) => {
            const id = f.properties?.id ?? f.id;
            return id !== undefined && String(id) === String(featureId);
        });
        if (found) {
            console.log(`[DEBUG] getOriginalFeature: found featureId=${featureId} in map._renderDraftRef`);
            return found;
        }
    }

    // 2. Fallback to MapLibre's GeoJSONSource internal cache.
    const source = map.getSource(sourceId) as any;
    if (!source || !source._data) {
        console.log(`[DEBUG] getOriginalFeature: sourceId=${sourceId} source/data not found`);
        return null;
    }

    const data = source._data;

    // MapLibre v5 updateable Map lookup
    if (data.updateable instanceof Map) {
        const found = data.updateable.get(featureId) || data.updateable.get(String(featureId)) || data.updateable.get(Number(featureId));
        if (found) {
            console.log(`[DEBUG] getOriginalFeature: sourceId=${sourceId}, featureId=${featureId}, found in updateable Map`);
            return found;
        }
    }

    // Resolve GeoJSON object (MapLibre v5 stores geojson under data.geojson)
    const geojson = data.geojson || data;

    if (typeof geojson === "object" && geojson !== null) {
        if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
            const found = geojson.features.find((f: any) => {
                const id = f.properties?.id ?? f.id;
                return id !== undefined && String(id) === String(featureId);
            });
            console.log(`[DEBUG] getOriginalFeature: sourceId=${sourceId}, featureId=${featureId}, found in geojson collection=${!!found}`);
            return found || null;
        } else if (geojson.type === "Feature") {
            const id = geojson.properties?.id ?? geojson.id;
            const matches = id !== undefined && String(id) === String(featureId);
            console.log(`[DEBUG] getOriginalFeature: sourceId=${sourceId}, featureId=${featureId}, matched_single=${matches}`);
            if (matches) {
                return geojson;
            }
        }
    }

    console.log(`[DEBUG] getOriginalFeature: sourceId=${sourceId}, data format not recognized`, data);
    return null;
}
