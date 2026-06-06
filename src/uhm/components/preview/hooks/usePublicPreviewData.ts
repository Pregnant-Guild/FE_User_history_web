"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchGeometriesByBBox, fetchGeometriesByBoundWith } from "@/uhm/api/geometries";
import { ApiError } from "@/uhm/api/http";
import {
    fetchEntitiesByGeometryIds,
    fetchWikisByEntityIdsWithPreviews,
} from "@/uhm/api/relations";
import type { Wiki } from "@/uhm/api/wikis";
import { EMPTY_FEATURE_COLLECTION, WORLD_BBOX } from "@/uhm/lib/map/geo/constants";
import {
    buildEntityLabelContextDraft,
    buildPublicPreviewRelationIndex,
} from "@/uhm/lib/preview/relationIndex";
import {
    EMPTY_PREVIEW_RELATIONS,
    type PreviewRelationIndex,
} from "@/uhm/lib/preview/types";
import type { Entity } from "@/uhm/types/entities";
import type { FeatureCollection, FeatureEntityPreview, FeatureWikiPreview } from "@/uhm/types/geo";
import type { BattleReplay } from "@/uhm/types/projects";
import { fetchBattleReplaysByGeometryIds } from "@/uhm/api/battleReplays";

export function usePublicPreviewData(options: {
    timelineYear: number;
    timeRange: number;
    enabled?: boolean;
}) {
    const { timelineYear, timeRange, enabled = true } = options;
    const [data, setData] = useState<FeatureCollection>(EMPTY_FEATURE_COLLECTION);
    const [relations, setRelations] = useState<PreviewRelationIndex>(EMPTY_PREVIEW_RELATIONS);
    const [replays, setReplays] = useState<BattleReplay[]>([]);
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
    const [isRelationsLoading, setIsRelationsLoading] = useState(false);
    const [relationsStatus, setRelationsStatus] = useState<string | null>(null);
    const timelineFetchRequestRef = useRef(0);
    const loadedChildGeometryParentIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled) {
            setData(EMPTY_FEATURE_COLLECTION);
            setRelations(EMPTY_PREVIEW_RELATIONS);
            setReplays([]);
            setIsTimelineLoading(false);
            setIsRelationsLoading(false);
            setTimelineStatus(null);
            setRelationsStatus(null);
            loadedChildGeometryParentIdsRef.current.clear();
            return;
        }

        let disposed = false;
        const requestId = ++timelineFetchRequestRef.current;

        async function loadByTimeline() {
            setIsTimelineLoading(true);
            setIsRelationsLoading(false);
            setTimelineStatus(null);
            setRelationsStatus(null);
            loadedChildGeometryParentIdsRef.current.clear();
            let next: FeatureCollection;

            try {
                next = await fetchGeometriesByBBox({ ...WORLD_BBOX, time: timelineYear, timeRange, hasBound: false });
                if (disposed || requestId !== timelineFetchRequestRef.current) return;
            } catch (err) {
                if (err instanceof ApiError) {
                    console.error("Load public map geometries failed", err.body);
                } else {
                    console.error("Load public map geometries failed", err);
                }
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setData(EMPTY_FEATURE_COLLECTION);
                    setRelations(EMPTY_PREVIEW_RELATIONS);
                    setReplays([]);
                    setTimelineStatus("Không tải được dữ liệu bản đồ tại mốc thời gian đã chọn.");
                }
                return;
            } finally {
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setIsTimelineLoading(false);
                }
            }

            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const geometryIds = next.features
                .map((feature) => String(feature.properties.id))
                .filter((id) => Boolean(id) && UUID_REGEX.test(id));
            if (!geometryIds.length) {
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setData(next);
                    setRelations(EMPTY_PREVIEW_RELATIONS);
                    setReplays([]);
                }
                return;
            }

            setIsRelationsLoading(true);
            setRelationsStatus("Đang nạp liên kết entity/wiki.");
            let entitiesByGeometryId: Record<string, Entity[]>;
            let fetchedReplays: BattleReplay[] = [];
            const geometryIdsWithReplays = getGeometryIdsWithReplays(next);

            try {
                const [entities, replaysRes] = await Promise.all([
                    fetchEntitiesByGeometryIds(geometryIds),
                    geometryIdsWithReplays.length
                        ? fetchBattleReplaysByGeometryIds(geometryIdsWithReplays).catch((err) => {
                            console.error("Failed to load replays:", err);
                            return {};
                        })
                        : Promise.resolve({}),
                ]);
                entitiesByGeometryId = entities;
                
                const uniqueReplaysMap = new Map<string, BattleReplay>();
                for (const list of Object.values(replaysRes)) {
                    for (const item of list || []) {
                        if (item && item.id) {
                            uniqueReplaysMap.set(item.id, item);
                        }
                    }
                }
                fetchedReplays = Array.from(uniqueReplaysMap.values());

                if (disposed || requestId !== timelineFetchRequestRef.current) return;
            } catch (err) {
                if (err instanceof ApiError) {
                    console.error("Load public map geometry-entity relations failed", err.body);
                } else {
                    console.error("Load public map geometry-entity relations failed", err);
                }
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setData(next); // Fallback to new geometry even if relations failed
                    setRelations(EMPTY_PREVIEW_RELATIONS);
                    setReplays([]);
                    setRelationsStatus("Không tải được liên kết entity/wiki cho bản đồ.");
                    setIsRelationsLoading(false);
                }
                return;
            }

            const entityIds = uniqueStrings(
                Object.values(entitiesByGeometryId)
                    .flat()
                    .map((entity) => entity.id)
            );
            let wikisByEntityId: Record<string, Wiki[]> = {};
            if (entityIds.length) {
                try {
                    wikisByEntityId = await fetchWikisByEntityIdsWithPreviews(entityIds);
                    if (disposed || requestId !== timelineFetchRequestRef.current) return;
                } catch (err) {
                    if (err instanceof ApiError) {
                        console.error("Load initial entity-wiki previews failed", err.body);
                    } else {
                        console.error("Load initial entity-wiki previews failed", err);
                    }
                }
            }

            const entityOnlyRelations = buildPublicPreviewRelationIndex(
                buildRelationInputFromGeometryRelations(next, entitiesByGeometryId, wikisByEntityId)
            );
            
            // Apply BOTH geometries and relations at the exact same React render cycle!
            setData(next);
            setRelations(entityOnlyRelations);
            setReplays(fetchedReplays);
            
            // Mark loading as complete immediately so map transitions and becomes interactive
            setIsRelationsLoading(false);
            setRelationsStatus(null);
        }

        loadByTimeline();
        return () => {
            disposed = true;
        };
    }, [timelineYear, timeRange, enabled]);

    const labelContextDraft = useMemo(
        () => buildEntityLabelContextDraft(data, relations),
        [data, relations]
    );

    const ensureChildrenForGeometry = useCallback(async (parentGeometryId: string | number | null | undefined) => {
        const parentId = String(parentGeometryId || "").trim();
        if (!parentId || loadedChildGeometryParentIdsRef.current.has(parentId)) return;
        loadedChildGeometryParentIdsRef.current.add(parentId);

        let childFc: FeatureCollection;
        try {
            childFc = await fetchGeometriesByBoundWith(parentId);
        } catch (err) {
            loadedChildGeometryParentIdsRef.current.delete(parentId);
            console.error("Load child geometries failed", err);
            return;
        }

        const childGeometryIds = uniqueStrings(childFc.features.map((feature) => String(feature.properties.id || "")));
        if (!childGeometryIds.length) return;
        const childGeometryIdsWithReplays = getGeometryIdsWithReplays(childFc);

        setData((prev) => mergeFeatureCollections(prev, childFc));

        let entitiesByGeometryId: Record<string, Entity[]> = {};
        let wikisByEntityId: Record<string, Wiki[]> = {};
        try {
            entitiesByGeometryId = await fetchEntitiesByGeometryIds(childGeometryIds);
            const entityIds = uniqueStrings(
                Object.values(entitiesByGeometryId)
                    .flat()
                    .map((entity) => entity.id)
            );
            if (entityIds.length) {
                wikisByEntityId = await fetchWikisByEntityIdsWithPreviews(entityIds);
            }
        } catch (err) {
            console.error("Load child geometry relations failed", err);
        }

        const childRelations = buildPublicPreviewRelationIndex(
            buildRelationInputFromGeometryRelations(childFc, entitiesByGeometryId, wikisByEntityId)
        );
        setRelations((prev) => mergePreviewRelationIndexes(prev, childRelations));

        try {
            if (!childGeometryIdsWithReplays.length) return;
            const replayRows = await fetchBattleReplaysByGeometryIds(childGeometryIdsWithReplays);
            const childReplays = Object.values(replayRows).flat();
            if (childReplays.length) {
                setReplays((prev) => mergeReplays(prev, childReplays));
            }
        } catch (err) {
            console.error("Load child geometry replays failed", err);
        }
    }, []);

    return {
        data,
        renderDraft: labelContextDraft,
        labelContextDraft,
        relations,
        setRelations,
        isTimelineLoading,
        timelineStatus,
        isRelationsLoading,
        relationsStatus,
        replays,
        ensureChildrenForGeometry,
    };
}

