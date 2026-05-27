import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";
import { normalizeFeatureEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import { normalizeTimelineYearValue } from "@/uhm/lib/utils/timeline";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import type { FeatureCollection } from "@/uhm/types/geo";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { PreviewRelationIndex } from "./types";

export function buildSnapshotPreviewRelationIndex(options: {
    draft: FeatureCollection;
    entities: Entity[];
    wikis: WikiSnapshot[];
    entityWikiLinks: EntityWikiLinkSnapshot[];
    wikiCache: Record<string, Wiki>;
    projectId: string;
}): PreviewRelationIndex {
    const next = createEmptyPreviewRelationIndex();

    for (const entity of options.entities || []) {
        const id = String(entity?.id || "").trim();
        if (!id) continue;
        next.entitiesById[id] = entity;
    }

    for (const wikiSnapshot of options.wikis || []) {
        if (!wikiSnapshot || wikiSnapshot.operation === "delete") continue;
        const wiki = snapshotWikiToWiki(wikiSnapshot, options.wikiCache, options.projectId);
        if (!wiki?.id) continue;
        next.wikiById[wiki.id] = wiki;
        const slug = String(wiki.slug || "").trim();
        if (slug) next.wikiBySlug[slug] = wiki;
    }

    for (const feature of options.draft.features || []) {
        const geometryId = String(feature.properties.id);
        for (const entityId of normalizeFeatureEntityIds(feature)) {
            if (!next.entitiesById[entityId]) {
                next.entitiesById[entityId] = { id: entityId, name: entityId };
            }
            pushUniqueString(next.geometryEntityIds, geometryId, entityId);
            pushFeatureForEntity(next, entityId, feature);
        }
    }

    for (const link of options.entityWikiLinks || []) {
        if (!link || link.operation === "delete") continue;
        const entityId = String(link.entity_id || "").trim();
        const wikiId = String(link.wiki_id || "").trim();
        const entity = next.entitiesById[entityId] || null;
        const wiki = next.wikiById[wikiId] || null;
        if (!entity || !wiki) continue;

        pushWikiForEntity(next, entityId, wiki);
    }

    normalizePreviewRelationArrays(next);
    return next;
}

export function buildPublicPreviewRelationIndex(options: {
    entities: Entity[];
    entityGeometriesById: Record<string, FeatureCollection>;
    entityWikisById: Record<string, Wiki[]>;
}): PreviewRelationIndex {
    const next = createEmptyPreviewRelationIndex();

    for (const entity of options.entities || []) {
        const id = String(entity?.id || "").trim();
        if (!id) continue;
        next.entitiesById[id] = entity;
    }

    for (const [entityId, geometries] of Object.entries(options.entityGeometriesById || {})) {
        const id = String(entityId || "").trim();
        if (!id) continue;
        if (!next.entitiesById[id]) next.entitiesById[id] = { id, name: id };

        for (const feature of geometries.features || []) {
            const geometryId = String(feature.properties.id);
            pushUniqueString(next.geometryEntityIds, geometryId, id);
            pushFeatureForEntity(next, id, feature);
        }
    }

    for (const [entityId, wikis] of Object.entries(options.entityWikisById || {})) {
        const id = String(entityId || "").trim();
        if (!id) continue;
        if (!next.entitiesById[id]) next.entitiesById[id] = { id, name: id };

        for (const wiki of wikis || []) {
            if (!wiki?.id) continue;
            next.wikiById[wiki.id] = wiki;
            const slug = String(wiki.slug || "").trim();
            if (slug) next.wikiBySlug[slug] = wiki;
            pushWikiForEntity(next, id, wiki);
        }
    }

    normalizePreviewRelationArrays(next);
    return next;
}

export function buildEntityLabelContextDraft(
    draft: FeatureCollection,
    relationsOrEntities: PreviewRelationIndex | Entity[]
): FeatureCollection {
    if (!draft.features.length) return draft;

    const resolveEntityIds = Array.isArray(relationsOrEntities)
        ? (feature: FeatureCollection["features"][number]) => normalizeFeatureEntityIds(feature)
        : (feature: FeatureCollection["features"][number]) =>
            relationsOrEntities.geometryEntityIds[String(feature.properties.id)] || normalizeFeatureEntityIds(feature);

    const entityById = new globalThis.Map<string, Entity>();
    if (Array.isArray(relationsOrEntities)) {
        for (const entity of relationsOrEntities || []) {
            const id = String(entity?.id || "").trim();
            if (!id) continue;
            entityById.set(id, entity);
        }
    } else {
        for (const [id, entity] of Object.entries(relationsOrEntities.entitiesById)) {
            if (!id || !entity) continue;
            entityById.set(id, entity);
        }
    }

    return {
        ...draft,
        features: draft.features.map((feature) => {
            const entityIds = resolveEntityIds(feature);
            if (!entityIds.length) return feature;

            const candidates = entityIds.map((id) => {
                const entity = entityById.get(id) || null;
                const name = String(entity?.name || id).trim();
                if (!name) return null;
                return {
                    id,
                    name,
                    time_start: normalizeTimelineYearValue(entity?.time_start),
                    time_end: normalizeTimelineYearValue(entity?.time_end),
                };
            }).filter((candidate) => candidate !== null);

            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    entity_id: entityIds[0] || null,
                    entity_ids: entityIds,
                    entity_name: candidates[0]?.name || null,
                    entity_names: candidates.map((candidate) => candidate.name),
                    entity_label_candidates: candidates,
                },
            };
        }),
    };
}

