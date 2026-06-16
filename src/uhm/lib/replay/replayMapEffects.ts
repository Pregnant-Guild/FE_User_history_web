import type maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "@/uhm/types/geo";
import { getFeatureCollectionBBox } from "@/uhm/components/map/mapUtils";
import { MAP_EMPHASIS_TEXT_FONT_STACK } from "@/uhm/lib/map/styles/shared/textFonts";

const EMPTY_EFFECT_COLLECTION = {
    type: "FeatureCollection",
    features: [],
} as Parameters<maplibregl.GeoJSONSource["setData"]>[0];

const STYLE_SOURCE_ID = "replay-effect-style-source";
const STYLE_FILL_LAYER_ID = "replay-effect-style-fill";
const STYLE_LINE_LAYER_ID = "replay-effect-style-line";
const STYLE_POINT_LAYER_ID = "replay-effect-style-point";

const LABEL_SOURCE_ID = "replay-effect-label-source";
const LABEL_LAYER_ID = "replay-effect-label";

const PULSE_SOURCE_ID = "replay-effect-pulse-source";
const PULSE_FILL_LAYER_ID = "replay-effect-pulse-fill";
const PULSE_LINE_LAYER_ID = "replay-effect-pulse-line";
const PULSE_POINT_LAYER_ID = "replay-effect-pulse-point";

const DASH_SOURCE_ID = "replay-effect-dash-source";
const DASH_LAYER_ID = "replay-effect-dash-line";

type EffectFeature = Feature & {
    properties: Feature["properties"] & Record<string, unknown>;
};

type LabelFeature = {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
};

type Cleanup = () => void;

export type ReplayMapEffects = ReturnType<typeof createReplayMapEffects>;