function buildRelationInputFromGeometryRelations(
    draft: FeatureCollection,
    entitiesByGeometryId: Record<string, Entity[]>,
    wikisByEntityId: Record<string, Wiki[]>
): {
    entities: Entity[];
    entityGeometriesById: Record<string, FeatureCollection>;
    entityWikisById: Record<string, Wiki[]>;
} {
    const entitiesById: Record<string, Entity> = {};
    const entityGeometriesById: Record<string, FeatureCollection> = {};
    const mergedWikisByEntityId: Record<string, Wiki[]> = {};

    for (const feature of draft.features) {
        const geometryId = String(feature.properties.id);
        const embeddedEntities = Array.isArray(feature.properties.public_entity_previews)
            ? feature.properties.public_entity_previews
            : [];
        for (const entity of entitiesByGeometryId[geometryId] || []) {
            const id = String(entity?.id || "").trim();
            if (!id) continue;
            entitiesById[id] = entity;
            pushFeature(entityGeometriesById, id, feature);
        }
        for (const entityPreview of embeddedEntities) {
            const entity = featureEntityPreviewToEntity(entityPreview);
            if (!entity) continue;
            entitiesById[entity.id] = {
                ...entity,
                ...entitiesById[entity.id],
            };
            pushFeature(entityGeometriesById, entity.id, feature);
            pushWikis(
                mergedWikisByEntityId,
                entity.id,
                (entityPreview.wikis || []).map(featureWikiPreviewToWiki).filter((wiki): wiki is Wiki => Boolean(wiki))
            );
        }
    }

    for (const [entityId, wikis] of Object.entries(wikisByEntityId || {})) {
        pushWikis(mergedWikisByEntityId, entityId, wikis || []);
    }

    return {
        entities: Object.values(entitiesById),
        entityGeometriesById,
        entityWikisById: mergedWikisByEntityId,
    };
}

