"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Entity } from "@/uhm/api/entities";
import { fetchWikisByEntityIdsWithPreviews } from "@/uhm/api/relations";
import {
    fetchWikiBySlug,
    getContentByVersionWikiId,
    type Wiki,
} from "@/uhm/api/wikis";
import type { MapHoverPopupContent } from "@/uhm/components/map/useMapHoverPopup";
import type { PreviewRelationIndex } from "@/uhm/lib/preview/types";
import { isTimelineYearWithinEntityTimeRange } from "@/uhm/lib/utils/entityTime";
import type { Feature, FeatureCollection } from "@/uhm/types/geo";
import type { BattleReplay } from "@/uhm/types/projects";

type CachedWiki = Wiki & { __fetched?: boolean };
type HoverWikiPreview = {
    rows: Array<{
        wiki: Wiki;
        quote: string;
    }>;
    isLoaded: boolean;
};

export type LinkEntityPopupState = {
    slug: string;
    entities: Entity[];
    top: number;
    left: number;
};

export function usePublicPreviewInteraction(options: {
    data: FeatureCollection;
    relations: PreviewRelationIndex;
    setRelations: React.Dispatch<React.SetStateAction<PreviewRelationIndex>>;
    selectedFeatureIds: (string | number)[];
    setSelectedFeatureIds: React.Dispatch<React.SetStateAction<(string | number)[]>>;
    timelineYear?: number | null;
    replayActiveWikiId?: string | null;
    replayMode?: "idle" | "playing" | "paused";
    onWikiLinkNavigate?: (wiki: Wiki) => void | Promise<void>;
    onSelect?: () => void;
}) {
    const { data, relations, setRelations, selectedFeatureIds, setSelectedFeatureIds, timelineYear, replayActiveWikiId, replayMode, onWikiLinkNavigate, onSelect } = options;
    const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
    const [activeWikiSlug, setActiveWikiSlug] = useState<string | null>(null);
    const [isManualSidebarOpen, setIsManualSidebarOpen] = useState(false);

    useEffect(() => {
        setIsManualSidebarOpen(false);
    }, [replayMode]);
    const [wikiCache, setWikiCache] = useState<Record<string, CachedWiki>>({});
    const [visibleWiki, setVisibleWiki] = useState<CachedWiki | null>(null);
    const [hoverWikiPreviewByEntityId, setHoverWikiPreviewByEntityId] = useState<Record<string, HoverWikiPreview>>({});
    const [isActiveWikiLoading, setIsActiveWikiLoading] = useState(false);
    const [activeWikiError, setActiveWikiError] = useState<string | null>(null);
    const [linkEntityPopup, setLinkEntityPopup] = useState<LinkEntityPopupState | null>(null);
    const linkEntityPopupRef = useRef<HTMLDivElement | null>(null);
    const hoverWikiPreviewRequestsRef = useRef<Set<string>>(new Set());
    const wikiLinkRequestSeqRef = useRef(0);
    const wikiLinkInFlightSlugRef = useRef<string | null>(null);
    const fullWikiFetchAttemptedSlugRef = useRef<Set<string>>(new Set());
    const suppressSelectedFeatureAutoSelectRef = useRef(false);

    useEffect(() => {
        if (replayMode !== "idle" && replayActiveWikiId) {
            const activeWikiEntityIds = relations.wikiEntityIdsById[String(replayActiveWikiId)] || [];
            const entityId = activeWikiEntityIds[0] || null;
            const wikiSlug = relations.wikiById[String(replayActiveWikiId)]?.slug || null;
            if (entityId) {
                setActiveEntityId(entityId);
            }
            if (wikiSlug) {
                setActiveWikiSlug(wikiSlug);
            }
        }
    }, [replayMode, replayActiveWikiId, relations.wikiEntityIdsById, relations.wikiById]);

    useEffect(() => {
        if (!selectedFeatureIds.length) return;
        const stillExistIds = selectedFeatureIds.filter((id) =>
            data.features.some((feature) => String(feature.properties.id) === String(id))
        );
        if (stillExistIds.length !== selectedFeatureIds.length) {
            setSelectedFeatureIds(stillExistIds);
        }
    }, [data.features, selectedFeatureIds, setSelectedFeatureIds]);

    const activeEntity = activeEntityId ? relations.entitiesById[activeEntityId] || null : null;
    const activeWiki = useMemo(() => {
        if (visibleWiki) return visibleWiki;
        if (!activeWikiSlug) return null;
        const cachedWiki = findWikiBySlug(wikiCache, activeWikiSlug) || null;
        const relationWiki = findWikiBySlug(relations.wikiBySlug, activeWikiSlug) || null;
        if (!cachedWiki) return relationWiki;
        if (hasWikiContent(cachedWiki) || cachedWiki.id === "__not_found__") return cachedWiki;
        if (relationWiki && hasWikiContent(relationWiki)) return relationWiki;
        return cachedWiki;
    }, [activeWikiSlug, relations.wikiBySlug, visibleWiki, wikiCache]);

    const selectEntity = useCallback(async (
        entityId: string,
        selectOptions?: {
            sourceFeatureId?: string | number | null;
            preferredWikiSlug?: string | null;
            selectGeometry?: boolean;
        }
    ) => {
        let entity = relations.entitiesById[entityId] || null;
        let linkedWikis = relations.entityWikisById[entityId] || [];

        if (!entity) {
            try {
                const { fetchEntityById } = await import("@/uhm/api/entities");
                entity = await fetchEntityById(entityId);
                const { fetchWikisByEntityIdsWithPreviews } = await import("@/uhm/api/relations");
                const wikisRes = await fetchWikisByEntityIdsWithPreviews([entityId]);
                linkedWikis = wikisRes[entityId] || [];

                setRelations((prev) => {
                    const wikiById = { ...prev.wikiById };
                    const wikiBySlug = { ...prev.wikiBySlug };
                    const wikiEntityIdsById = { ...prev.wikiEntityIdsById };
                    const wikiEntityIdsBySlug = { ...prev.wikiEntityIdsBySlug };

                    for (const w of linkedWikis) {
                        wikiById[w.id] = w;
                        if (w.slug) {
                            wikiBySlug[w.slug] = w;
                            if (!wikiEntityIdsBySlug[w.slug]) wikiEntityIdsBySlug[w.slug] = [];
                            if (!wikiEntityIdsBySlug[w.slug].includes(entityId)) {
                                wikiEntityIdsBySlug[w.slug].push(entityId);
                            }
                        }
                        if (!wikiEntityIdsById[w.id]) wikiEntityIdsById[w.id] = [];
                        if (!wikiEntityIdsById[w.id].includes(entityId)) {
                            wikiEntityIdsById[w.id].push(entityId);
                        }
                    }

                    return {
                        ...prev,
                        entitiesById: {
                            ...prev.entitiesById,
                            [entityId]: entity,
                        },
                        entityWikisById: {
                            ...prev.entityWikisById,
                            [entityId]: linkedWikis,
                        },
                        wikiById,
                        wikiBySlug,
                        wikiEntityIdsById,
                        wikiEntityIdsBySlug,
                    };
                });
            } catch (err) {
                console.error("Failed to lazy load entity/wikis:", err);
                return;
            }
        }

        const preferredWikiSlug = String(selectOptions?.preferredWikiSlug || "").trim();
        if (!linkedWikis.length || (preferredWikiSlug && !linkedWikis.some((wiki) => String(wiki.slug || "").trim() === preferredWikiSlug))) {
            try {
                const fetchedWikis = await fetchRelationWikisForEntity(entityId);
                if (fetchedWikis.length) {
                    linkedWikis = fetchedWikis;
                    setRelations((prev) => mergeEntityWikisIntoRelations(prev, entityId, fetchedWikis));
                    setWikiCache((prev) => ({
                        ...wikisBySlug(fetchedWikis),
                        ...prev,
                    }));
                }
            } catch (err) {
                console.error("Failed to load entity wikis before selecting:", err);
            }
        }

        const nextWikiSlug =
            (preferredWikiSlug && linkedWikis.some((wiki) => String(wiki.slug || "").trim() === preferredWikiSlug)
                ? preferredWikiSlug
                : "") ||
            firstWikiSlug(linkedWikis);

        const cachedFullWiki = nextWikiSlug ? findWikiWithContentBySlug(wikiCache, nextWikiSlug) || null : null;
        setActiveEntityId(entityId);
        setActiveWikiSlug(nextWikiSlug);
        setVisibleWiki(cachedFullWiki);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setIsManualSidebarOpen(true);
        if (selectOptions?.selectGeometry && selectOptions?.sourceFeatureId != null) {
            setSelectedFeatureIds([selectOptions.sourceFeatureId]);
        }
        onSelect?.();
    }, [relations.entitiesById, relations.entityWikisById, setRelations, setSelectedFeatureIds, wikiCache, onSelect]);

    const selectWiki = useCallback(async (
        wiki: Wiki
    ) => {
        const entityIds = relations.wikiEntityIdsById[wiki.id] || [];
        if (entityIds.length > 0) {
            await selectEntity(entityIds[0], {
                preferredWikiSlug: wiki.slug,
            });
            return;
        }

        if (wiki.slug) {
            const slug = wiki.slug;
            const cachedFullWiki = findWikiWithContentBySlug(wikiCache, slug) || null;
            setWikiCache((prev) => ({
                ...prev,
                [slug]: cachedFullWiki || {
                    ...wiki,
                    __fetched: false,
                },
            }));
            setActiveWikiSlug(slug);
            setVisibleWiki(cachedFullWiki);
        }
        setActiveEntityId(null);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setIsManualSidebarOpen(true);
        onSelect?.();
    }, [relations.wikiEntityIdsById, selectEntity, wikiCache, onSelect]);

    useEffect(() => {
        if (!selectedFeatureIds.length) {
            suppressSelectedFeatureAutoSelectRef.current = false;
            return;
        }
        if (suppressSelectedFeatureAutoSelectRef.current) return;

        const linkedEntityIds = relations.geometryEntityIds[String(selectedFeatureIds[0])] || [];
        if (linkedEntityIds.length !== 1) return;

        const onlyEntityId = linkedEntityIds[0];
        if (activeEntityId === onlyEntityId) return;
        const linkedWikis = relations.entityWikisById[onlyEntityId] || [];
        if (linkedWikis.length !== 1) return;

        selectEntity(onlyEntityId, {
            sourceFeatureId: selectedFeatureIds[0],
            preferredWikiSlug: linkedWikis[0]?.slug,
            selectGeometry: false,
        });
    }, [activeEntityId, relations.entityWikisById, relations.geometryEntityIds, selectEntity, selectedFeatureIds]);

    const loadHoverWikiPreviewForEntity = useCallback(async (entityId: string) => {
        try {
            const relationWikis = relations.entityWikisById[entityId] || [];
            const wikis = relationWikis.length ? relationWikis : await fetchRelationWikisForEntity(entityId);

            if (!relationWikis.length && wikis.length) {
                setRelations((prev) => mergeEntityWikisIntoRelations(prev, entityId, wikis));
                setWikiCache((prev) => ({
                    ...wikisBySlug(wikis),
                    ...prev,
                }));
            }

            const rows = wikis.map((wiki) => ({
                wiki,
                quote: cleanPreviewQuoteText(wiki.preview_quote),
            }));

            setHoverWikiPreviewByEntityId((prev) => ({
                ...prev,
                [entityId]: {
                    rows,
                    isLoaded: true,
                },
            }));
        } catch (err) {
            console.error("Load hover wiki preview failed", err);
            hoverWikiPreviewRequestsRef.current.delete(entityId);
            setHoverWikiPreviewByEntityId((prev) => ({
                ...prev,
                [entityId]: { rows: [], isLoaded: true },
            }));
        }
    }, [relations.entityWikisById, setRelations]);

    const getHoverPopupContent = useCallback((feature: Feature): MapHoverPopupContent | null => {
        const featureId = feature.properties.id;
        const entityIds = relations.geometryEntityIds[String(featureId)] || [];
        const entities = entityIds
            .map((entityId) => relations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));
        if (!entities.length) return null;

        type GroupedHoverRow = MapHoverPopupContent["rows"][number] & { isTimelineMatch: boolean };
        const groupedRows: GroupedHoverRow[] = entities.flatMap((entity): GroupedHoverRow[] => {
            const isTimelineMatch = isTimelineYearWithinEntityTimeRange(timelineYear, entity.time_start, entity.time_end);
            const preview = hoverWikiPreviewByEntityId[entity.id] ||
                buildPresetHoverPreview(relations.entityWikisById[entity.id] || []);
            if (!preview && !hoverWikiPreviewRequestsRef.current.has(entity.id)) {
                hoverWikiPreviewRequestsRef.current.add(entity.id);
                void loadHoverWikiPreviewForEntity(entity.id);
            }

            const baseClick = (preferredWikiSlug: string | null = null) => {
                selectEntity(entity.id, {
                    sourceFeatureId: featureId,
                    preferredWikiSlug,
                    selectGeometry: true,
                });
            };

            const entityHeaderRow = {
                title: entity.name,
                description: entity.description,
                isGroupHeader: true,
                isTimelineMatch,
            };

            if (preview?.rows.length) {
                return [
                    entityHeaderRow,
                    ...preview.rows.map((row) => ({
                        title: getWikiHoverTitle(row.wiki, entity.name),
                        isTimelineMatch,
                        quote: row.quote,
                        onClick: () => baseClick(String(row.wiki.slug || "").trim() || null),
                    })),
                ];
            }

            if (preview?.isLoaded) {
                return [entityHeaderRow, {
                    title: "(chưa có wiki)",
                    titleTone: "danger",
                    isTimelineMatch,
                    quoteTone: "danger",
                }];
            }

            return [entityHeaderRow, {
                title: "Đang tải wiki...",
                isTimelineMatch,
                quote: "Đang tải trích dẫn wiki...",
                onClick: () => baseClick(null),
            }];
        });

        const timelineMatchedRows = groupedRows.filter((row) => row.isTimelineMatch);
        const otherRows = groupedRows.filter((row) => !row.isTimelineMatch);
        const stripGroupFlag = ({ isTimelineMatch: _isTimelineMatch, ...row }: GroupedHoverRow) => row;

        return {
            key: entities
                .map((entity) => {
                    const preview = hoverWikiPreviewByEntityId[entity.id] ||
                        buildPresetHoverPreview(relations.entityWikisById[entity.id] || []);
                    return `${entity.id}:${preview?.isLoaded ? "loaded" : "loading"}:${preview?.rows.map((row) => row.quote).join("/") || ""}`;
                })
                .join("|") + `:${timelineYear ?? "none"}`,
            rows: [
                ...timelineMatchedRows.map(stripGroupFlag),
                ...otherRows.map((row, index) => ({
                    ...stripGroupFlag(row),
                    separatorBefore: index === 0 && timelineMatchedRows.length > 0,
                })),
            ],
        };
    }, [
        hoverWikiPreviewByEntityId,
        loadHoverWikiPreviewForEntity,
        relations.entitiesById,
        relations.entityWikisById,
        relations.geometryEntityIds,
        selectEntity,
        timelineYear,
    ]);

    useEffect(() => {
        if (!linkEntityPopup) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setLinkEntityPopup(null);
        };
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && linkEntityPopupRef.current?.contains(target)) return;
            setLinkEntityPopup(null);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [linkEntityPopup]);

    useEffect(() => {
        if (!activeEntityId || activeWikiSlug) return;

        const existingWikis = relations.entityWikisById[activeEntityId] || [];
        const existingSlug = firstWikiSlug(existingWikis);
        if (existingSlug) {
            setActiveWikiSlug(existingSlug);
            return;
        }

        let disposed = false;
        (async () => {
            setIsActiveWikiLoading(true);
            setActiveWikiError(null);
            try {
                const wikis = await fetchRelationWikisForEntity(activeEntityId);
                if (disposed) return;

                if (wikis.length) {
                    setRelations((prev) => mergeEntityWikisIntoRelations(prev, activeEntityId, wikis));
                    setWikiCache((prev) => ({
                        ...wikisBySlug(wikis),
                        ...prev,
                    }));
                    const nextSlug = firstWikiSlug(wikis);
                    if (nextSlug) {
                        setActiveWikiSlug(nextSlug);
                    } else {
                        setActiveWikiError("Không tìm thấy wiki cho entity đã chọn.");
                    }
                } else {
                    setActiveWikiError("Không tìm thấy wiki cho entity đã chọn.");
                }
            } catch (err) {
                if (!disposed) {
                    console.error("Load entity wikis failed", err);
                    setActiveWikiError(err instanceof Error ? err.message : "Không tải được wiki cho entity đã chọn.");
                }
            } finally {
                if (!disposed) setIsActiveWikiLoading(false);
            }
        })();

        return () => {
            disposed = true;
        };
    }, [activeEntityId, activeWikiSlug, relations.entityWikisById, setRelations]);

    const cachedWiki = activeWikiSlug ? findWikiBySlug(wikiCache, activeWikiSlug) : undefined;
    const fetchFullWikiBySlug = useCallback(async (slug: string): Promise<Wiki | null> => {
        const row = await fetchWikiBySlug(slug);
        if (!row) return null;

        let versionContent = row.content;
        try {
            if (row.content_sample?.[0]?.id) {
                const res = await getContentByVersionWikiId(row.content_sample[0].id);
                const content = extractWikiContentFromResponse(res);
                if (content) versionContent = content;
            }
        } catch (err) {
            console.error("Failed to fetch version content:", err);
        }

        return { ...row, content: versionContent };
    }, []);

    const focusWikiLinkAfterPaint = useCallback((wiki: Wiki) => {
        if (!onWikiLinkNavigate) return;

        const run = () => {
            void Promise.resolve(onWikiLinkNavigate(wiki)).catch((err) => {
                console.error("Failed to focus map for wiki link:", err);
            });
        };

        if (typeof window === "undefined") {
            run();
            return;
        }

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(run);
        });
    }, [onWikiLinkNavigate]);

    const publishWikiToPanel = useCallback((wiki: Wiki, requestedSlug?: string | null): CachedWiki => {
        const canonicalSlug = String(wiki.slug || "").trim() || String(requestedSlug || "").trim();
        const fullWiki: CachedWiki = {
            ...wiki,
            slug: canonicalSlug,
            __fetched: true,
        };
        if (requestedSlug) fullWikiFetchAttemptedSlugRef.current.add(requestedSlug);
        if (canonicalSlug) fullWikiFetchAttemptedSlugRef.current.add(canonicalSlug);

        setWikiCache((prev) => cacheWikiBySlug(prev, fullWiki, requestedSlug));
        setActiveWikiSlug(canonicalSlug);
        setVisibleWiki(fullWiki);
        setActiveWikiError(hasWikiContent(fullWiki) ? null : "Wiki này chưa có nội dung.");
        setIsActiveWikiLoading(false);
        return fullWiki;
    }, []);

    const prepareManualWikiNavigation = useCallback(() => {
        suppressSelectedFeatureAutoSelectRef.current = true;
        setSelectedFeatureIds([]);
        setActiveEntityId(null);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setIsManualSidebarOpen(true);
    }, [setSelectedFeatureIds]);

    useEffect(() => {
        if (!activeWikiSlug) {
            setIsActiveWikiLoading(false);
            setActiveWikiError(null);
            setVisibleWiki(null);
            return;
        }

        if (wikiLinkInFlightSlugRef.current === activeWikiSlug) {
            return;
        }

        if (cachedWiki?.id === "__not_found__") {
            setIsActiveWikiLoading(false);
            setActiveWikiError("Không tìm thấy wiki cho entity đã chọn.");
            return;
        }

        if (cachedWiki && cachedWiki.__fetched && hasWikiContent(cachedWiki)) {
            setVisibleWiki(cachedWiki);
            setIsActiveWikiLoading(false);
            setActiveWikiError(null);
            return;
        }

        if (cachedWiki?.__fetched && fullWikiFetchAttemptedSlugRef.current.has(activeWikiSlug)) {
            setIsActiveWikiLoading(false);
            setActiveWikiError(hasWikiContent(cachedWiki) ? null : "Wiki này chưa có nội dung.");
            return;
        }

        let disposed = false;
        (async () => {
            setIsActiveWikiLoading(true);
            setActiveWikiError(null);
            try {
                const row = await fetchFullWikiBySlug(activeWikiSlug);
                if (disposed) return;

                if (row) {
                    publishWikiToPanel(row, activeWikiSlug);
                } else {
                    fullWikiFetchAttemptedSlugRef.current.add(activeWikiSlug);
                    setWikiCache((prev) => ({
                        ...prev,
                        [activeWikiSlug]: { id: "__not_found__", project_id: "" },
                    }));
                    setActiveWikiError("Không tìm thấy wiki cho entity đã chọn.");
                }
            } catch (err) {
                if (disposed) return;
                setActiveWikiError(err instanceof Error ? err.message : "Không tải được wiki.");
            } finally {
                if (!disposed) setIsActiveWikiLoading(false);
            }
        })();

        return () => {
            disposed = true;
        };
    }, [activeWikiSlug, cachedWiki, fetchFullWikiBySlug, publishWikiToPanel]);

    const handleWikiLinkRequest = useCallback(async ({ slug, rect }: { slug: string; rect: DOMRect }) => {
        const nextSlug = String(slug || "").trim();
        if (!nextSlug) return;

        const requestSeq = ++wikiLinkRequestSeqRef.current;
        wikiLinkInFlightSlugRef.current = nextSlug;
        prepareManualWikiNavigation();

        const cachedWikiForSlug =
            findWikiWithContentBySlug(wikiCache, nextSlug) ||
            findWikiWithContentBySlug(relations.wikiBySlug, nextSlug) ||
            null;

        if (cachedWikiForSlug && cachedWikiForSlug.id !== "__not_found__" && hasWikiContent(cachedWikiForSlug)) {
            wikiLinkInFlightSlugRef.current = null;
            const fullWiki = publishWikiToPanel(cachedWikiForSlug, nextSlug);
            focusWikiLinkAfterPaint(fullWiki);
            return;
        }

        setIsActiveWikiLoading(true);

        let row: Wiki | null = null;
        try {
            row = await fetchFullWikiBySlug(nextSlug);
        } catch (err) {
            console.error("Load wiki by slug failed", err);
            if (requestSeq !== wikiLinkRequestSeqRef.current) return;
            if (wikiLinkInFlightSlugRef.current === nextSlug) wikiLinkInFlightSlugRef.current = null;
            setActiveWikiError(err instanceof Error ? err.message : "Không tải được wiki.");
            setIsActiveWikiLoading(false);
            return;
        }

        if (requestSeq !== wikiLinkRequestSeqRef.current) return;
        if (wikiLinkInFlightSlugRef.current === nextSlug) wikiLinkInFlightSlugRef.current = null;

        if (!row) {
            setActiveWikiError("Không tìm thấy wiki.");
            setIsActiveWikiLoading(false);
            return;
        }

        const fullWiki = publishWikiToPanel(row, nextSlug);
        focusWikiLinkAfterPaint(fullWiki);
    }, [
        fetchFullWikiBySlug,
        focusWikiLinkAfterPaint,
        prepareManualWikiNavigation,
        publishWikiToPanel,
        relations.wikiBySlug,
        wikiCache,
    ]);

    const closeWikiSidebar = useCallback(() => {
        setActiveEntityId(null);
        setActiveWikiSlug(null);
        setVisibleWiki(null);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setSelectedFeatureIds([]);
        setIsManualSidebarOpen(false);
    }, [setSelectedFeatureIds]);

    const closeWikiSidebarPreserveSelection = useCallback(() => {
        setActiveEntityId(null);
        setActiveWikiSlug(null);
        setVisibleWiki(null);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setIsManualSidebarOpen(false);
    }, []);

    return {
        activeEntity,
        activeWiki,
        isActiveWikiLoading,
        activeWikiError,
        linkEntityPopup,
        linkEntityPopupRef,
        getHoverPopupContent,
        selectEntity,
        selectWiki,
        handleWikiLinkRequest,
        closeWikiSidebar,
        closeWikiSidebarPreserveSelection,
        setLinkEntityPopup,
        isManualSidebarOpen,
        setIsManualSidebarOpen,
    };
}

