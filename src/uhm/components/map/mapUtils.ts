import maplibregl from "maplibre-gl";
import { BACKGROUND_LAYER_OPTIONS, BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { Feature, FeatureCollection, Geometry } from "@/uhm/lib/editor/state/useEditorState";
import {
    FEATURE_STATE_SOURCE_IDS,
    PATH_ARROW_ICON_ID,
    RASTER_BASE_INSERT_BEFORE_LAYER_ID,
    RASTER_BASE_LAYER_ID,
    RASTER_BASE_SOURCE_ID,
    PATH_ARROW_SOURCE_ID
} from "@/uhm/lib/map/constants";
import { PATH_RENDER_BY_TYPE } from "@/uhm/lib/map/styles/style";
import { getRasterTileTemplateUrl } from "@/uhm/api/tiles";
import { newId } from "@/uhm/lib/utils/id";

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type LabelCell = {
    x: number;
    y: number;
    h: number;
    d: number;
    max: number;
};

export function applyBackgroundLayerVisibility(
    map: maplibregl.Map,
    visibility: BackgroundLayerVisibility
) {
    syncRasterBaseVisibility(map, visibility[RASTER_BASE_LAYER_ID]);

    for (const layer of BACKGROUND_LAYER_OPTIONS) {
        if (layer.id === RASTER_BASE_LAYER_ID) continue;
        if (!map.getLayer(layer.id)) continue;
        map.setLayoutProperty(
            layer.id,
            "visibility",
            visibility[layer.id] ? "visible" : "none"
        );
    }
}

export function syncRasterBaseVisibility(map: maplibregl.Map, shouldShow: boolean) {
    if (shouldShow) {
        ensureRasterBaseLayer(map);
        return;
    }
    removeRasterBaseLayer(map);
}

export function ensureRasterBaseLayer(map: maplibregl.Map) {
    if (!map.getSource(RASTER_BASE_SOURCE_ID)) {
        map.addSource(RASTER_BASE_SOURCE_ID, createRasterBaseSource());
    }

    if (!map.getLayer(RASTER_BASE_LAYER_ID)) {
        const beforeId = map.getLayer(RASTER_BASE_INSERT_BEFORE_LAYER_ID)
            ? RASTER_BASE_INSERT_BEFORE_LAYER_ID
            : undefined;
        map.addLayer(createRasterBaseLayer(), beforeId);
    }

    map.setLayoutProperty(RASTER_BASE_LAYER_ID, "visibility", "visible");
}

export function removeRasterBaseLayer(map: maplibregl.Map) {
    if (map.getLayer(RASTER_BASE_LAYER_ID)) {
        map.removeLayer(RASTER_BASE_LAYER_ID);
    }

    if (map.getSource(RASTER_BASE_SOURCE_ID)) {
        map.removeSource(RASTER_BASE_SOURCE_ID);
    }
}

export function createRasterBaseSource() {
    return {
        type: "raster" as const,
        tiles: [getRasterTileTemplateUrl()],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 6,
    };
}

export function createRasterBaseLayer() {
    return {
        id: RASTER_BASE_LAYER_ID,
        type: "raster" as const,
        source: RASTER_BASE_SOURCE_ID,
        paint: {
            "raster-opacity": 0.92,
            "raster-resampling": "linear" as const,
        },
    };
}

export function getSelectableLayers(map: maplibregl.Map): string[] {
    const selectableSources = ["countries", "places", PATH_ARROW_SOURCE_ID];
    const style = map.getStyle();
    if (!style || !style.layers) return [];
    
    return style.layers
        .filter((layer) => "source" in layer && selectableSources.includes(layer.source as string))
        .map((layer) => layer.id);
}

export function filterDraftByBinding(
    fc: FeatureCollection,
    selectedFeatureIds: (string | number)[],
    highlightFeatures?: FeatureCollection | null
): FeatureCollection {
    const selectedIds = new Set(selectedFeatureIds.map(String));
    if (highlightFeatures?.features) {
        for (const f of highlightFeatures.features) {
            if (f.properties?.id != null) selectedIds.add(String(f.properties.id));
        }
    }

    const childIds = new Set<string>();
    for (const feature of fc.features) {
        for (const id of normalizeBindingIds(feature.properties.binding)) {
            childIds.add(id);
        }
    }

    if (selectedIds.size === 0) {
        return { ...fc, features: fc.features.filter((f) => !childIds.has(String(f.properties.id))) };
    }

    const selectedChildren = new Set<string>();
    for (const feature of fc.features) {
        if (selectedIds.has(String(feature.properties.id))) {
            for (const id of normalizeBindingIds(feature.properties.binding)) {
                selectedChildren.add(id);
            }
        }
    }

    return {
        ...fc,
        features: fc.features.filter((feature) => {
            const featureId = String(feature.properties.id);
            if (selectedIds.has(featureId)) return true;
            if (selectedChildren.has(featureId)) return true;
            return !childIds.has(featureId);
        }),
    };
}

export function filterDraftByGeometryVisibility(
    fc: FeatureCollection,
    visibility: Record<string, boolean> | null | undefined
): FeatureCollection {
    if (!visibility) return fc;

    return {
        ...fc,
        features: fc.features.filter((feature) => {
            const key = getFeatureSemanticType(feature);
            if (!key) return true;
            return visibility[key] !== false;
        }),
    };
}

export function normalizeBindingIds(rawBinding: unknown): string[] {
    if (!Array.isArray(rawBinding)) return [];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawId of rawBinding) {
        if (typeof rawId !== "string" && typeof rawId !== "number") continue;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }
    return deduped;
}