function featureEntityPreviewToEntity(preview: FeatureEntityPreview): Entity | null {
    const id = String(preview?.id || "").trim();
    if (!id) return null;
    return {
        id,
        name: String(preview.name || id).trim() || id,
        description: preview.description ?? null,
        time_start: preview.time_start ?? null,
        time_end: preview.time_end ?? null,
    };
}

function featureWikiPreviewToWiki(preview: FeatureWikiPreview): Wiki | null {
    const id = String(preview?.id || "").trim();
    if (!id) return null;
    return {
        id,
        project_id: "",
        title: preview.title || undefined,
        slug: preview.slug ?? null,
        content: preview.content || "",
        preview_quote: preview.preview_quote ?? null,
    };
}

function pushWikis(target: Record<string, Wiki[]>, entityId: string, wikis: Wiki[]) {
    const id = String(entityId || "").trim();
    if (!id) return;
    if (!target[id]) target[id] = [];
    for (const wiki of wikis || []) {
        if (!wiki?.id) continue;
        const existingIndex = target[id].findIndex((item) => item.id === wiki.id);
        if (existingIndex >= 0) {
            target[id][existingIndex] = {
                ...target[id][existingIndex],
                ...wiki,
            };
        } else {
            target[id].push(wiki);
        }
    }
}

