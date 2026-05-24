import type { Feature, FeatureCollection } from "@/uhm/types/geo";

export function normalizeBoundWithId(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const id = String(value).trim();
    return id.length ? id : null;
}

export function normalizeFeatureBoundWith(feature: Feature): string | null {
    return normalizeBoundWithId(feature.properties.bound_with);
}

export function normalizeLegacyGeometryBindingIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const rawId of value) {
        const id = normalizeBoundWithId(rawId);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

export function getDirectGeometryChildIds(
    fc: FeatureCollection,
    parentId: string | number | null | undefined
): string[] {
    const normalizedParentId = normalizeBoundWithId(parentId);
    if (!normalizedParentId) return [];

    return fc.features
        .filter((feature) => normalizeFeatureBoundWith(feature) === normalizedParentId)
        .map((feature) => String(feature.properties.id));
}

export function wouldCreateGeometryBoundWithCycle(
    features: Feature[],
    childId: string | number,
    parentId: string | number
): boolean {
    const normalizedChildId = normalizeBoundWithId(childId);
    const normalizedParentId = normalizeBoundWithId(parentId);
    if (!normalizedChildId || !normalizedParentId) return false;

    const parentByChild = new Map<string, string>();
    for (const feature of features) {
        const id = String(feature.properties.id);
        const boundWith = normalizeFeatureBoundWith(feature);
        if (boundWith) parentByChild.set(id, boundWith);
    }

    const seen = new Set<string>();
    let cursor: string | null = normalizedParentId;
    while (cursor) {
        if (cursor === normalizedChildId) return true;
        if (seen.has(cursor)) return false;
        seen.add(cursor);
        cursor = parentByChild.get(cursor) || null;
    }

    return false;
}