export function createReplayMapEffects() {
    let activeMap: maplibregl.Map | null = null;
    const cleanups = new Set<Cleanup>();
    const styledFeatures = new Map<string, EffectFeature>();
    const labelFeatures = new Map<string, LabelFeature>();
    const pulseFeatures = new Map<string, EffectFeature>();
    const dashFeatures = new Map<string, EffectFeature>();

    const setActiveMap = (map: maplibregl.Map) => {
        activeMap = map;
        ensureReplayEffectLayers(map);
    };

    const clear = (map: maplibregl.Map | null = activeMap) => {
        for (const cleanup of cleanups) {
            cleanup();
        }
        cleanups.clear();
        styledFeatures.clear();
        labelFeatures.clear();
        pulseFeatures.clear();
        dashFeatures.clear();
        if (!map) return;
        updateSource(map, STYLE_SOURCE_ID, []);
        updateSource(map, LABEL_SOURCE_ID, []);
        updateSource(map, PULSE_SOURCE_ID, []);
        updateSource(map, DASH_SOURCE_ID, []);
    };

    const registerCleanup = (cleanup: Cleanup) => {
        cleanups.add(cleanup);
        return () => {
            cleanups.delete(cleanup);
        };
    };

    return {
        clear,
        setGeometryStyle(
            map: maplibregl.Map,
            draft: FeatureCollection,
            geometryIds: string[],
            fillColor: string,
            fillOpacity: number,
            lineColor: string,
            lineWidth: number
        ) {
            setActiveMap(map);
            const features = findFeaturesById(draft, geometryIds);
            for (const feature of features) {
                const id = String(feature.properties.id);
                styledFeatures.set(id, cloneFeatureWithProps(feature, {
                    replay_fill_color: normalizeColor(fillColor, "#f97316"),
                    replay_fill_opacity: clampNumber(fillOpacity, 0, 1, 0.35),
                    replay_line_color: normalizeColor(lineColor, "#fdba74"),
                    replay_line_width: clampNumber(lineWidth, 0.5, 12, 2),
                    replay_circle_radius: 9,
                }));
            }
            updateSource(map, STYLE_SOURCE_ID, Array.from(styledFeatures.values()));
        },
        showGeometryLabel(
            map: maplibregl.Map,
            draft: FeatureCollection,
            geometryId: string,
            text: string,
            color: string,
            size: number
        ) {
            setActiveMap(map);
            const feature = findFeatureById(draft, geometryId);
            if (!feature) return;
            const center = getFeatureCenter(feature);
            if (!center) return;

            const label = text.trim() || getDefaultFeatureLabel(feature);
            if (!label.trim()) return;

            labelFeatures.set(String(feature.properties.id), {
                type: "Feature",
                properties: {
                    id: `replay-label-${String(feature.properties.id)}`,
                    label,
                    color: normalizeColor(color, "#ffffff"),
                    size: clampNumber(size, 9, 28, 14),
                },
                geometry: {
                    type: "Point",
                    coordinates: center,
                },
            });
            updateSource(map, LABEL_SOURCE_ID, Array.from(labelFeatures.values()));
        },
        pulseGeometry(
            map: maplibregl.Map,
            draft: FeatureCollection,
            geometryId: string,
            color: string,
            repeat: number,
            duration: number
        ) {
            setActiveMap(map);
            const feature = findFeatureById(draft, geometryId);
            if (!feature) return;

            const effectId = `pulse-${String(feature.properties.id)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const totalDuration = clampNumber(duration, 250, 30000, 1800);
            const repeatCount = Math.max(1, Math.trunc(clampNumber(repeat, 1, 20, 2)));
            const effectColor = normalizeColor(color, "#f59e0b");
            const startedAt = performance.now();
            let rafId = 0;
            let unregister: Cleanup | null = null;

            const removeEffect = () => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                pulseFeatures.delete(effectId);
                updateSource(map, PULSE_SOURCE_ID, Array.from(pulseFeatures.values()));
                unregister?.();
                unregister = null;
            };

            const tick = (now: number) => {
                const elapsed = now - startedAt;
                const progress = Math.min(1, elapsed / totalDuration);
                const cycle = (progress * repeatCount) % 1;
                const wave = 1 - Math.abs(cycle * 2 - 1);
                pulseFeatures.set(effectId, cloneFeatureWithProps(feature, {
                    id: effectId,
                    replay_pulse_color: effectColor,
                    replay_pulse_fill_opacity: 0.06 + wave * 0.22,
                    replay_pulse_line_opacity: 0.28 + wave * 0.68,
                    replay_pulse_line_width: 2 + wave * 5,
                    replay_pulse_circle_radius: 8 + wave * 12,
                    replay_pulse_circle_opacity: 0.25 + wave * 0.55,
                }));
                updateSource(map, PULSE_SOURCE_ID, Array.from(pulseFeatures.values()));
                if (progress >= 1) {
                    removeEffect();
                    return;
                }
                rafId = requestAnimationFrame(tick);
            };

            unregister = registerCleanup(removeEffect);
            rafId = requestAnimationFrame(tick);
        },
        animateDashedBorder(
            map: maplibregl.Map,
            draft: FeatureCollection,
            geometryId: string,
            color: string,
            width: number,
            speed: number,
            duration: number
        ) {
            setActiveMap(map);
            const feature = findFeatureById(draft, geometryId);
            if (!feature || isPointGeometry(feature.geometry)) return;

            const effectId = `dash-${String(feature.properties.id)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const totalDuration = clampNumber(duration, 250, 60000, 3000);
            const safeSpeed = clampNumber(speed, 0.25, 8, 1);
            const startedAt = performance.now();
            let rafId = 0;
            let unregister: Cleanup | null = null;

            const removeEffect = () => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                dashFeatures.delete(effectId);
                updateSource(map, DASH_SOURCE_ID, Array.from(dashFeatures.values()));
                unregister?.();
                unregister = null;
            };

            dashFeatures.set(effectId, cloneFeatureWithProps(feature, {
                id: effectId,
                replay_dash_color: normalizeColor(color, "#38bdf8"),
                replay_dash_width: clampNumber(width, 0.5, 12, 2),
                replay_dash_opacity: 0.96,
            }));
            updateSource(map, DASH_SOURCE_ID, Array.from(dashFeatures.values()));

            const tick = (now: number) => {
                const elapsed = now - startedAt;
                const phase = Math.floor((elapsed / 140) * safeSpeed) % 4;
                const dashArray = phase % 2 === 0 ? [1.2, 0.8] : [0.35, 1.15, 1.2, 0.8];
                if (map.getLayer(DASH_LAYER_ID)) {
                    map.setPaintProperty(DASH_LAYER_ID, "line-dasharray", dashArray);
                }
                if (elapsed >= totalDuration) {
                    removeEffect();
                    return;
                }
                rafId = requestAnimationFrame(tick);
            };

            unregister = registerCleanup(removeEffect);
            rafId = requestAnimationFrame(tick);
        },
        followGeometriesPath(
            map: maplibregl.Map,
            draft: FeatureCollection,
            geometryIds: string[],
            duration: number,
            zoom: number,
            pitch: number
        ) {
            const features = findFeaturesById(draft, geometryIds);
            const coordinates = features.flatMap((feature) => getPathCoordinates(feature.geometry));
            const path = removeDuplicateCoordinates(coordinates);
            if (path.length === 0) return;
            if (path.length === 1) {
                map.flyTo({
                    center: path[0],
                    zoom: typeof zoom === "number" ? zoom : map.getZoom(),
                    pitch: map.getPitch(),
                    bearing: map.getBearing(),
                    duration: clampNumber(duration, 250, 60000, 5000),
                });
                return;
            }

            setActiveMap(map);
            const measured = buildMeasuredLngLatPath(path);
            const totalDistance = measured[measured.length - 1]?.distance || 0;
            if (totalDistance <= 0) return;

            const totalDuration = clampNumber(duration, 250, 60000, 5000);
            
            // Allocate flyDuration dynamically based on the total step duration
            let flyDuration = 1500;
            if (totalDuration < 3000) {
                flyDuration = Math.round(totalDuration * 0.4);
            } else if (totalDuration < 4500) {
                flyDuration = 1200;
            }
            const followDuration = Math.max(100, totalDuration - flyDuration);
            
            let rafId = 0;
            let flyTimeoutId: NodeJS.Timeout | null = null;
            let unregister: Cleanup | null = null;
            let onMoveStart: ((e: any) => void) | null = null;

            const stop = () => {
                if (flyTimeoutId) {
                    clearTimeout(flyTimeoutId);
                    flyTimeoutId = null;
                }
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                if (onMoveStart) {
                    map.off("movestart", onMoveStart);
                    onMoveStart = null;
                }
                unregister?.();
                unregister = null;
            };

            onMoveStart = (e: any) => {
                if (e && e.isFollowPath) {
                    return;
                }
                stop();
            };
            map.on("movestart", onMoveStart);

            map.flyTo({
                center: path[0],
                zoom: typeof zoom === "number" ? zoom : map.getZoom(),
                pitch: map.getPitch(),
                bearing: map.getBearing(),
                duration: flyDuration,
            }, { isFollowPath: true });

            flyTimeoutId = setTimeout(() => {
                const startedAt = performance.now();
                const tick = (now: number) => {
                    const progress = Math.min(1, (now - startedAt) / followDuration);
                    const targetDistance = totalDistance * progress;
                    const center = interpolateMeasuredPath(measured, targetDistance);
                    map.jumpTo({
                        center,
                    }, { isFollowPath: true });
                    if (progress >= 1) {
                        stop();
                        return;
                    }
                    rafId = requestAnimationFrame(tick);
                };
                rafId = requestAnimationFrame(tick);
            }, flyDuration);

            unregister = registerCleanup(stop);
        },
    };
}