async function fetchRelationWikisForEntity(entityId: string): Promise<Wiki[]> {
    const rows = await fetchWikisByEntityIdsWithPreviews([entityId]);
    return rows[entityId] || [];
}

function extractWikiContentFromResponse(response: unknown): string {
    if (typeof response === "string") return response;
    if (!response || typeof response !== "object") return "";
    const source = response as Record<string, unknown>;
    if (typeof source.content === "string") return source.content;
    const data = source.data;
    if (data && typeof data === "object" && typeof (data as Record<string, unknown>).content === "string") {
        return (data as Record<string, unknown>).content as string;
    }
    return "";
}

function hasWikiContent(wiki: Wiki | null | undefined): boolean {
    return typeof wiki?.content === "string" && wiki.content.trim().length > 0;
}

function cacheWikiBySlug(
    prev: Record<string, CachedWiki>,
    wiki: CachedWiki,
    requestedSlug?: string | null
): Record<string, CachedWiki> {
    const next = { ...prev };
    for (const key of wikiSlugCacheKeys(requestedSlug, wiki.slug)) {
        next[key] = wiki;
    }
    return next;
}

function findWikiWithContentBySlug<T extends Wiki>(
    source: Record<string, T>,
    slug: string | null | undefined
): T | undefined {
    const direct = findWikiBySlug(source, slug);
    if (direct && hasWikiContent(direct)) return direct;

    const targetKey = normalizeWikiSlugForCompare(slug);
    if (!targetKey) return undefined;
    for (const [key, wiki] of Object.entries(source)) {
        if (!hasWikiContent(wiki)) continue;
        const keyMatches = normalizeWikiSlugForCompare(key) === targetKey;
        const slugMatches = normalizeWikiSlugForCompare(wiki.slug) === targetKey;
        if (keyMatches || slugMatches) return wiki;
    }
    return undefined;
}