export function splitDraftFeatures(fc: FeatureCollection) {
    const polygons = {
        type: "FeatureCollection",
        features: fc.features.filter((f) =>
            f.geometry.type !== "Point" && f.geometry.type !== "MultiPoint"
        ),
    } as FeatureCollection;

    const points = {
        type: "FeatureCollection",
        features: fc.features.filter((f) =>
            f.geometry.type === "Point" || f.geometry.type === "MultiPoint"
        ),
    } as FeatureCollection;

    return { polygons, points };
}

export function decoratePointFeaturesWithLabels(fc: FeatureCollection): FeatureCollection {
    return {
        ...fc,
        features: fc.features.map((feature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                point_label: getSingleEntityFeatureLabel(feature),
            },
        })),
    };
}

export function buildPolygonLabelFeatureCollection(fc: FeatureCollection): FeatureCollection {
    const features: Feature[] = [];

    for (const feature of fc.features) {
        const label = getSingleEntityFeatureLabel(feature);
        if (!label) continue;

        const labelPoint = getPolygonLabelPoint(feature.geometry);
        if (!labelPoint) continue;

        features.push({
            type: "Feature",
            properties: {
                ...feature.properties,
                id: `${feature.properties.id}:polygon-label`,
                polygon_label: label,
            },
            geometry: {
                type: "Point",
                coordinates: labelPoint,
            },
        });
    }

    return { type: "FeatureCollection", features };
}

export function setSelectedFeatureState(
    map: maplibregl.Map,
    id: string | number | null,
    selected: boolean
) {
    if (id === null) return;
    for (const sourceId of FEATURE_STATE_SOURCE_IDS) {
        if (!map.getSource(sourceId)) continue;
        map.setFeatureState({ source: sourceId, id }, { selected });
    }
}

export function fitMapToFeatureCollection(
    map: maplibregl.Map,
    fc: FeatureCollection,
    padding?: number | maplibregl.PaddingOptions
): boolean {
    const bbox = getFeatureCollectionBBox(fc);
    if (!bbox) return false;

    const resolvedPadding = typeof padding === "number" || padding ? padding : 58;

    const lngSpan = Math.abs(bbox.maxLng - bbox.minLng);
    const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
    if (lngSpan < 0.000001 && latSpan < 0.000001) {
        map.easeTo({
            center: [bbox.minLng, bbox.minLat],
            zoom: 6,
            padding: resolvedPadding,
            duration: 0,
        });
        return true;
    }

    map.fitBounds(
        [
            [bbox.minLng, bbox.minLat],
            [bbox.maxLng, bbox.maxLat],
        ],
        {
            padding: resolvedPadding,
            maxZoom: 7,
            duration: 0,
        }
    );
    return true;
}

export function getFeatureCollectionBBox(
    fc: FeatureCollection
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
    const points = fc.features.flatMap((feature) => collectCoordinatePairs(feature.geometry.coordinates));
    if (!points.length) return null;

    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    for (const [lng, lat] of points) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    }

    return { minLng, minLat, maxLng, maxLat };
}

export function collectCoordinatePairs(value: unknown): Array<[number, number]> {
    if (!Array.isArray(value)) return [];
    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
    ) {
        return [[value[0], value[1]]];
    }
    return value.flatMap((item) => collectCoordinatePairs(item));
}