function ensureReplayEffectLayers(map: maplibregl.Map) {
    if (!map.isStyleLoaded()) return;

    ensureSource(map, STYLE_SOURCE_ID);
    ensureSource(map, LABEL_SOURCE_ID);
    ensureSource(map, PULSE_SOURCE_ID);
    ensureSource(map, DASH_SOURCE_ID);

    if (!map.getLayer(STYLE_FILL_LAYER_ID)) {
        map.addLayer({
            id: STYLE_FILL_LAYER_ID,
            type: "fill",
            source: STYLE_SOURCE_ID,
            filter: polygonFilter(),
            paint: {
                "fill-color": ["coalesce", ["get", "replay_fill_color"], "#f97316"],
                "fill-opacity": ["coalesce", ["to-number", ["get", "replay_fill_opacity"]], 0.35],
            },
        });
    }
    if (!map.getLayer(STYLE_LINE_LAYER_ID)) {
        map.addLayer({
            id: STYLE_LINE_LAYER_ID,
            type: "line",
            source: STYLE_SOURCE_ID,
            filter: nonPointFilter(),
            layout: {
                "line-cap": "round",
                "line-join": "round",
            },
            paint: {
                "line-color": ["coalesce", ["get", "replay_line_color"], "#fdba74"],
                "line-width": ["coalesce", ["to-number", ["get", "replay_line_width"]], 2],
                "line-opacity": 0.98,
            },
        });
    }
    if (!map.getLayer(STYLE_POINT_LAYER_ID)) {
        map.addLayer({
            id: STYLE_POINT_LAYER_ID,
            type: "circle",
            source: STYLE_SOURCE_ID,
            filter: pointFilter(),
            paint: {
                "circle-color": ["coalesce", ["get", "replay_fill_color"], "#f97316"],
                "circle-radius": ["coalesce", ["to-number", ["get", "replay_circle_radius"]], 9],
                "circle-opacity": ["coalesce", ["to-number", ["get", "replay_fill_opacity"]], 0.85],
                "circle-stroke-color": ["coalesce", ["get", "replay_line_color"], "#fdba74"],
                "circle-stroke-width": ["coalesce", ["to-number", ["get", "replay_line_width"]], 2],
            },
        });
    }

    if (!map.getLayer(PULSE_FILL_LAYER_ID)) {
        map.addLayer({
            id: PULSE_FILL_LAYER_ID,
            type: "fill",
            source: PULSE_SOURCE_ID,
            filter: polygonFilter(),
            paint: {
                "fill-color": ["coalesce", ["get", "replay_pulse_color"], "#f59e0b"],
                "fill-opacity": ["coalesce", ["to-number", ["get", "replay_pulse_fill_opacity"]], 0.18],
            },
        });
    }
    if (!map.getLayer(PULSE_LINE_LAYER_ID)) {
        map.addLayer({
            id: PULSE_LINE_LAYER_ID,
            type: "line",
            source: PULSE_SOURCE_ID,
            filter: nonPointFilter(),
            layout: {
                "line-cap": "round",
                "line-join": "round",
            },
            paint: {
                "line-color": ["coalesce", ["get", "replay_pulse_color"], "#f59e0b"],
                "line-width": ["coalesce", ["to-number", ["get", "replay_pulse_line_width"]], 4],
                "line-opacity": ["coalesce", ["to-number", ["get", "replay_pulse_line_opacity"]], 0.75],
            },
        });
    }
    if (!map.getLayer(PULSE_POINT_LAYER_ID)) {
        map.addLayer({
            id: PULSE_POINT_LAYER_ID,
            type: "circle",
            source: PULSE_SOURCE_ID,
            filter: pointFilter(),
            paint: {
                "circle-color": ["coalesce", ["get", "replay_pulse_color"], "#f59e0b"],
                "circle-radius": ["coalesce", ["to-number", ["get", "replay_pulse_circle_radius"]], 12],
                "circle-opacity": ["coalesce", ["to-number", ["get", "replay_pulse_circle_opacity"]], 0.7],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
            },
        });
    }

    if (!map.getLayer(DASH_LAYER_ID)) {
        map.addLayer({
            id: DASH_LAYER_ID,
            type: "line",
            source: DASH_SOURCE_ID,
            filter: nonPointFilter(),
            layout: {
                "line-cap": "round",
                "line-join": "round",
            },
            paint: {
                "line-color": ["coalesce", ["get", "replay_dash_color"], "#38bdf8"],
                "line-width": ["coalesce", ["to-number", ["get", "replay_dash_width"]], 2],
                "line-opacity": ["coalesce", ["to-number", ["get", "replay_dash_opacity"]], 0.96],
                "line-dasharray": [1.2, 0.8],
            },
        });
    }

    if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
            id: LABEL_LAYER_ID,
            type: "symbol",
            source: LABEL_SOURCE_ID,
            layout: {
                "text-field": ["to-string", ["get", "label"]],
                "text-size": ["coalesce", ["to-number", ["get", "size"]], 14],
                "text-font": [...MAP_EMPHASIS_TEXT_FONT_STACK],
                "text-anchor": "bottom",
                "text-offset": [0, -0.8],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
            },
            paint: {
                "text-color": ["coalesce", ["get", "color"], "#ffffff"],
                "text-halo-color": "#020617",
                "text-halo-width": 1.6,
            },
        });
    }
}

