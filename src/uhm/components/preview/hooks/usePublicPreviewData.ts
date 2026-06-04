"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchGeometriesByBBox } from "@/uhm/api/geometries";
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
import type { FeatureCollection } from "@/uhm/types/geo";
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

    useEffect(() => {
        if (!enabled) {
            setData(EMPTY_FEATURE_COLLECTION);
            setRelations(EMPTY_PREVIEW_RELATIONS);
            setReplays([]);
            setIsTimelineLoading(false);
            setIsRelationsLoading(false);
            setTimelineStatus(null);
            setRelationsStatus(null);
            return;
        }

        let disposed = false;
        const requestId = ++timelineFetchRequestRef.current;

        async function loadByTimeline() {
            setIsTimelineLoading(true);
            setIsRelationsLoading(false);
            setTimelineStatus(null);
            setRelationsStatus(null);
            let next: FeatureCollection;

            try {
                next = await fetchGeometriesByBBox({ ...WORLD_BBOX, time: timelineYear, timeRange });
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

            try {
                const [entities, replaysRes] = await Promise.all([
                    fetchEntitiesByGeometryIds(geometryIds),
                    fetchBattleReplaysByGeometryIds(geometryIds).catch((err) => {
                        console.error("Failed to load replays:", err);
                        return {};
                    }),
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
            const entityOnlyRelations = buildPublicPreviewRelationIndex(
                buildRelationInputFromGeometryRelations(next, entitiesByGeometryId, {})
            );
            
            // Apply BOTH geometries and relations at the exact same React render cycle!
            setData(next);
            setRelations(entityOnlyRelations);
            setReplays(fetchedReplays);
            
            // Mark loading as complete immediately so map transitions and becomes interactive
            setIsRelationsLoading(false);
            setRelationsStatus(null);

            if (!entityIds.length) {
                return;
            }

            // Fetch wiki previews in the background to populate hover cards without blocking map init
            try {
                const wikisByEntityId = await fetchWikisByEntityIdsWithPreviews(entityIds);
                if (disposed || requestId !== timelineFetchRequestRef.current) return;

                setRelations(buildPublicPreviewRelationIndex(
                    buildRelationInputFromGeometryRelations(next, entitiesByGeometryId, wikisByEntityId)
                ));
            } catch (err) {
                if (err instanceof ApiError) {
                    console.error("Load background entity-wiki previews failed", err.body);
                } else {
                    console.error("Load background entity-wiki previews failed", err);
                }
            }
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

    for (const feature of draft.features) {
        const geometryId = String(feature.properties.id);
        for (const entity of entitiesByGeometryId[geometryId] || []) {
            const id = String(entity?.id || "").trim();
            if (!id) continue;
            entitiesById[id] = entity;
            pushFeature(entityGeometriesById, id, feature);
        }
    }

    return {
        entities: Object.values(entitiesById),
        entityGeometriesById,
        entityWikisById: wikisByEntityId,
    };
}

function pushFeature(target: Record<string, FeatureCollection>, entityId: string, feature: FeatureCollection["features"][number]) {
    if (!target[entityId]) target[entityId] = { type: "FeatureCollection", features: [] };
    if (!target[entityId].features.some((item) => String(item.properties.id) === String(feature.properties.id))) {
        target[entityId].features.push(feature);
    }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter((value) => value.length > 0)
    ));
}