export function buildPathArrowFeatureCollection(fc: FeatureCollection): FeatureCollection {
    const features = fc.features
        .map((feature) => {
            if (!isPathFeature(feature) || feature.geometry.type !== "LineString") return null;
            const geometry = buildPathArrowGeometry(feature.geometry.coordinates);
            if (!geometry) return null;
            return {
                type: "Feature" as const,
                properties: { ...feature.properties },
                geometry,
            };
        })
        .filter((feature): feature is Feature => feature !== null);

    return {
        type: "FeatureCollection",
        features,
    };
}

export function isPathFeature(feature: Feature): boolean {
    const featureType = getFeatureSemanticType(feature);
    return Boolean(featureType && PATH_RENDER_BY_TYPE[featureType]);
}

export function getFeatureSemanticType(feature: Feature): string | null {
    const value = feature.properties.type || feature.properties.entity_type_id || null;
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase();
    return normalized.length ? normalized : null;
}

export function buildPathArrowGeometry(coords: [number, number][]): Geometry | null {
    const sourceCoords = removeDuplicatePathCoords(coords);
    if (sourceCoords.length < 2) return null;

    const origin = sourceCoords[0];
    const originLatRad = toRadians(origin[1]);
    const cosOriginLat = Math.max(Math.cos(originLatRad), 0.000001);
    const projected = sourceCoords.map((coord) => projectLngLat(coord, origin, cosOriginLat));
    const measured = buildMeasuredPath(projected);
    const totalLength = measured[measured.length - 1]?.distance || 0;
    if (totalLength <= 0) return null;

    const headLength = clampNumber(totalLength * 0.24, totalLength * 0.12, totalLength * 0.45);
    const bodyEndDistance = Math.max(totalLength - headLength, totalLength * 0.35);
    const bodyPoints = measured
        .filter((point) => point.distance < bodyEndDistance)
        .map(({ x, y, distance }) => ({ x, y, distance }));
    bodyPoints.push(pointAtDistance(measured, bodyEndDistance));

    if (bodyPoints.length < 2) return null;

    const tailWidth = clampNumber(totalLength * 0.005, 8000, 40000);
    const shoulderWidth = clampNumber(totalLength * 0.015, 18000, 100000);
    const headWidth = shoulderWidth * 2.0;

    const leftBody: ProjectedPoint[] = [];
    const rightBody: ProjectedPoint[] = [];

    for (let i = 0; i < bodyPoints.length; i += 1) {
        const point = bodyPoints[i];
        const normal = normalAt(bodyPoints, i);
        const progress = bodyEndDistance > 0
            ? Math.pow(clampNumber(point.distance / bodyEndDistance, 0, 1), 0.9)
            : 0;
        const width = tailWidth + (shoulderWidth - tailWidth) * progress;
        const half = width / 2;
        leftBody.push({
            x: point.x + normal.x * half,
            y: point.y + normal.y * half,
        });
        rightBody.push({
            x: point.x - normal.x * half,
            y: point.y - normal.y * half,
        });
    }

    const base = bodyPoints[bodyPoints.length - 1];
    const tip = pointAtDistance(measured, totalLength);
    const headNormal = normalFromSegment(base, tip) || normalAt(bodyPoints, bodyPoints.length - 1);
    const headHalf = headWidth / 2;
    const headBaseLeft = {
        x: base.x + headNormal.x * headHalf,
        y: base.y + headNormal.y * headHalf,
    };
    const headBaseRight = {
        x: base.x - headNormal.x * headHalf,
        y: base.y - headNormal.y * headHalf,
    };

    const ring = [
        ...leftBody,
        headBaseLeft,
        { x: tip.x, y: tip.y },
        headBaseRight,
        ...rightBody.reverse(),
        leftBody[0],
    ].map((point) => unprojectLngLat(point, origin, cosOriginLat));

    if (ring.length < 4) return null;
    return {
        type: "Polygon",
        coordinates: [ring],
    };
}

export type ProjectedPoint = {
    x: number;
    y: number;
};

export type MeasuredPoint = ProjectedPoint & {
    distance: number;
};

export function removeDuplicatePathCoords(coords: [number, number][]): [number, number][] {
    const result: [number, number][] = [];
    for (const coord of coords) {
        const last = result[result.length - 1];
        if (last && last[0] === coord[0] && last[1] === coord[1]) continue;
        result.push(coord);
    }
    return result;
}

