import { DEFAULT_ENTITY_TYPE_ID } from "@/uhm/lib/entityTypeOptions";
import type { Change } from "@/uhm/lib/editor/draft/editorTypes";
import type { PendingEntityCreate } from "@/uhm/lib/editor/session/sessionTypes";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { Feature, FeatureCollection, GeometrySnapshot, LinkScopeSnapshot } from "@/uhm/types/geo";
import type { EditorSnapshot, Section } from "@/uhm/types/sections";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/sections";

export function normalizeEditorSnapshot(raw: unknown): EditorSnapshot | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const snapshot = raw as EditorSnapshot;
    // Accept legacy snapshots (v1) and new ones (v2+). We only require that a FeatureCollection,
    // if present, is structurally valid. Everything else is treated as optional.
    const fc = (snapshot as any).editor_feature_collection as FeatureCollection | undefined;
    if (fc && fc.type === "FeatureCollection" && Array.isArray(fc.features)) {
        return snapshot;
    }
    return {
        ...snapshot,
        editor_feature_collection: undefined,
    };
}

export function buildEditorSnapshot(options: {
    section: Section;
    draft: FeatureCollection;
    changes: Change[];
    pendingEntities: PendingEntityCreate[];
    projectEntityRefs: EntitySnapshot[];
    wikis: WikiSnapshot[];
    entityWikiLinks: EntityWikiLinkSnapshot[];
    previousSnapshot: EditorSnapshot | null;
    hasPersistedFeature: (id: Feature["properties"]["id"]) => boolean;
}): EditorSnapshot {
    const changedIds = new Set(options.changes.map((change) =>
        String(change.action === "create" ? change.feature.properties.id : change.id)
    ));
    const deletedIds = new Set(
        options.changes
            .filter((change): change is Extract<Change, { action: "delete" }> => change.action === "delete")
            .map((change) => String(change.id))
    );
    const currentDraftIds = new Set(options.draft.features.map((feature) => String(feature.properties.id)));
    const previousFeatures = new globalThis.Map<string, Feature>();
    for (const feature of options.previousSnapshot?.editor_feature_collection?.features || []) {
        previousFeatures.set(String(feature.properties.id), feature);
        if (!currentDraftIds.has(String(feature.properties.id))) {
            deletedIds.add(String(feature.properties.id));
        }
    }

    const previousGeometryOps = new globalThis.Map<string, GeometrySnapshot["operation"]>();
    for (const item of options.previousSnapshot?.geometries || []) {
        const id = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : "";
        const operation = item.operation;
        if (id && operation) previousGeometryOps.set(id, operation);
    }

    const pendingEntityIds = new Set(options.pendingEntities.map((entity) => entity.id));
    const entityRows = new globalThis.Map<string, EntitySnapshot>();
    for (const entity of options.pendingEntities) {
        entityRows.set(entity.id, {
            id: entity.id,
            source: "inline",
            operation: "create",
            name: entity.name,
            slug: entity.slug,
            description: null,
            type_id: entity.type_id,
            status: entity.status,
            is_deleted: 0,
        });
    }

    for (const ref of options.projectEntityRefs || []) {
        const id = typeof ref?.id === "string" || typeof ref?.id === "number" ? String(ref.id) : "";
        if (!id || entityRows.has(id)) continue;
        const cloned = JSON.parse(JSON.stringify(ref)) as EntitySnapshot;
        entityRows.set(id, {
            ...cloned,
            id,
            source: cloned.source || "ref",
            ref: cloned.ref || { id },
            operation: "reference",
            is_deleted: cloned.is_deleted ?? 0,
        });
    }

    // Entities referenced by wiki links should be present as "reference" too.
    for (const link of options.entityWikiLinks || []) {
        const id = typeof link?.entity_id === "string" ? link.entity_id : "";
        if (!id || entityRows.has(id)) continue;
        entityRows.set(id, {
            id,
            source: "ref",
            ref: { id },
            operation: "reference",
            is_deleted: 0,
        });
    }

    for (const feature of options.draft.features) {
        for (const entityId of normalizeFeatureEntityIds(feature)) {
            if (entityRows.has(entityId)) continue;
            entityRows.set(entityId, {
                id: entityId,
                source: "ref",
                ref: { id: entityId },
                operation: "reference",
                name: feature.properties.entity_names?.[0] || feature.properties.entity_name || entityId,
                slug: null,
                description: null,
                type_id: feature.properties.entity_type_id || feature.properties.type || DEFAULT_ENTITY_TYPE_ID,
                status: 1,
                is_deleted: 0,
            });
        }
    }

    const geometries: GeometrySnapshot[] = options.draft.features.map((feature) => {
        const id = String(feature.properties.id);
        const previousOperation = previousGeometryOps.get(id);
        const previousFeature = previousFeatures.get(id);
        const changedFromPreviousSnapshot = previousFeature
            ? JSON.stringify(previousFeature) !== JSON.stringify(feature)
            : false;
        const operation: GeometrySnapshot["operation"] =
            previousOperation === "create"
                ? "create"
                : !previousFeature && (options.previousSnapshot || !options.hasPersistedFeature(feature.properties.id))
                    ? "create"
                    : changedIds.has(id) || changedFromPreviousSnapshot
                        ? "update"
                        : undefined;
        const bbox = getFeatureBBox(feature);
        return {
            id,
            operation,
            source: "inline",
            type: feature.properties.type || getDefaultTypeIdForFeature(feature),
            draw_geometry: feature.geometry,
            binding: normalizeFeatureBindingIds(feature),
            time_start: feature.properties.time_start ?? null,
            time_end: feature.properties.time_end ?? null,
            bbox: bbox
                ? {
                    min_lng: bbox.minLng,
                    min_lat: bbox.minLat,
                    max_lng: bbox.maxLng,
                    max_lat: bbox.maxLat,
                }
                : null,
            is_deleted: 0,
        };
    });

    for (const id of deletedIds) {
        geometries.push({
            id,
            operation: "delete",
            is_deleted: 1,
        });
    }

    const linkScopes: LinkScopeSnapshot[] = options.draft.features
        .map((feature) => ({
            geometry_id: String(feature.properties.id),
            operation: "reference" as const,
            entity_ids: normalizeFeatureEntityIds(feature),
        }))
        .filter((scope) => scope.entity_ids.length > 0);

    const previousWikis = new globalThis.Map<string, WikiSnapshot>();
    for (const item of options.previousSnapshot?.wikis || []) {
        if (!item || typeof item !== "object") continue;
        const id = typeof (item as any).id === "string" ? String((item as any).id) : "";
        if (id) previousWikis.set(id, item as WikiSnapshot);
    }

    // Wikis in snapshot_json are treated as current state (not a delta-table like geometries[]).
    // Operation semantics:
    // - create/update/delete: this commit changes the wiki itself
    // - reference: this wiki is a ref used for linking (entity<->wiki), not a modification
    const wikis: WikiSnapshot[] = (options.wikis || [])
        .filter((w) => w && typeof w.id === "string" && w.id.trim().length > 0)
        .map((w) => {
            const prev = previousWikis.get(w.id) || null;
            const cloned = JSON.parse(JSON.stringify(w)) as WikiSnapshot;

            cloned.source = cloned.source || "inline";

            // Ref wiki: always mark as reference (used for linking, not changed here).
            if (cloned.source === "ref") {
                cloned.ref = cloned.ref || { id: cloned.id };
                cloned.operation = "reference";
                return cloned;
            }

            // Inline wiki: if explicitly marked create/update/delete by UI, keep it.
            if (cloned.operation === "create" || cloned.operation === "update" || cloned.operation === "delete") {
                return cloned;
            }

            // Inline wiki with no explicit operation: mark update only if changed; otherwise omit operation.
            if (!prev) {
                // New wiki that somehow has no op set: treat as create.
                cloned.operation = "create";
                return cloned;
            }

            const changed = (() => {
                try {
                    const prevComparable = { title: (prev as any).title, doc: (prev as any).doc };
                    const nextComparable = { title: (cloned as any).title, doc: (cloned as any).doc };
                    return JSON.stringify(prevComparable) !== JSON.stringify(nextComparable);
                } catch {
                    return true;
                }
            })();

            cloned.operation = changed ? "update" : undefined;
            return cloned;
        });

    return {
        schema_version: 2,
        editor_feature_collection: JSON.parse(JSON.stringify(options.draft)) as FeatureCollection,
        entities: Array.from(entityRows.values()).map((entity) => {
            const id = String(entity.id || "");
            if (pendingEntityIds.has(id)) return entity;
            return entity;
        }),
        geometries,
        link_scopes: linkScopes,
        wikis,
        entity_wikis: JSON.parse(JSON.stringify(options.entityWikiLinks || [])) as EntityWikiLinkSnapshot[],
    };
}

