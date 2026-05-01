import type {
    Feature,
    FeatureCollection,
    FeatureProperties,
    Geometry,
} from "@/uhm/types/geo";
import type { Change } from "@/uhm/lib/editor/draft/editorTypes";

export const deepClone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

export function geometryEquals(a: Geometry | undefined, b: Geometry | undefined): boolean {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

export function featureEquals(a: Feature | undefined, b: Feature | undefined): boolean {
    if (!a || !b) return false;
    return JSON.stringify(a.geometry) === JSON.stringify(b.geometry) &&
        JSON.stringify(a.properties) === JSON.stringify(b.properties);
}

export function buildInitialMap(fc: FeatureCollection) {
    const map = new Map<FeatureProperties["id"], Feature>();
    for (const feature of fc.features) {
        map.set(feature.properties.id, deepClone(feature));
    }
    return map;
}

export function diffDraftToInitial(
    draft: FeatureCollection,
    initialMap: Map<FeatureProperties["id"], Feature>
) {
    const next = new Map<FeatureProperties["id"], Change>();
    const seen = new Set<FeatureProperties["id"]>();

    for (const feature of draft.features) {
        const id = feature.properties.id;
        seen.add(id);
        const initialFeature = initialMap.get(id);
        if (!initialFeature) {
            next.set(id, { action: "create", feature: deepClone(feature) });
        } else if (!featureEquals(initialFeature, feature)) {
            next.set(id, { action: "update", id, geometry: deepClone(feature.geometry) });
        }
    }

    for (const [id] of initialMap.entries()) {
        if (!seen.has(id)) {
            next.set(id, { action: "delete", id });
        }
    }

    return next;
}