export function projectLngLat(
    coord: [number, number],
    origin: [number, number],
    cosOriginLat: number
): ProjectedPoint {
    const earthRadiusMeters = 6371008.8;
    return {
        x: toRadians(coord[0] - origin[0]) * earthRadiusMeters * cosOriginLat,
        y: toRadians(coord[1] - origin[1]) * earthRadiusMeters,
    };
}

export function unprojectLngLat(
    point: ProjectedPoint,
    origin: [number, number],
    cosOriginLat: number
): [number, number] {
    const earthRadiusMeters = 6371008.8;
    return [
        origin[0] + toDegrees(point.x / (earthRadiusMeters * cosOriginLat)),
        origin[1] + toDegrees(point.y / earthRadiusMeters),
    ];
}

export function buildMeasuredPath(points: ProjectedPoint[]): MeasuredPoint[] {
    let distance = 0;
    return points.map((point, index) => {
        if (index > 0) {
            distance += distanceProjected(points[index - 1], point);
        }
        return {
            ...point,
            distance,
        };
    });
}

export function pointAtDistance(points: MeasuredPoint[], targetDistance: number): MeasuredPoint {
    if (targetDistance <= 0) return points[0];
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const next = points[i];
        if (targetDistance > next.distance) continue;
        const segmentLength = next.distance - prev.distance;
        const t = segmentLength > 0 ? (targetDistance - prev.distance) / segmentLength : 0;
        return {
            x: prev.x + (next.x - prev.x) * t,
            y: prev.y + (next.y - prev.y) * t,
            distance: targetDistance,
        };
    }
    return points[points.length - 1];
}

export function normalAt(points: ProjectedPoint[], index: number): ProjectedPoint {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    return normalFromSegment(prev, next) || { x: 0, y: 1 };
}

export function normalFromSegment(a: ProjectedPoint, b: ProjectedPoint): ProjectedPoint | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) return null;
    return {
        x: -dy / length,
        y: dx / length,
    };
}

export function distanceProjected(a: ProjectedPoint, b: ProjectedPoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}

export function toDegrees(value: number): number {
    return (value * 180) / Math.PI;
}

export function ensurePathArrowIcon(map: maplibregl.Map): boolean {
    if (map.hasImage(PATH_ARROW_ICON_ID)) return true;
    const imageData = createPathArrowImageData();
    if (!imageData) return false;
    map.addImage(PATH_ARROW_ICON_ID, imageData, { pixelRatio: 2 });
    return true;
}