export function getDefaultTypeIdForFeature(feature: Feature): string {
    const preset = feature.properties.geometry_preset;
    if (preset === "line") return "defense_line";
    if (preset === "point") return "city";
    if (preset === "circle-area") return "war";
    if (preset === "polygon") return DEFAULT_ENTITY_TYPE_ID;

    const geometryType = feature.geometry.type;
    if (geometryType === "LineString" || geometryType === "MultiLineString") {
        return "defense_line";
    }
    if (geometryType === "Point" || geometryType === "MultiPoint") {
        return "city";
    }
    return DEFAULT_ENTITY_TYPE_ID;
}

export function normalizeFeatureEntityIds(feature: Feature): string[] {
    const fromArray = Array.isArray(feature.properties.entity_ids)
        ? feature.properties.entity_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];

    if (fromArray.length) {
        return uniqueEntityIds(fromArray);
    }

    const single = feature.properties.entity_id;
    if (typeof single === "string" && single.trim().length > 0) {
        return [single.trim()];
    }

    return [];
}

export function normalizeFeatureBindingIds(feature: Feature): string[] {
    const rawBinding = feature.properties.binding;
    if (!Array.isArray(rawBinding)) return [];
    return uniqueEntityIds(rawBinding
        .map((id) => {
            if (typeof id !== "string" && typeof id !== "number") return "";
            return String(id).trim();
        })
        .filter((id) => id.length > 0));
}

export function parseBindingInput(raw: string): string[] {
    if (!raw.trim().length) return [];
    return uniqueEntityIds(
        raw
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
    );
}

export function uniqueEntityIds(ids: string[]): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawId of ids) {
        const id = rawId.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }
    return deduped;
}

function getFeatureBBox(feature: Feature): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
    const points = collectCoordinatePairs(feature.geometry.coordinates);
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

function collectCoordinatePairs(value: unknown): Array<[number, number]> {
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
