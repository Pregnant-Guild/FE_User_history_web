import type { Entity } from "@/uhm/types/entities";
import type { Feature, FeatureProperties } from "@/uhm/types/geo";
import type { PendingEntityCreate } from "@/uhm/lib/editor/session/sessionTypes";
import { normalizeFeatureEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import { newId } from "@/uhm/lib/id";

export function mergeEntitiesWithPending(
    persistedEntities: Entity[],
    pendingCreates: PendingEntityCreate[]
): Entity[] {
    if (!pendingCreates.length) {
        return persistedEntities;
    }

    const seen = new Set<string>();
    const pendingAsEntities: Entity[] = [];
    for (const pending of pendingCreates) {
        if (seen.has(pending.id)) continue;
        seen.add(pending.id);
        pendingAsEntities.push({
            id: pending.id,
            name: pending.name,
            slug: pending.slug,
            type_id: pending.type_id,
            status: pending.status,
            geometry_count: 0,
            created_at: undefined,
            updated_at: undefined,
        });
    }

    const nextPersisted = persistedEntities.filter((entity) => !seen.has(entity.id));
    return [...pendingAsEntities, ...nextPersisted];
}

export function mergeEntitySearchResults(
    remoteRows: Entity[],
    localRows: Entity[]
): Entity[] {
    const merged: Entity[] = [];
    const seen = new Set<string>();

    for (const row of localRows) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
    }

    for (const row of remoteRows) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
    }

    return merged;
}

export function formatEntityNamesForDisplay(feature: Feature, entities: Entity[]): string {
    const entityIds = normalizeFeatureEntityIds(feature);
    if (!entityIds.length) return "Chưa gắn";

    const names = entityIds
        .map((id) => entities.find((entity) => entity.id === id)?.name || id)
        .filter((name) => name.trim().length > 0);
    return names.join(", ");
}

export function buildClientEntityId(): string {
    return newId();
}

export function buildFeatureEntityPatch(
    feature: Feature,
    entityIds: string[],
    entities: Entity[]
): Partial<FeatureProperties> {
    const primaryEntityId = entityIds[0] || null;
    const primaryEntity = primaryEntityId
        ? entities.find((entity) => entity.id === primaryEntityId) || null
        : null;
    const nextGeometryType = resolveGeometryTypeFromEntityIds(entityIds, entities) ||
        feature.properties.type ||
        null;
    const entityNames = entityIds
        .map((id) => entities.find((entity) => entity.id === id)?.name || "")
        .filter((name) => name.length > 0);

    return {
        type: nextGeometryType,
        entity_id: primaryEntityId,
        entity_ids: entityIds,
        entity_name: primaryEntity?.name || null,
        entity_names: entityNames,
        entity_type_id: primaryEntity?.type_id || null,
    };
}

function resolveGeometryTypeFromEntityIds(
    entityIds: string[],
    entities: Entity[]
): string | null {
    const primaryEntityId = entityIds[0] || null;
    if (!primaryEntityId) return null;
    const primaryEntity = entities.find((entity) => entity.id === primaryEntityId) || null;
    return primaryEntity?.type_id || null;
}