function findWikiBySlug<T extends Wiki>(
    source: Record<string, T>,
    slug: string | null | undefined
): T | undefined {
    const keys = wikiSlugCacheKeys(slug);
    for (const key of keys) {
        const direct = source[key];
        if (direct) return direct;
    }

    const targetKey = normalizeWikiSlugForCompare(slug);
    if (!targetKey) return undefined;
    for (const [key, wiki] of Object.entries(source)) {
        const keyMatches = normalizeWikiSlugForCompare(key) === targetKey;
        const slugMatches = normalizeWikiSlugForCompare(wiki.slug) === targetKey;
        if (keyMatches || slugMatches) return wiki;
    }
    return undefined;
}

function wikiSlugCacheKeys(...values: Array<string | null | undefined>): string[] {
    const keys = new Set<string>();
    for (const value of values) {
        const raw = String(value || "").trim();
        if (!raw) continue;
        keys.add(raw);

        let decoded = raw;
        try {
            decoded = decodeURIComponent(raw);
        } catch {
            decoded = raw;
        }
        decoded = decoded.replace(/^\/+/, "").replace(/^wiki\//i, "").trim();
        if (!decoded) continue;

        keys.add(decoded);
        keys.add(decoded.replace(/_/g, " "));
        keys.add(decoded.replace(/\s+/g, "_"));
        keys.add(normalizeWikiSlugForCompare(decoded));
    }
    return Array.from(keys).filter((key) => key.length > 0);
}

function normalizeWikiSlugForCompare(value: string | null | undefined): string {
    let raw = String(value || "").trim();
    if (!raw) return "";
    try {
        raw = decodeURIComponent(raw);
    } catch {
        // Keep the original value if it is not valid percent-encoded text.
    }
    return raw
        .replace(/^\/+/, "")
        .replace(/^wiki\//i, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("vi-VN");
}

function cleanPreviewQuoteText(content: string | null | undefined): string {
    if (!content) return "";

    const blockquoteMatch = content.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    let rawText = blockquoteMatch ? (blockquoteMatch[1]?.trim() || "") : content.trim();

    rawText = rawText.replace(/<\/?blockquote[^>]*>/gi, "");

    return rawText
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function buildPresetHoverPreview(wikis: Wiki[]): HoverWikiPreview | undefined {
    const rows = (wikis || [])
        .map((wiki) => ({
            wiki,
            quote: cleanPreviewQuoteText(wiki.preview_quote),
        }));
    return rows.length ? { rows, isLoaded: true } : undefined;
}

function extractWikiBlockquoteText(content: string | null | undefined): string {
    if (!content) return "";

    const blockquoteMatch = content.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    const rawText = blockquoteMatch?.[1]?.trim() || "";
    if (!rawText) return "";

    return rawText
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function mergeEntityWikisIntoRelations(
    prev: PreviewRelationIndex,
    entityId: string,
    wikis: Wiki[]
): PreviewRelationIndex {
    const wikiById = { ...prev.wikiById };
    const wikiBySlug = { ...prev.wikiBySlug };
    const entityWikis = [...(prev.entityWikisById[entityId] || [])];
    const wikiEntityIdsById = cloneStringArrayRecord(prev.wikiEntityIdsById);
    const wikiEntityIdsBySlug = cloneStringArrayRecord(prev.wikiEntityIdsBySlug);

    for (const wiki of wikis) {
        if (!wiki?.id) continue;

        wikiById[wiki.id] = wiki;
        if (!entityWikis.some((item) => item.id === wiki.id)) entityWikis.push(wiki);
        appendUnique(wikiEntityIdsById, wiki.id, entityId);

        const slug = String(wiki.slug || "").trim();
        if (slug) {
            wikiBySlug[slug] = wiki;
            appendUnique(wikiEntityIdsBySlug, slug, entityId);
        }
    }

    return {
        ...prev,
        entityWikisById: {
            ...prev.entityWikisById,
            [entityId]: entityWikis,
        },
        wikiEntityIdsById,
        wikiEntityIdsBySlug,
        wikiById,
        wikiBySlug,
    };
}

function wikisBySlug(wikis: Wiki[]): Record<string, Wiki> {
    const result: Record<string, Wiki> = {};
    for (const wiki of wikis) {
        const slug = String(wiki?.slug || "").trim();
        if (slug) result[slug] = wiki;
    }
    return result;
}

function firstWikiSlug(wikis: Wiki[]): string | null {
    return wikis.map((wiki) => String(wiki.slug || "").trim()).find((slug) => slug.length > 0) || null;
}

function getWikiHoverTitle(wiki: Wiki | null | undefined, fallbackTitle: string): string {
    return String(wiki?.title || "").trim() || fallbackTitle;
}

function cloneStringArrayRecord(source: Record<string, string[]>): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(source)) {
        result[key] = [...value];
    }
    return result;
}

function appendUnique(target: Record<string, string[]>, key: string, value: string) {
    if (!target[key]) {
        target[key] = [value];
        return;
    }
    if (!target[key].includes(value)) target[key].push(value);
}

function computeFixedPopupPosition(rect: DOMRect, width: number, height: number) {
    const margin = 12;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
    const preferredLeft = rect.right + margin;
    const maxLeft = Math.max(margin, viewportWidth - width - margin);
    const left = Math.min(preferredLeft, maxLeft);

    const preferredTop = rect.top;
    const maxTop = Math.max(margin, viewportHeight - height - margin);
    const top = Math.max(margin, Math.min(preferredTop, maxTop));

    return { top, left };
}
