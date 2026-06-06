import maplibregl from "maplibre-gl";
import polylabel from "polylabel";
import { BACKGROUND_LAYER_OPTIONS, BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { Feature, FeatureCollection, Geometry } from "@/uhm/lib/editor/state/useEditorState";
import {
    FEATURE_STATE_SOURCE_IDS,
    PATH_ARROW_ICON_ID,
    RASTER_BASE_LAYER_ID,
    RASTER_BASE_SOURCE_ID,
    PATH_ARROW_SOURCE_ID
} from "@/uhm/lib/map/constants";
import { PATH_RENDER_BY_TYPE } from "@/uhm/lib/map/styles/style";
import { getBackgroundRasterSourceSpecification } from "@/uhm/api/tiles";
import { newId } from "@/uhm/lib/utils/id";
import { normalizeGeoTypeKey } from "@/uhm/lib/map/geo/geoTypeMap";
import { normalizeBoundWithId, normalizeFeatureBoundWith } from "@/uhm/lib/editor/geometry/geometryBinding";
import type { EntityLabelCandidate } from "@/uhm/types/geo";

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type FeatureLabelInfo = {
    entityId: string;
    label: string;
    timeEnd: number | null;
};
const rasterBaseVisibilityGenerationByMap = new WeakMap<maplibregl.Map, number>();

const resolverCache = new WeakMap<
    FeatureCollection,
    Map<number | null | undefined, (feature: Feature) => string | null>
>();

const featureLabelInfoCache = new WeakMap<
    Feature,
    Map<number | null | undefined, FeatureLabelInfo | null>
>();

export function applyBackgroundLayerVisibility(
    map: maplibregl.Map,
    visibility: BackgroundLayerVisibility
) {
    syncRasterBaseVisibility(map, visibility[RASTER_BASE_LAYER_ID]);

    for (const layer of BACKGROUND_LAYER_OPTIONS) {
        if (layer.id === RASTER_BASE_LAYER_ID) continue;
        const nextVisibility = visibility[layer.id] ? "visible" : "none";

        if (map.getLayer(layer.id)) {
            map.setLayoutProperty(layer.id, "visibility", nextVisibility);
        }

        const groupedLayerIds = getBackgroundGroupLayerIds(map, layer.id);
        for (const groupedLayerId of groupedLayerIds) {
            if (!map.getLayer(groupedLayerId)) continue;
            map.setLayoutProperty(groupedLayerId, "visibility", nextVisibility);
        }
    }
}

export function syncRasterBaseVisibility(map: maplibregl.Map, shouldShow: boolean) {
    const generation = nextRasterBaseVisibilityGeneration(map);
    const isCurrentRequest = () => rasterBaseVisibilityGenerationByMap.get(map) === generation;

    if (shouldShow) {
        void ensureRasterBaseLayer(map, isCurrentRequest).catch((error) => {
            console.error("Failed to load proxied raster background.", error);
            if (isCurrentRequest()) {
                removeRasterBaseLayer(map);
            }
        });
        return;
    }
    removeRasterBaseLayer(map);
}

function nextRasterBaseVisibilityGeneration(map: maplibregl.Map) {
    const next = (rasterBaseVisibilityGenerationByMap.get(map) || 0) + 1;
    rasterBaseVisibilityGenerationByMap.set(map, next);
    return next;
}

export async function ensureRasterBaseLayer(
    map: maplibregl.Map,
    isCurrentRequest: () => boolean = () => true
) {
    if (!map.getSource(RASTER_BASE_SOURCE_ID)) {
        const source = await createRasterBaseSource();
        if (!isCurrentRequest()) return;
        if (map.getSource(RASTER_BASE_SOURCE_ID)) {
            // Another caller already added the source while we were waiting.
        } else {
            map.addSource(RASTER_BASE_SOURCE_ID, source);
        }
    }

    if (!isCurrentRequest()) return;

    const beforeId = getRasterBaseInsertBeforeLayerId(map);
    if (!map.getLayer(RASTER_BASE_LAYER_ID)) {
        map.addLayer(createRasterBaseLayer(), beforeId);
    } else if (beforeId && beforeId !== RASTER_BASE_LAYER_ID) {
        map.moveLayer(RASTER_BASE_LAYER_ID, beforeId);
    }

    if (!isCurrentRequest()) return;
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
    return getBackgroundRasterSourceSpecification();
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

function getRasterBaseInsertBeforeLayerId(map: maplibregl.Map): string | undefined {
    const style = map.getStyle();
    const layers = style?.layers || [];

    return layers.find((layer) => {
        return layer.id !== "background" && layer.id !== RASTER_BASE_LAYER_ID;
    })?.id;
}

function getBackgroundGroupLayerIds(
    map: maplibregl.Map,
    groupId: string
): string[] {
    const style = map.getStyle();
    if (!style?.layers?.length) return [];

    return style.layers
        .filter((layer) => {
            const metadata = (layer as { metadata?: Record<string, unknown> }).metadata;
            return metadata?.uhmBackgroundGroupId === groupId;
        })
        .map((layer) => layer.id);
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
    highlightFeatures?: FeatureCollection | null,
    isPreviewMode?: boolean
): FeatureCollection {
    const selectedIds = new Set(selectedFeatureIds.map(String));
    if (highlightFeatures?.features) {
        for (const f of highlightFeatures.features) {
            if (f.properties?.id != null) selectedIds.add(String(f.properties.id));
        }
    }

    const childIds = new Set<string>();
    const parentIds = new Set<string>();
    const featureParentMap = new Map<string, string>(); // childId -> parentId

    for (const feature of fc.features) {
        const featureId = String(feature.properties.id);
        const parentId = normalizeFeatureBoundWith(feature);
        if (parentId) {
            childIds.add(featureId);
            parentIds.add(parentId);
            featureParentMap.set(featureId, parentId);
        }
    }

    if (selectedIds.size === 0) {
        return { ...fc, features: fc.features.filter((f) => !childIds.has(String(f.properties.id))) };
    }

    const activeParents = new Set<string>();
    for (const id of selectedIds) {
        if (parentIds.has(id)) {
            activeParents.add(id);
        } else {
            const parentId = featureParentMap.get(id);
            if (parentId) {
                activeParents.add(parentId);
            }
        }
    }

    return {
        ...fc,
        features: fc.features.filter((feature) => {
            const featureId = String(feature.properties.id);
            const parentId = featureParentMap.get(featureId);

            // 1. If this feature is a parent and its hierarchy is active, hide it (only in preview/replay modes)
            if (isPreviewMode && activeParents.has(featureId)) {
                return false;
            }

            // 2. If this feature is a child of an active parent, show it
            if (parentId && activeParents.has(parentId)) {
                return true;
            }

            // 3. By default, hide all child geometries that are not part of the active hierarchy
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
            const id = String(feature.properties.id);
            // Kiểm tra ẩn theo ID cụ thể (ưu tiên cao nhất)
            if (visibility[id] === false) return false;

            const key = getFeatureSemanticType(feature);
            if (!key) return true;
            // Kiểm tra ẩn theo loại (semantic type)
            return visibility[key] !== false;
        }),
    };
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

export function decoratePointFeaturesWithLabels(
    fc: FeatureCollection,
    labelContext: FeatureCollection = fc,
    timelineYear?: number | null
): FeatureCollection {
    const getLabel = getFeatureLabelResolver(labelContext, timelineYear);
    let changed = false;
    const nextFeatures = fc.features.map((feature) => {
        const point_label = getLabel(feature);
        if (feature.properties.point_label === point_label) {
            return feature;
        }
        changed = true;
        return {
            ...feature,
            properties: {
                ...feature.properties,
                point_label,
            },
        };
    });
    return changed ? { ...fc, features: nextFeatures } : fc;
}

export function decorateLineFeaturesWithLabels(
    fc: FeatureCollection,
    labelContext: FeatureCollection = fc,
    timelineYear?: number | null
): FeatureCollection {
    const getLabel = getFeatureLabelResolver(labelContext, timelineYear);
    let changed = false;
    const nextFeatures = fc.features.map((feature) => {
        const line_label = isLineGeometry(feature.geometry) ? getLabel(feature) : null;
        if (feature.properties.line_label === line_label) {
            return feature;
        }
        changed = true;
        return {
            ...feature,
            properties: {
                ...feature.properties,
                line_label,
            },
        };
    });
    return changed ? { ...fc, features: nextFeatures } : fc;
}

const polygonLabelFeaturesCache = new WeakMap<Feature, { label: string; feature: Feature }>();

export function buildPolygonLabelFeatureCollection(
    fc: FeatureCollection,
    labelContext: FeatureCollection = fc,
    timelineYear?: number | null
): FeatureCollection {
    const getLabel = getFeatureLabelResolver(labelContext, timelineYear);
    const features: Feature[] = [];

    for (const feature of fc.features) {
        const label = getLabel(feature);
        if (!label) continue;

        const cached = polygonLabelFeaturesCache.get(feature);
        if (cached && cached.label === label) {
            features.push(cached.feature);
            continue;
        }

        const labelPoint = getPolygonLabelPoint(feature.geometry);
        if (!labelPoint) continue;

        const labelFeature: Feature = {
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
        };
        polygonLabelFeaturesCache.set(feature, { label, feature: labelFeature });
        features.push(labelFeature);
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
    padding?: number | maplibregl.PaddingOptions,
    options?: {
        duration?: number;
        maxZoom?: number;
        pointZoom?: number;
    }
): boolean {
    const bbox = getFeatureCollectionBBox(fc);
    if (!bbox) return false;

    const resolvedPadding = typeof padding === "number" || padding ? padding : 58;
    const duration = options?.duration ?? 0;
    const maxZoom = options?.maxZoom ?? 7;
    const pointZoom = options?.pointZoom ?? 6;

    const lngSpan = Math.abs(bbox.maxLng - bbox.minLng);
    const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
    if (lngSpan < 0.000001 && latSpan < 0.000001) {
        map.easeTo({
            center: [bbox.minLng, bbox.minLat],
            zoom: pointZoom,
            padding: resolvedPadding,
            duration,
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
            maxZoom,
            duration,
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

export function getGeometryRepresentativePoint(geometry: Geometry): Coordinate | null {
    if (geometry.type === "Point") {
        return normalizeCoordinate(geometry.coordinates);
    }

    if (geometry.type === "MultiPoint") {
        return getAverageCoordinate(geometry.coordinates);
    }

    if (geometry.type === "LineString") {
        return getLineMidpointCoordinate(geometry.coordinates);
    }

    if (geometry.type === "MultiLineString") {
        let bestLine: Coordinate[] | null = null;
        let bestLength = -1;
        for (const line of geometry.coordinates) {
            const length = getLineLength(line);
            if (length > bestLength) {
                bestLength = length;
                bestLine = line;
            }
        }
        return bestLine ? getLineMidpointCoordinate(bestLine) : null;
    }

    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
        return getPolygonLabelPoint(geometry);
    }

    return null;
}

const pathArrowGeometriesCache = new WeakMap<Geometry, Geometry[]>();

export function buildPathArrowFeatureCollection(fc: FeatureCollection): FeatureCollection {
    const features: Feature[] = [];

    for (const feature of fc.features) {
        if (!isPathFeature(feature)) continue;

        let arrowGeometries = pathArrowGeometriesCache.get(feature.geometry);
        if (!arrowGeometries) {
            arrowGeometries = [];
            const coordinateGroups = getLineCoordinateGroups(feature.geometry);
            const featureType = getFeatureSemanticType(feature);
            const isRetreat = featureType === "retreat_route";
            for (const coordinates of coordinateGroups) {
                const geometry = buildPathArrowGeometry(coordinates, isRetreat);
                if (geometry) arrowGeometries.push(geometry);
            }
            pathArrowGeometriesCache.set(feature.geometry, arrowGeometries);
        }

        for (const geometry of arrowGeometries) {
            features.push({
                type: "Feature",
                properties: { ...feature.properties },
                geometry,
            });
        }
    }

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
    return normalizeGeoTypeKey(value);
}

export function buildPathArrowGeometry(coords: [number, number][], isRetreatRoute = false): Geometry | null {
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

    const tailWidth = clampNumber(totalLength * 0.02, 5, 40000);
    const shoulderWidth = clampNumber(totalLength * 0.1, 10, 100000);
    const headWidth = shoulderWidth * 2.0;

    const base = bodyPoints[bodyPoints.length - 1];
    const tip = pointAtDistance(measured, totalLength);
    const headNormal = normalFromSegment(base, tip) || normalAt(bodyPoints, bodyPoints.length - 1);
    const headHalf = headWidth / 2;

    if (isRetreatRoute) {
        // Segmented Arrow (MultiPolygon)
        const rings: [number, number][][] = [];

        // 1. Generate body segments
        const segmentLength = totalLength * 0.10; // Dash length
        const gapLength = totalLength * 0.04;    // Gap length

        let currentD = 0;
        while (currentD < bodyEndDistance) {
            const startD = currentD;
            const endD = Math.min(startD + segmentLength, bodyEndDistance - gapLength);

            if (endD - startD > totalLength * 0.01) {
                const segmentPoints: MeasuredPoint[] = [];
                segmentPoints.push(pointAtDistance(measured, startD));
                
                for (const p of bodyPoints) {
                    if (p.distance > startD && p.distance < endD) {
                        segmentPoints.push(p);
                    }
                }
                
                segmentPoints.push(pointAtDistance(measured, endD));

                const leftBody: ProjectedPoint[] = [];
                const rightBody: ProjectedPoint[] = [];

                for (let i = 0; i < segmentPoints.length; i += 1) {
                    const point = segmentPoints[i];
                    const normal = normalAt(segmentPoints, i);
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

                const ring = [
                    ...leftBody,
                    ...rightBody.reverse(),
                    leftBody[0],
                ].map((point) => unprojectLngLat(point, origin, cosOriginLat));

                if (ring.length >= 4) {
                    rings.push(ring);
                }
            }

            currentD += segmentLength + gapLength;
        }

        // 2. Generate head segment (standalone arrowhead chevron/triangle)
        const headBaseLeft = {
            x: base.x + headNormal.x * headHalf,
            y: base.y + headNormal.y * headHalf,
        };
        const headBaseRight = {
            x: base.x - headNormal.x * headHalf,
            y: base.y - headNormal.y * headHalf,
        };
        const headRing = [
            { x: base.x, y: base.y },
            headBaseLeft,
            { x: tip.x, y: tip.y },
            headBaseRight,
            { x: base.x, y: base.y },
        ].map((point) => unprojectLngLat(point, origin, cosOriginLat));

        rings.push(headRing);

        return {
            type: "MultiPolygon",
            coordinates: rings.map(r => [r]),
        };
    } else {
        // Continuous Arrow (Polygon)
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

export function getFeatureLabelResolver(
    fc: FeatureCollection,
    timelineYear?: number | null
): (feature: Feature) => string | null {
    let yearMap = resolverCache.get(fc);
    if (!yearMap) {
        yearMap = new Map();
        resolverCache.set(fc, yearMap);
    }
    let resolver = yearMap.get(timelineYear);
    if (!resolver) {
        resolver = createFeatureLabelResolver(fc, timelineYear);
        yearMap.set(timelineYear, resolver);
    }
    return resolver;
}

function getSingleEntityFeatureLabelInfoCached(
    feature: Feature,
    timelineYear?: number | null
): FeatureLabelInfo | null {
    let yearMap = featureLabelInfoCache.get(feature);
    if (!yearMap) {
        yearMap = new Map();
        featureLabelInfoCache.set(feature, yearMap);
    }
    let info = yearMap.get(timelineYear);
    if (info === undefined) {
        info = getSingleEntityFeatureLabelInfo(feature, timelineYear);
        yearMap.set(timelineYear, info);
    }
    return info;
}

function createFeatureLabelResolver(
    fc: FeatureCollection,
    timelineYear?: number | null
): (feature: Feature) => string | null {
    const directLabelsByFeatureId = new Map<string, FeatureLabelInfo>();
    const inheritedLabelsByChildId = new Map<string, FeatureLabelInfo | null>();

    for (const feature of fc.features) {
        const labelInfo = getSingleEntityFeatureLabelInfoCached(feature, timelineYear);
        if (!labelInfo) continue;
        directLabelsByFeatureId.set(String(feature.properties.id), labelInfo);
    }

    for (const feature of fc.features) {
        const featureId = String(feature.properties.id);
        const parentId = normalizeBoundWithId(feature.properties.bound_with);
        if (!parentId) continue;

        const parentLabel = directLabelsByFeatureId.get(parentId);
        if (parentLabel) {
            mergeInheritedFeatureLabel(inheritedLabelsByChildId, featureId, parentLabel);
        }
    }

    return (feature) => {
        const featureId = String(feature.properties.id);
        const directEntityIds = getFeatureEntityIds(feature);
        let label: string | null = null;
        if (directEntityIds.length > 0) {
            label = directLabelsByFeatureId.get(featureId)?.label || null;
        } else {
            label = inheritedLabelsByChildId.get(featureId)?.label || null;
        }

        if (!label) {
            const geotype = feature.properties?.type || feature.properties?.entity_type_id;
            if (geotype === "region") {
                return "__Missing__";
            }
        }

        return label;
    };
}

function mergeInheritedFeatureLabel(
    labelsByFeatureId: Map<string, FeatureLabelInfo | null>,
    targetFeatureId: string,
    labelInfo: FeatureLabelInfo
) {
    const current = labelsByFeatureId.get(targetFeatureId);
    if (current === undefined) {
        labelsByFeatureId.set(targetFeatureId, labelInfo);
    } else if (current && current.entityId === labelInfo.entityId) {
        labelsByFeatureId.set(targetFeatureId, current);
    } else {
        labelsByFeatureId.set(targetFeatureId, null);
    }
}

function getSingleEntityFeatureLabelInfo(
    feature: Feature,
    timelineYear?: number | null
): FeatureLabelInfo | null {
    const candidates = getFeatureEntityLabelCandidates(feature);
    if (candidates.length > 0) {
        const timelineCandidate = getLatestTimelineEntityCandidate(candidates, timelineYear);
        if (!timelineCandidate) return null;
        return {
            entityId: timelineCandidate.id,
            label: timelineCandidate.name,
            timeEnd: normalizeLabelYear(timelineCandidate.time_end),
        };
    }

    const entityIds = getFeatureEntityIds(feature);
    if (entityIds.length !== 1) return null;

    const label = getSingleEntityName(feature);
    if (!label) return null;

    return { entityId: entityIds[0], label, timeEnd: null };
}

function getLatestTimelineEntityCandidate(
    candidates: EntityLabelCandidate[],
    timelineYear?: number | null
): EntityLabelCandidate | null {
    if (!candidates.length) return null;

    const activeCandidates = candidates.filter((candidate) =>
        isEntityCandidateVisibleAtYear(candidate, timelineYear)
    );
    if (!activeCandidates.length) return null;

    return activeCandidates.sort(compareEntityLabelCandidates)[0] || null;
}

function getFeatureEntityLabelCandidates(feature: Feature): EntityLabelCandidate[] {
    const rawCandidates = feature.properties.entity_label_candidates;
    if (!Array.isArray(rawCandidates)) return [];

    const byId = new Map<string, EntityLabelCandidate>();
    for (const raw of rawCandidates) {
        if (!raw || typeof raw !== "object") continue;
        const candidate = raw as EntityLabelCandidate;
        const id = String(candidate.id || "").trim();
        const name = String(candidate.name || "").trim();
        if (!id || !name) continue;
        byId.set(id, {
            id,
            name,
            time_start: normalizeLabelYear(candidate.time_start),
            time_end: normalizeLabelYear(candidate.time_end),
        });
    }

    return Array.from(byId.values());
}

function isEntityCandidateVisibleAtYear(
    candidate: EntityLabelCandidate,
    timelineYear?: number | null
): boolean {
    if (typeof timelineYear !== "number" || !Number.isFinite(timelineYear)) return true;

    const start = normalizeLabelYear(candidate.time_start);
    const end = normalizeLabelYear(candidate.time_end);
    if (start != null && timelineYear < start) return false;
    if (end != null && timelineYear > end) return false;
    return true;
}

function compareEntityLabelCandidates(a: EntityLabelCandidate, b: EntityLabelCandidate): number {
    const endA = normalizeLabelYear(a.time_end);
    const endB = normalizeLabelYear(b.time_end);
    const endScoreA = endA == null ? Number.NEGATIVE_INFINITY : endA;
    const endScoreB = endB == null ? Number.NEGATIVE_INFINITY : endB;
    if (endScoreA !== endScoreB) return endScoreB - endScoreA;

    const startA = normalizeLabelYear(a.time_start);
    const startB = normalizeLabelYear(b.time_start);
    const startScoreA = startA == null ? Number.NEGATIVE_INFINITY : startA;
    const startScoreB = startB == null ? Number.NEGATIVE_INFINITY : startB;
    if (startScoreA !== startScoreB) return startScoreB - startScoreA;

    return a.name.localeCompare(b.name);
}

function normalizeLabelYear(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getFeatureEntityIds(feature: Feature): string[] {
    const rawEntityIds: unknown[] = Array.isArray(feature.properties.entity_ids)
        ? feature.properties.entity_ids
        : (typeof feature.properties.entity_id === "string" || typeof feature.properties.entity_id === "number"
            ? [feature.properties.entity_id]
            : []);

    return Array.from(new Set(
        rawEntityIds
            .filter((id): id is string | number => typeof id === "string" || typeof id === "number")
            .map((id) => String(id).trim())
            .filter((id) => id.length > 0)
    ));
}

function getSingleEntityName(feature: Feature): string | null {
    const directName = typeof feature.properties.entity_name === "string"
        ? feature.properties.entity_name.trim()
        : "";
    if (directName.length > 0) return directName;

    const names = Array.isArray(feature.properties.entity_names)
        ? Array.from(new Set(
            feature.properties.entity_names
                .filter((name): name is string => typeof name === "string")
                .map((name) => name.trim())
                .filter((name) => name.length > 0)
        ))
        : [];

    return names.length === 1 ? names[0] : null;
}

function isLineGeometry(geometry: Geometry): boolean {
    return geometry.type === "LineString" || geometry.type === "MultiLineString";
}

function normalizeCoordinate(value: unknown): Coordinate | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

function getAverageCoordinate(coordinates: Coordinate[]): Coordinate | null {
    const valid = coordinates
        .map((coordinate) => normalizeCoordinate(coordinate))
        .filter((coordinate): coordinate is Coordinate => Boolean(coordinate));
    if (!valid.length) return null;

    const sum = valid.reduce(
        (acc, coordinate) => ({
            lng: acc.lng + coordinate[0],
            lat: acc.lat + coordinate[1],
        }),
        { lng: 0, lat: 0 }
    );
    return [sum.lng / valid.length, sum.lat / valid.length];
}

function getLineMidpointCoordinate(coordinates: Coordinate[]): Coordinate | null {
    const valid = coordinates
        .map((coordinate) => normalizeCoordinate(coordinate))
        .filter((coordinate): coordinate is Coordinate => Boolean(coordinate));
    if (!valid.length) return null;
    if (valid.length === 1) return valid[0];

    const totalLength = getLineLength(valid);
    if (totalLength <= 0) return valid[Math.floor(valid.length / 2)];

    const halfway = totalLength / 2;
    let travelled = 0;
    for (let i = 1; i < valid.length; i += 1) {
        const prev = valid[i - 1];
        const next = valid[i];
        const segmentLength = getCoordinateDistance(prev, next);
        if (travelled + segmentLength >= halfway) {
            const ratio = segmentLength > 0 ? (halfway - travelled) / segmentLength : 0;
            return [
                prev[0] + (next[0] - prev[0]) * ratio,
                prev[1] + (next[1] - prev[1]) * ratio,
            ];
        }
        travelled += segmentLength;
    }

    return valid[valid.length - 1];
}

function getLineLength(coordinates: Coordinate[]): number {
    let total = 0;
    for (let i = 1; i < coordinates.length; i += 1) {
        const prev = normalizeCoordinate(coordinates[i - 1]);
        const next = normalizeCoordinate(coordinates[i]);
        if (!prev || !next) continue;
        total += getCoordinateDistance(prev, next);
    }
    return total;
}

function getCoordinateDistance(a: Coordinate, b: Coordinate): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function getLineCoordinateGroups(geometry: Geometry): Coordinate[][] {
    if (geometry.type === "LineString") return [geometry.coordinates];
    if (geometry.type === "MultiLineString") return geometry.coordinates;
    return [];
}

const polygonLabelPointCache = new WeakMap<Geometry, Coordinate | null>();

function getPolygonLabelPoint(geometry: Geometry): Coordinate | null {
    if (polygonLabelPointCache.has(geometry)) {
        return polygonLabelPointCache.get(geometry)!;
    }
    let result: Coordinate | null = null;
    if (geometry.type === "Polygon") {
        result = getPolygonLabelCandidate(geometry.coordinates)?.point || null;
    } else if (geometry.type === "MultiPolygon") {
        let best: { point: Coordinate; distance: number } | null = null;
        for (const polygon of geometry.coordinates) {
            const candidate = getPolygonLabelCandidate(polygon);
            if (!candidate) continue;
            if (!best || candidate.distance > best.distance) {
                best = candidate;
            }
        }
        result = best?.point || null;
    }
    polygonLabelPointCache.set(geometry, result);
    return result;
}

function getPolygonLabelCandidate(polygon: PolygonCoordinates): { point: Coordinate; distance: number } | null {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) return null;

    const bbox = getRingBbox(outerRing);
    if (!bbox) return null;

    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    if (width <= 0 || height <= 0) {
        const fallback: Coordinate = [bbox.minX, bbox.minY];
        return { point: fallback, distance: 0 };
    }

    const precision = Math.max(Math.max(width, height) / 100, 0.0001);
    const result = polylabel(polygon, precision);
    const x = result[0];
    const y = result[1];

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { point: [bbox.minX + width / 2, bbox.minY + height / 2], distance: 0 };
    }

    return { point: [x, y], distance: Number.isFinite(result.distance) ? result.distance : 0 };
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

export function buildClientFeatureId(): string {
    return newId();
}

export function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export function hashStringToColor(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    // Use Knuth's multiplicative hashing multiplier to scatter consecutive/close hash values
    const scattered = Math.abs(hash * 2654435761);
    const hue = scattered % 360;
    
    // Vary saturation and lightness slightly to increase color diversity and uniqueness
    const saturation = 70 + (scattered % 20); // 70% to 90%
    const lightness = 45 + ((scattered >> 5) % 15); // 45% to 60%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function decorateFeaturesWithEntityColors(fc: FeatureCollection): FeatureCollection {
    let changed = false;
    const nextFeatures = fc.features.map((feature) => {
        const geomType = feature.geometry?.type;
        if (geomType === "Point" || geomType === "MultiPoint") {
            // Point - giữ nguyên màu của preset/icon
            return feature;
        }

        let entity_color: string | undefined;
        if (geomType === "LineString" || geomType === "MultiLineString") {
            const entityIds = getFeatureEntityIds(feature);
            if (entityIds.length > 0) {
                const sortedCombined = [...entityIds].sort().join("+");
                entity_color = hashStringToColor(sortedCombined);
            }
        } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
            const geoId = String(feature.properties?.id || "");
            if (geoId) {
                entity_color = hashStringToColor(geoId);
            }
        }

        if (feature.properties.entity_color === entity_color) {
            return feature;
        }
        changed = true;
        return {
            ...feature,
            properties: {
                ...feature.properties,
                entity_color,
            },
        };
    });
    return changed ? { ...fc, features: nextFeatures } : fc;
}
