import maplibregl from "maplibre-gl";

// SHIFT/ALT snap should be forgiving while drawing quickly.
// Vertices get a larger radius and always win over edges when both are available.
const VERTEX_SNAP_THRESHOLD_PX = 34;
const EDGE_SNAP_THRESHOLD_PX = 24;
const QUERY_THRESHOLD_PX = Math.max(VERTEX_SNAP_THRESHOLD_PX, EDGE_SNAP_THRESHOLD_PX);
const COORDINATE_EPSILON = 1e-10;
const SEGMENT_ENDPOINT_EPSILON = 1e-7;

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

export function getSnapVertexCoordinate(snap: SnapResult): [number, number] | null {
    if (snap.type !== "vertex" || snap.vertexIdx === undefined || !snap.ringCoords) return null;
    const coordinate = snap.ringCoords[snap.vertexIdx];
    return coordinate ? [coordinate[0], coordinate[1]] : null;
}

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

    // Tìm t của điểm gần nhất trên đoạn thẳng [a, b] so với điểm p (tính trên pixel màn hình)
    const getClosestTOnSegment = (p: maplibregl.Point, a: maplibregl.Point, b: maplibregl.Point): number => {
        const atob = { x: b.x - a.x, y: b.y - a.y };
        const atop = { x: p.x - a.x, y: p.y - a.y };
        const lenSq = atob.x * atob.x + atob.y * atob.y;
        if (lenSq === 0) return 0;
        
        let t = (atop.x * atob.x + atop.y * atob.y) / lenSq;
        t = Math.max(0, Math.min(1, t));

        return t;
    };

    const getPointOnSegment = (a: maplibregl.Point, b: maplibregl.Point, t: number): maplibregl.Point => {
        return new maplibregl.Point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    };

    // Nội suy trên Mercator bằng đúng t pixel đã chọn để điểm snap nằm ổn định trên đoạn gốc.
    const getPointOnLngLatSegment = (a: Coordinate, b: Coordinate, t: number): maplibregl.LngLat => {
        if (t <= SEGMENT_ENDPOINT_EPSILON) return new maplibregl.LngLat(a[0], a[1]);
        if (t >= 1 - SEGMENT_ENDPOINT_EPSILON) return new maplibregl.LngLat(b[0], b[1]);

        const toMercatorY = (lat: number) => {
            if (lat > 85.0511) lat = 85.0511;
            if (lat < -85.0511) lat = -85.0511;
            return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
        };

        const fromMercatorY = (y: number) => {
            return (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;
        };

        const ax = a[0];
        const ay = toMercatorY(a[1]);
        const bx = b[0];
        const by = toMercatorY(b[1]);

        const resultLng = ax + (bx - ax) * t;
        const resultLat = fromMercatorY(ay + (by - ay) * t);

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

    const processLineString = (line: number[][], featureId: string | number | undefined, forceClosed = false) => {
        if (!line || line.length < 2) return;
        const parsedCoords = line.map(c => toCoordinate(c)).filter((c): c is Coordinate => c !== null);
        const treatAsClosed = forceClosed || isClosedRing(parsedCoords);
        const lineCoords = treatAsClosed ? removeClosingCoordinate(parsedCoords) : parsedCoords;
        if (lineCoords.length < 2) return;

        const ringForSnap = treatAsClosed ? closeRing(lineCoords) : lineCoords;
        for (let i = 0; i < lineCoords.length; i++) {
            processVertex(lineCoords[i], featureId, ringForSnap, i);
        }

        const segmentCount = treatAsClosed ? lineCoords.length : lineCoords.length - 1;
        for (let i = 0; i < segmentCount; i++) {
            const start = lineCoords[i];
            const end = lineCoords[(i + 1) % lineCoords.length];

            const p1LngLat = new maplibregl.LngLat(start[0], start[1]);
            const p2LngLat = new maplibregl.LngLat(end[0], end[1]);
            const p1 = map.project(p1LngLat);
            const p2 = map.project(p2LngLat);
            
            const closestT = getClosestTOnSegment(pointPx, p1, p2);
            const closestPx = getPointOnSegment(p1, p2, closestT);
            const distSq = getDistSq(pointPx, closestPx);
            
            if (distSq < nearestEdgeDist && distSq <= EDGE_SNAP_THRESHOLD_PX ** 2) {
                nearestEdgeDist = distSq;
                nearestEdgeLngLat = getPointOnLngLatSegment(start, end, closestT);
                nearestEdgeFeatureId = featureId;
                nearestEdgeRing = ringForSnap;
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
            for (const ring of asCoordinateMatrix(coords)) processLineString(ring, fId, true);
        } else if (type === "MultiPolygon") {
            for (const poly of asCoordinateTensor(coords)) {
                for (const ring of poly) processLineString(ring, fId, true);
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
    const systemGeometrySources = new Set(["countries", "places"]);
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
    const isClosed = isClosedRing(ring);
    const workingRing = (isClosed ? ring.slice(0, -1) : ring) as [number, number][];
    const n = workingRing.length;
    const normalizedStartIdx = isClosed && startIdx === ring.length - 1 ? 0 : startIdx;
    const normalizedEndIdx = isClosed && endIdx === ring.length - 1 ? 0 : endIdx;

    if (normalizedStartIdx < 0 || normalizedStartIdx >= n || normalizedEndIdx < 0 || normalizedEndIdx >= n) {
        return [];
    }

    if (normalizedStartIdx === normalizedEndIdx) {
        return [workingRing[normalizedStartIdx]];
    }

    if (!isClosed) {
        // Case LineString
        if (normalizedStartIdx <= normalizedEndIdx) {
            return workingRing.slice(normalizedStartIdx, normalizedEndIdx + 1);
        } else {
            return workingRing.slice(normalizedEndIdx, normalizedStartIdx + 1).reverse();
        }
    }

    // Case Closed Polygon
    // Path 1: Forward
    const path1: [number, number][] = [];
    let idx = normalizedStartIdx;
    while (idx !== normalizedEndIdx) {
        path1.push(workingRing[idx]);
        idx = (idx + 1) % n;
    }
    path1.push(workingRing[normalizedEndIdx]);

    // Path 2: Backward
    const path2: [number, number][] = [];
    idx = normalizedStartIdx;
    while (idx !== normalizedEndIdx) {
        path2.push(workingRing[idx]);
        idx = (idx - 1 + n) % n;
    }
    path2.push(workingRing[normalizedEndIdx]);

    const poly1 = [...path1, workingRing[normalizedStartIdx]];
    const poly2 = [...path2, workingRing[normalizedStartIdx]];

    const area1 = getArea(poly1);
    const area2 = getArea(poly2);

    return area1 <= area2 ? path1 : path2;
}

export function getRingWithSnaps(
    ring: Coordinate[],
    snap1: { type: "vertex" | "edge"; vertexIdx?: number; edgeIdx?: number; lngLat: { lng: number; lat: number } },
    snap2: { type: "vertex" | "edge"; vertexIdx?: number; edgeIdx?: number; lngLat: { lng: number; lat: number } }
): { ring: Coordinate[]; idx1: number; idx2: number } {
    const closed = isClosedRing(ring);
    const sourceRing = removeClosingCoordinate(ring);
    const insertionGroups = new Map<number, Array<{ coord: Coordinate; t: number; owners: Set<1 | 2> }>>();

    type NormalizedSnap =
        | { type: "vertex"; vertexIdx: number }
        | { type: "edge"; edgeIdx: number; coord: Coordinate; owner: 1 | 2; t: number };

    const normalizeSnap = (
        snap: typeof snap1,
        owner: 1 | 2
    ): NormalizedSnap | null => {
        const coord: Coordinate = [snap.lngLat.lng, snap.lngLat.lat];
        if (snap.type === "vertex") {
            const vertexIdx = normalizeVertexIndex(snap.vertexIdx, sourceRing.length, closed);
            return vertexIdx === null ? null : { type: "vertex", vertexIdx };
        }

        const edgeIdx = snap.edgeIdx;
        if (edgeIdx === undefined || edgeIdx < 0 || edgeIdx >= sourceRing.length) return null;
        if (!closed && edgeIdx >= sourceRing.length - 1) return null;

        const startIdx = edgeIdx;
        const endIdx = (edgeIdx + 1) % sourceRing.length;
        const start = sourceRing[startIdx];
        const end = sourceRing[endIdx];
        if (coordinatesAlmostEqual(coord, start)) return { type: "vertex", vertexIdx: startIdx };
        if (coordinatesAlmostEqual(coord, end)) return { type: "vertex", vertexIdx: endIdx };

        return {
            type: "edge",
            edgeIdx,
            coord,
            owner,
            t: segmentProgress(coord, start, end),
        };
    };

    const normalized1 = normalizeSnap(snap1, 1);
    const normalized2 = normalizeSnap(snap2, 2);

    for (const normalized of [normalized1, normalized2]) {
        if (!normalized || normalized.type !== "edge") continue;
        const group = insertionGroups.get(normalized.edgeIdx) || [];
        const existing = group.find((item) => coordinatesAlmostEqual(item.coord, normalized.coord));
        if (existing) {
            existing.owners.add(normalized.owner);
        } else {
            group.push({ coord: normalized.coord, t: normalized.t, owners: new Set([normalized.owner]) });
        }
        insertionGroups.set(normalized.edgeIdx, group);
    }

    const builtRing: Coordinate[] = [];
    const vertexIndexMap = new Map<number, number>();
    const edgeIndexMap = new Map<1 | 2, number>();

    for (let i = 0; i < sourceRing.length; i++) {
        vertexIndexMap.set(i, builtRing.length);
        builtRing.push(sourceRing[i]);

        const group = insertionGroups.get(i);
        if (!group) continue;

        group
            .sort((a, b) => a.t - b.t)
            .forEach((item) => {
                const existingIdx = builtRing.findIndex((coord) => coordinatesAlmostEqual(coord, item.coord));
                const idx = existingIdx >= 0 ? existingIdx : builtRing.length;
                if (existingIdx < 0) builtRing.push(item.coord);
                for (const owner of item.owners) {
                    edgeIndexMap.set(owner, idx);
                }
            });
    }

    if (closed) {
        builtRing.push(builtRing[0]);
    }

    const resolveIndex = (normalized: NormalizedSnap | null, owner: 1 | 2): number => {
        if (!normalized) return -1;
        if (normalized.type === "vertex") return vertexIndexMap.get(normalized.vertexIdx) ?? -1;
        return edgeIndexMap.get(owner) ?? -1;
    };

    return {
        ring: builtRing,
        idx1: resolveIndex(normalized1, 1),
        idx2: resolveIndex(normalized2, 2),
    };
}

function coordinatesAlmostEqual(a: Coordinate, b: Coordinate, epsilon = COORDINATE_EPSILON): boolean {
    return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function isClosedRing(ring: Coordinate[]): boolean {
    return ring.length > 2 && coordinatesAlmostEqual(ring[0], ring[ring.length - 1]);
}

function removeClosingCoordinate(ring: Coordinate[]): Coordinate[] {
    if (!isClosedRing(ring)) return [...ring];
    return ring.slice(0, -1);
}

function closeRing(ring: Coordinate[]): Coordinate[] {
    if (ring.length === 0 || isClosedRing(ring)) return [...ring];
    return [...ring, ring[0]];
}

function normalizeVertexIndex(idx: number | undefined, uniqueLength: number, closed: boolean): number | null {
    if (idx === undefined || uniqueLength <= 0) return null;
    if (idx >= 0 && idx < uniqueLength) return idx;
    if (closed && idx === uniqueLength) return 0;
    return null;
}

function segmentProgress(coord: Coordinate, start: Coordinate, end: Coordinate): number {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return 0;
    const t = ((coord[0] - start[0]) * dx + (coord[1] - start[1]) * dy) / lenSq;
    return Math.max(0, Math.min(1, t));
}

export function getOriginalFeature(
    map: maplibregl.Map,
    sourceId: string,
    featureId: string | number | undefined
): GeoJSON.Feature | null {
    if (featureId === undefined || featureId === null) return null;

    // 1. Prefer the exact GeoJSON data for the rendered source. This avoids mixing geometries
    // when different sources/layers reuse the same feature id.
    const source = map.getSource(sourceId) as SourceWithInternalData | undefined;
    if (source && source._data) {
        const found = findFeatureInSourceData(source._data, featureId);
        if (found) return found;
    }

    // 2. Fallback to the React/Zustand draft ref attached to the map instance.
    const renderDraft = (map as MapWithRenderDraft)._renderDraftRef?.current;
    if (renderDraft && Array.isArray(renderDraft.features)) {
        const found = renderDraft.features.find((f) => {
            const id = f.properties?.id ?? f.id;
            return id !== undefined && String(id) === String(featureId);
        });
        if (found) {
            return found;
        }
    }

    return null;
}

function findFeatureInSourceData(
    data: unknown,
    featureId: string | number
): GeoJSON.Feature | null {
    // MapLibre v5 updateable Map lookup
    const updateable = getObjectProperty(data, "updateable");
    if (updateable instanceof Map) {
        const featureMap = updateable as Map<string | number, GeoJSON.Feature>;
        const found = featureMap.get(featureId) || featureMap.get(String(featureId)) || featureMap.get(Number(featureId));
        if (found) {
            return found;
        }
    }

    // Resolve GeoJSON object (MapLibre v5 stores geojson under data.geojson)
    const geojson = getObjectProperty(data, "geojson") || data;

    if (isFeatureCollection(geojson)) {
        const found = geojson.features.find((f: GeoJSON.Feature) => {
            const id = f.properties?.id ?? f.id;
            return id !== undefined && String(id) === String(featureId);
        });
        return found || null;
    }

    if (isFeature(geojson)) {
        const id = geojson.properties?.id ?? geojson.id;
        const matches = id !== undefined && String(id) === String(featureId);
        if (matches) {
            return geojson;
        }
    }

    return null;
}

type MapWithRenderDraft = maplibregl.Map & {
    _renderDraftRef?: {
        current?: {
            features?: GeoJSON.Feature[];
        };
    };
};

type SourceWithInternalData = maplibregl.Source & {
    _data?: unknown;
};

function getObjectProperty(value: unknown, key: string): unknown {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
    return Boolean(
        value &&
        typeof value === "object" &&
        (value as { type?: unknown }).type === "FeatureCollection" &&
        Array.isArray((value as { features?: unknown }).features)
    );
}

function isFeature(value: unknown): value is GeoJSON.Feature {
    return Boolean(
        value &&
        typeof value === "object" &&
        (value as { type?: unknown }).type === "Feature"
    );
}