export function createPathArrowImageData(): ImageData | null {
    const size = 56;
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(8, 16);
    ctx.lineTo(28, 16);
    ctx.lineTo(28, 10);
    ctx.lineTo(46, 28);
    ctx.lineTo(28, 46);
    ctx.lineTo(28, 40);
    ctx.lineTo(8, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

export function buildTypeMatchExpression(
    valueByType: Record<string, string | number | boolean>,
    fallback: string | number | boolean
): maplibregl.ExpressionSpecification {
    const expression: unknown[] = ["match", getFeatureTypeExpression()];

    for (const [typeId, value] of Object.entries(valueByType)) {
        expression.push(typeId, value);
    }

    expression.push(fallback);
    return expression as maplibregl.ExpressionSpecification;
}

export function getFeatureTypeExpression(): maplibregl.ExpressionSpecification {
    return [
        "coalesce",
        ["get", "type"],
        ["get", "entity_type_id"],
        "",
    ] as maplibregl.ExpressionSpecification;
}

export function roundZoom(value: number): number {
    return Math.round(value * 10) / 10;
}

function getSingleEntityFeatureLabel(feature: Feature): string | null {
    const rawEntityIds = Array.isArray(feature.properties.entity_ids)
        ? feature.properties.entity_ids
        : (typeof feature.properties.entity_id === "string" && feature.properties.entity_id.trim().length > 0
            ? [feature.properties.entity_id]
            : []);

    const entityIds = Array.from(new Set(
        rawEntityIds
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
    ));

    if (entityIds.length !== 1) return null;

    const name = typeof feature.properties.entity_name === "string"
        ? feature.properties.entity_name.trim()
        : "";

    return name.length ? name : null;
}

function getPolygonLabelPoint(geometry: Geometry): Coordinate | null {
    if (geometry.type === "Polygon") {
        return getPolygonLabelCandidate(geometry.coordinates)?.point || null;
    }

    if (geometry.type === "MultiPolygon") {
        let best: { point: Coordinate; distance: number } | null = null;
        for (const polygon of geometry.coordinates) {
            const candidate = getPolygonLabelCandidate(polygon);
            if (!candidate) continue;
            if (!best || candidate.distance > best.distance) {
                best = candidate;
            }
        }
        return best?.point || null;
    }

    return null;
}

function getPolygonLabelCandidate(polygon: PolygonCoordinates): { point: Coordinate; distance: number } | null {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) return null;

    const bbox = getRingBbox(outerRing);
    if (!bbox) return null;

    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    if (width <= 0 || height <= 0) {
        const fallback = getRingCentroid(outerRing) || [bbox.minX, bbox.minY] as Coordinate;
        return { point: fallback, distance: 0 };
    }

    const cellSize = Math.min(width, height);
    const h = cellSize / 2;
    const cells: LabelCell[] = [];

    for (let x = bbox.minX; x < bbox.maxX; x += cellSize) {
        for (let y = bbox.minY; y < bbox.maxY; y += cellSize) {
            cells.push(createLabelCell(x + h, y + h, h, polygon));
        }
    }

    let best = createLabelCell(bbox.minX + width / 2, bbox.minY + height / 2, 0, polygon);
    const centroid = getRingCentroid(outerRing);
    if (centroid) {
        const centroidCell = createLabelCell(centroid[0], centroid[1], 0, polygon);
        if (centroidCell.d > best.d) {
            best = centroidCell;
        }
    }

    const precision = Math.max(Math.max(width, height) / 100, 0.0001);
    let iterations = 0;
    while (cells.length && iterations < 4096) {
        cells.sort((a, b) => b.max - a.max);
        const cell = cells.shift();
        if (!cell) break;
        iterations += 1;

        if (cell.d > best.d) {
            best = cell;
        }

        if (cell.max - best.d <= precision) continue;

        const nextH = cell.h / 2;
        cells.push(createLabelCell(cell.x - nextH, cell.y - nextH, nextH, polygon));
        cells.push(createLabelCell(cell.x + nextH, cell.y - nextH, nextH, polygon));
        cells.push(createLabelCell(cell.x - nextH, cell.y + nextH, nextH, polygon));
        cells.push(createLabelCell(cell.x + nextH, cell.y + nextH, nextH, polygon));
    }

    if (best.d < 0) {
        const fallback = centroid || [bbox.minX + width / 2, bbox.minY + height / 2] as Coordinate;
        return { point: fallback, distance: 0 };
    }

    return { point: [best.x, best.y], distance: best.d };
}

function createLabelCell(x: number, y: number, h: number, polygon: PolygonCoordinates): LabelCell {
    const d = pointToPolygonDistance([x, y], polygon);
    return {
        x,
        y,
        h,
        d,
        max: d + h * Math.SQRT2,
    };
}

function getRingBbox(ring: Coordinate[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (!ring.length) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }

    return { minX, minY, maxX, maxY };
}

function getRingCentroid(ring: Coordinate[]): Coordinate | null {
    let area = 0;
    let x = 0;
    let y = 0;

    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
        const a = ring[i];
        const b = ring[j];
        const f = a[0] * b[1] - b[0] * a[1];
        x += (a[0] + b[0]) * f;
        y += (a[1] + b[1]) * f;
        area += f * 3;
    }

    if (area === 0) return null;
    return [x / area, y / area];
}

function pointToPolygonDistance(point: Coordinate, polygon: PolygonCoordinates): number {
    const inside = isPointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => isPointInRing(point, ring));
    let minDistSq = Number.POSITIVE_INFINITY;

    for (const ring of polygon) {
        for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
            minDistSq = Math.min(minDistSq, getSegmentDistanceSquared(point, ring[j], ring[i]));
        }
    }

    const distance = Math.sqrt(minDistSq);
    return inside ? distance : -distance;
}

function isPointInRing(point: Coordinate, ring: Coordinate[] | undefined): boolean {
    if (!ring || ring.length < 3) return false;

    const [x, y] = point;
    let inside = false;

    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }

    return inside;
}

function getSegmentDistanceSquared(point: Coordinate, a: Coordinate, b: Coordinate): number {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = b[0];
            y = b[1];
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = point[0] - x;
    dy = point[1] - y;
    return dx * dx + dy * dy;
}

export function buildClientFeatureId(): string {
    return newId();
}

export function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