function pushFeature(target: Record<string, FeatureCollection>, entityId: string, feature: FeatureCollection["features"][number]) {
    if (!target[entityId]) target[entityId] = { type: "FeatureCollection", features: [] };
    if (!target[entityId].features.some((item) => String(item.properties.id) === String(feature.properties.id))) {
        target[entityId].features.push(feature);
    }
}

function mergeFeatureCollections(base: FeatureCollection, incoming: FeatureCollection): FeatureCollection {
    const byId = new Map<string, FeatureCollection["features"][number]>();
    for (const feature of base.features || []) {
        byId.set(String(feature.properties.id), feature);
    }
    for (const feature of incoming.features || []) {
        byId.set(String(feature.properties.id), feature);
    }
    return {
        type: "FeatureCollection",
        features: Array.from(byId.values()),
    };
}

function mergePreviewRelationIndexes(base: PreviewRelationIndex, incoming: PreviewRelationIndex): PreviewRelationIndex {
    return {
        entitiesById: {
            ...base.entitiesById,
            ...incoming.entitiesById,
        },
        entityGeometriesById: mergeFeatureCollectionRecords(base.entityGeometriesById, incoming.entityGeometriesById),
        entityWikisById: mergeWikiRecords(base.entityWikisById, incoming.entityWikisById),
        geometryEntityIds: mergeStringArrayRecords(base.geometryEntityIds, incoming.geometryEntityIds),
        wikiEntityIdsById: mergeStringArrayRecords(base.wikiEntityIdsById, incoming.wikiEntityIdsById),
        wikiEntityIdsBySlug: mergeStringArrayRecords(base.wikiEntityIdsBySlug, incoming.wikiEntityIdsBySlug),
        wikiById: {
            ...base.wikiById,
            ...incoming.wikiById,
        },
        wikiBySlug: {
            ...base.wikiBySlug,
            ...incoming.wikiBySlug,
        },
    };
}

function mergeFeatureCollectionRecords(
    base: Record<string, FeatureCollection>,
    incoming: Record<string, FeatureCollection>
): Record<string, FeatureCollection> {
    const next = { ...base };
    for (const [entityId, fc] of Object.entries(incoming || {})) {
        next[entityId] = next[entityId] ? mergeFeatureCollections(next[entityId], fc) : fc;
    }
    return next;
}

function mergeWikiRecords(base: Record<string, Wiki[]>, incoming: Record<string, Wiki[]>): Record<string, Wiki[]> {
    const next: Record<string, Wiki[]> = { ...base };
    for (const [entityId, wikis] of Object.entries(incoming || {})) {
        next[entityId] = mergeWikis(next[entityId] || [], wikis || []);
    }
    return next;
}

function mergeWikis(base: Wiki[], incoming: Wiki[]): Wiki[] {
    const byId = new Map<string, Wiki>();
    for (const wiki of base || []) {
        if (wiki?.id) byId.set(wiki.id, wiki);
    }
    for (const wiki of incoming || []) {
        if (wiki?.id) {
            byId.set(wiki.id, {
                ...byId.get(wiki.id),
                ...wiki,
            });
        }
    }
    return Array.from(byId.values());
}

function mergeStringArrayRecords(base: Record<string, string[]>, incoming: Record<string, string[]>): Record<string, string[]> {
    const next: Record<string, string[]> = { ...base };
    for (const [key, values] of Object.entries(incoming || {})) {
        next[key] = uniqueStrings([...(next[key] || []), ...(values || [])]);
    }
    return next;
}

function mergeReplays(base: BattleReplay[], incoming: BattleReplay[]): BattleReplay[] {
    const byId = new Map<string, BattleReplay>();
    for (const replay of base || []) {
        if (replay?.id) byId.set(String(replay.id), replay);
    }
    for (const replay of incoming || []) {
        if (replay?.id) byId.set(String(replay.id), replay);
    }
    return Array.from(byId.values());
}

function getGeometryIdsWithReplays(fc: FeatureCollection): string[] {
    return uniqueStrings((fc.features || [])
        .filter((feature) => Array.isArray(feature.properties.replay_ids) && feature.properties.replay_ids.length > 0)
        .map((feature) => String(feature.properties.id || "")));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter((value) => value.length > 0)
    ));
}