function ensureSource(map: maplibregl.Map, sourceId: string) {
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, {
        type: "geojson",
        data: EMPTY_EFFECT_COLLECTION,
    });
}

function updateSource(
    map: maplibregl.Map,
    sourceId: string,
    features: Array<EffectFeature | LabelFeature>
) {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
        type: "FeatureCollection",
        features,
    } as Parameters<maplibregl.GeoJSONSource["setData"]>[0]);
}

function findFeatureById(draft: FeatureCollection, geometryId: string) {
    const id = String(geometryId || "").trim();
    if (!id) return null;
    return draft.features.find((feature) => String(feature.properties.id) === id) || null;
}

function findFeaturesById(draft: FeatureCollection, geometryIds: string[]) {
    const idSet = new Set(geometryIds.map((id) => String(id || "").trim()).filter(Boolean));
    if (!idSet.size) return [];
    return draft.features.filter((feature) => idSet.has(String(feature.properties.id)));
}

function cloneFeatureWithProps(feature: Feature, props: Record<string, unknown>): EffectFeature {
    return {
        ...feature,
        properties: {
            ...feature.properties,
            ...props,
        },
    };
}

function getFeatureCenter(feature: Feature): [number, number] | null {
    if (feature.geometry.type === "Point") return feature.geometry.coordinates;
    if (feature.geometry.type === "MultiPoint") return feature.geometry.coordinates[0] || null;
    const bbox = getFeatureCollectionBBox({
        type: "FeatureCollection",
        features: [feature],
    });
    if (!bbox) return null;
    return [
        (bbox.minLng + bbox.maxLng) / 2,
        (bbox.minLat + bbox.maxLat) / 2,
    ];
}

