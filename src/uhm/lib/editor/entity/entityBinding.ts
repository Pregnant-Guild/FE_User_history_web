import type { Entity } from "@/uhm/types/entities";
import type { Feature, FeatureProperties } from "@/uhm/types/geo";
import { normalizeFeatureEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import { newId } from "@/uhm/lib/utils/id";

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
    _feature: Feature,
    entityIds: string[],
    entities: Entity[]
): Partial<FeatureProperties> {
    const primaryEntityId = entityIds[0] || null;
    const primaryEntity = primaryEntityId
        ? entities.find((entity) => entity.id === primaryEntityId) || null
        : null;
    const entityNames = entityIds
        .map((id) => entities.find((entity) => entity.id === id)?.name || "")
        .filter((name) => name.length > 0);
    const entityLabelCandidates = entityIds
        .map((id) => {
            const entity = entities.find((item) => item.id === id) || null;
            if (!entity) return null;
            const name = String(entity.name || "").trim();
            if (!name) return null;
            return {
                id,
                name,
                time_start: entity.time_start ?? null,
                time_end: entity.time_end ?? null,
            };
        })
        .filter((candidate) => candidate !== null);

    return {
        entity_id: primaryEntityId,
        entity_ids: entityIds,
        entity_name: primaryEntity?.name || null,
        entity_names: entityNames,
        entity_label_candidates: entityLabelCandidates,
    };
}