export function createEmptyPreviewRelationIndex(): PreviewRelationIndex {
    return {
        entitiesById: {},
        entityGeometriesById: {},
        entityWikisById: {},
        geometryEntityIds: {},
        wikiEntityIdsById: {},
        wikiEntityIdsBySlug: {},
        wikiById: {},
        wikiBySlug: {},
    };
}

export function pushUniqueString(target: Record<string, string[]>, key: string, value: string) {
    if (!target[key]) {
        target[key] = [value];
        return;
    }
    if (!target[key].includes(value)) {
        target[key].push(value);
    }
}

export function normalizePreviewRelationArrays(target: PreviewRelationIndex | Record<string, string[]>) {
    if (isPreviewRelationIndex(target)) {
        normalizeRecordArrays(target.geometryEntityIds);
        normalizeRecordArrays(target.wikiEntityIdsById);
        normalizeRecordArrays(target.wikiEntityIdsBySlug);
        return;
    }
    normalizeRecordArrays(target);
}

function pushFeatureForEntity(
    target: PreviewRelationIndex,
    entityId: string,
    feature: FeatureCollection["features"][number]
) {
    if (!target.entityGeometriesById[entityId]) {
        target.entityGeometriesById[entityId] = { type: "FeatureCollection", features: [] };
    }
    const geometryId = String(feature.properties.id);
    if (!target.entityGeometriesById[entityId].features.some((item) => String(item.properties.id) === geometryId)) {
        target.entityGeometriesById[entityId].features.push(feature);
    }
}

function pushWikiForEntity(target: PreviewRelationIndex, entityId: string, wiki: Wiki) {
    if (!target.entityWikisById[entityId]) target.entityWikisById[entityId] = [];
    if (!target.entityWikisById[entityId].some((item) => item.id === wiki.id)) {
        target.entityWikisById[entityId].push(wiki);
    }

    pushUniqueString(target.wikiEntityIdsById, wiki.id, entityId);
    const slug = String(wiki.slug || "").trim();
    if (slug) pushUniqueString(target.wikiEntityIdsBySlug, slug, entityId);
}

function snapshotWikiToWiki(snapshot: WikiSnapshot, wikiCache: Record<string, Wiki>, projectId: string): Wiki {
    if (typeof snapshot.doc === "string") {
        return {
            id: snapshot.id,
            project_id: projectId,
            title: snapshot.title,
            slug: snapshot.slug ?? null,
            content: snapshot.doc || "",
        };
    }

    return wikiCache[snapshot.id] || {
        id: snapshot.id,
        project_id: projectId,
        title: snapshot.title,
        slug: snapshot.slug ?? null,
        content: "",
    };
}

function normalizeRecordArrays(target: Record<string, string[]>) {
    for (const key of Object.keys(target)) {
        target[key] = Array.from(new Set(target[key]));
    }
}

function isPreviewRelationIndex(value: PreviewRelationIndex | Record<string, string[]>): value is PreviewRelationIndex {
    return "geometryEntityIds" in value && "wikiEntityIdsById" in value;
}