function getDefaultFeatureLabel(feature: Feature) {
    return String(
        feature.properties.point_label ||
        feature.properties.line_label ||
        feature.properties.polygon_label ||
        feature.properties.entity_name ||
        feature.properties.entity_names?.[0] ||
        feature.properties.id ||
        ""
    );
}

function getPathCoordinates(geometry: Geometry): [number, number][] {
    switch (geometry.type) {
        case "Point":
            return [geometry.coordinates];
        case "MultiPoint":
        case "LineString":
            return geometry.coordinates;
        case "MultiLineString":
            return geometry.coordinates.flat();
        case "Polygon":
            return geometry.coordinates[0] || [];
        case "MultiPolygon":
            return geometry.coordinates.flatMap((polygon) => polygon[0] || []);
    }
}

function removeDuplicateCoordinates(coordinates: [number, number][]) {
    const result: [number, number][] = [];
    for (const coord of coordinates) {
        const last = result[result.length - 1];
        if (last && last[0] === coord[0] && last[1] === coord[1]) continue;
        if (!Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) continue;
        result.push(coord);
    }
    return result;
}

type MeasuredLngLat = {
    coordinate: [number, number];
    distance: number;
};

function buildMeasuredLngLatPath(path: [number, number][]): MeasuredLngLat[] {
    let distance = 0;
    return path.map((coordinate, index) => {
        if (index > 0) {
            distance += distanceLngLat(path[index - 1], coordinate);
        }
        return { coordinate, distance };
    });
}

function interpolateMeasuredPath(path: MeasuredLngLat[], targetDistance: number): [number, number] {
    if (targetDistance <= 0) return path[0].coordinate;
    for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const next = path[index];
        if (targetDistance > next.distance) continue;
        const segmentDistance = next.distance - previous.distance;
        const ratio = segmentDistance > 0 ? (targetDistance - previous.distance) / segmentDistance : 0;
        return [
            previous.coordinate[0] + (next.coordinate[0] - previous.coordinate[0]) * ratio,
            previous.coordinate[1] + (next.coordinate[1] - previous.coordinate[1]) * ratio,
        ];
    }
    return path[path.length - 1].coordinate;
}

function distanceLngLat(left: [number, number], right: [number, number]) {
    const lngDistance = (right[0] - left[0]) * Math.cos(((left[1] + right[1]) / 2) * Math.PI / 180);
    const latDistance = right[1] - left[1];
    return Math.hypot(lngDistance, latDistance);
}

function getBearing(left: [number, number], right: [number, number]) {
    const lng1 = left[0] * Math.PI / 180;
    const lat1 = left[1] * Math.PI / 180;
    const lng2 = right[0] * Math.PI / 180;
    const lat2 = right[1] * Math.PI / 180;
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    return Math.atan2(y, x) * 180 / Math.PI;
}

function isPointGeometry(geometry: Geometry) {
    return geometry.type === "Point" || geometry.type === "MultiPoint";
}

function polygonFilter(): maplibregl.ExpressionSpecification {
    return [
        "any",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["geometry-type"], "MultiPolygon"],
    ];
}

function pointFilter(): maplibregl.ExpressionSpecification {
    return [
        "any",
        ["==", ["geometry-type"], "Point"],
        ["==", ["geometry-type"], "MultiPoint"],
    ];
}

function nonPointFilter(): maplibregl.ExpressionSpecification {
    return [
        "any",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["geometry-type"], "MultiLineString"],
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["geometry-type"], "MultiPolygon"],
    ];
}

function normalizeColor(value: string, fallback: string) {
    const raw = String(value || "").trim();
    return raw.length > 0 ? raw : fallback;
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}
