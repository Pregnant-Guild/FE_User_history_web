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
    replayActiveWikiId?: string | null;
    replayMode?: "idle" | "playing";
}) {
    const { data, relations, setRelations, selectedFeatureIds, setSelectedFeatureIds, replayActiveWikiId, replayMode } = options;
    const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
    const [activeWikiSlug, setActiveWikiSlug] = useState<string | null>(null);
    const [isManualSidebarOpen, setIsManualSidebarOpen] = useState(false);

    useEffect(() => {
        setIsManualSidebarOpen(false);
    }, [replayMode]);
    const [wikiCache, setWikiCache] = useState<Record<string, CachedWiki>>({});
    const [hoverWikiPreviewByEntityId, setHoverWikiPreviewByEntityId] = useState<Record<string, HoverWikiPreview>>({});
    const [isActiveWikiLoading, setIsActiveWikiLoading] = useState(false);
    const [activeWikiError, setActiveWikiError] = useState<string | null>(null);
    const [linkEntityPopup, setLinkEntityPopup] = useState<LinkEntityPopupState | null>(null);
    const linkEntityPopupRef = useRef<HTMLDivElement | null>(null);
    const loadedWikiEntityIdsRef = useRef<Set<string>>(new Set());
    const hoverWikiPreviewRequestsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (replayMode === "playing" && replayActiveWikiId) {
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
        if (!activeWikiSlug) return null;
        return wikiCache[activeWikiSlug] || relations.wikiBySlug[activeWikiSlug] || null;
    }, [activeWikiSlug, relations.wikiBySlug, wikiCache]);

    const selectEntity = useCallback((
        entityId: string,
        selectOptions?: {
            sourceFeatureId?: string | number | null;
            preferredWikiSlug?: string | null;
            selectGeometry?: boolean;
        }
    ) => {
        const entity = relations.entitiesById[entityId] || null;
        if (!entity) return;

        const linkedWikis = relations.entityWikisById[entityId] || [];
        const preferredWikiSlug = String(selectOptions?.preferredWikiSlug || "").trim();
        const nextWikiSlug =
            (preferredWikiSlug && linkedWikis.some((wiki) => String(wiki.slug || "").trim() === preferredWikiSlug)
                ? preferredWikiSlug
                : "") ||
            firstWikiSlug(linkedWikis);

        setActiveEntityId(entityId);
        setActiveWikiSlug(nextWikiSlug);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setIsManualSidebarOpen(true);
        if (selectOptions?.selectGeometry && selectOptions?.sourceFeatureId != null) {
            setSelectedFeatureIds([selectOptions.sourceFeatureId]);
        }
    }, [relations.entitiesById, relations.entityWikisById, setSelectedFeatureIds]);

    useEffect(() => {
        if (!selectedFeatureIds.length) return;
        const linkedEntityIds = relations.geometryEntityIds[String(selectedFeatureIds[0])] || [];
        if (linkedEntityIds.length !== 1) return;

        const onlyEntityId = linkedEntityIds[0];
        if (activeEntityId === onlyEntityId) return;

        selectEntity(onlyEntityId, {
            sourceFeatureId: selectedFeatureIds[0],
            selectGeometry: false,
        });
    }, [activeEntityId, relations.geometryEntityIds, selectEntity, selectedFeatureIds]);

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

            const rows = await Promise.all(
                wikis.map(async (wiki) => {
                    const presetQuote = String(wiki.preview_quote || "").trim();
                    const fullWiki = presetQuote ? wiki : await fetchFullWikiContent(wiki);
                    const quote = presetQuote
                        ? cleanPreviewQuoteText(presetQuote)
                        : extractWikiBlockquoteText(fullWiki.content);
                    if (fullWiki.slug) {
                        setWikiCache((prev) => ({
                            ...prev,
                            [String(fullWiki.slug)]: {
                                ...fullWiki,
                                __fetched: true,
                            },
                        }));
                    }
                    return { wiki: fullWiki, quote };
                })
            );

            setHoverWikiPreviewByEntityId((prev) => ({
                ...prev,
                [entityId]: {
                    rows: rows.filter((row) => row.quote.trim().length > 0),
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

        return {
            key: entities
                .map((entity) => {
                    const preview = hoverWikiPreviewByEntityId[entity.id] ||
                        buildPresetHoverPreview(relations.entityWikisById[entity.id] || []);
                    return `${entity.id}:${preview?.isLoaded ? "loaded" : "loading"}:${preview?.rows.map((row) => row.quote).join("/") || ""}`;
                })
                .join("|"),
            rows: entities.flatMap((entity) => {
                const preview = hoverWikiPreviewByEntityId[entity.id] ||
                    buildPresetHoverPreview(relations.entityWikisById[entity.id] || []);
                if (!preview && !hoverWikiPreviewRequestsRef.current.has(entity.id)) {
                    hoverWikiPreviewRequestsRef.current.add(entity.id);
                    void loadHoverWikiPreviewForEntity(entity.id);
                }

                const baseClick = () => {
                    const preferredWikiSlug = preview?.rows
                        .map((row) => String(row.wiki.slug || "").trim())
                        .find((slug) => slug.length > 0) || null;
                    selectEntity(entity.id, {
                        sourceFeatureId: featureId,
                        preferredWikiSlug,
                        selectGeometry: true,
                    });
                };

                if (preview?.rows.length) {
                    return preview.rows.map((row) => ({
                        title: entity.name,
                        quote: row.quote,
                        onClick: baseClick,
                    }));
                }

                return [{
                    title: entity.name,
                    quote: preview?.isLoaded ? "" : "Đang tải trích dẫn wiki...",
                    onClick: baseClick,
                }];
            }),
        };
    }, [
        hoverWikiPreviewByEntityId,
        loadHoverWikiPreviewForEntity,
        relations.entitiesById,
        relations.entityWikisById,
        relations.geometryEntityIds,
        selectEntity,
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

        if (loadedWikiEntityIdsRef.current.has(activeEntityId)) return;
        loadedWikiEntityIdsRef.current.add(activeEntityId);

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
                loadedWikiEntityIdsRef.current.delete(activeEntityId);
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

    const cachedWiki = activeWikiSlug ? wikiCache[activeWikiSlug] : undefined;
    useEffect(() => {
        if (!activeWikiSlug) {
            setIsActiveWikiLoading(false);
            setActiveWikiError(null);
            return;
        }

        if (cachedWiki && (cachedWiki.__fetched || cachedWiki.id === "__not_found__")) {
            setIsActiveWikiLoading(false);
            setActiveWikiError(cachedWiki.id === "__not_found__" ? "Không tìm thấy wiki cho entity đã chọn." : null);
            return;
        }

        let disposed = false;
        (async () => {
            setIsActiveWikiLoading(true);
            setActiveWikiError(null);
            try {
                const row = await fetchWikiBySlug(activeWikiSlug);
                if (disposed) return;

                if (row) {
                    let versionContent = row.content;
                    try {
                        if (row.content_sample?.[0]?.id) {
                            const res = await getContentByVersionWikiId(row.content_sample[0].id);
                            if (res?.data?.content) versionContent = res.data.content;
                        }
                    } catch (err) {
                        console.error("Failed to fetch version content:", err);
                    }

                    if (disposed) return;
                    setWikiCache((prev) => ({
                        ...prev,
                        [activeWikiSlug]: { ...row, content: versionContent, __fetched: true },
                    }));
                } else {
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
    }, [activeWikiSlug, cachedWiki]);

    const handleWikiLinkRequest = useCallback(async ({ slug, rect }: { slug: string; rect: DOMRect }) => {
        const linkedEntityIds = relations.wikiEntityIdsBySlug[slug] || [];
        const linkedEntities = linkedEntityIds
            .map((entityId) => relations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));

        if (linkedEntities.length === 1) {
            selectEntity(linkedEntities[0].id, { preferredWikiSlug: slug });
            return;
        }

        if (!wikiCache[slug] && !relations.wikiBySlug[slug]) {
            try {
                const row = await fetchWikiBySlug(slug);
                if (row) setWikiCache((prev) => ({ ...prev, [slug]: row }));
            } catch (err) {
                console.error("Load wiki by slug failed", err);
            }
        }

        if (!linkedEntities.length) return;

        const popupWidth = 240;
        const popupHeight = Math.min(240, linkedEntities.length * 44 + 20);
        const { top, left } = computeFixedPopupPosition(rect, popupWidth, popupHeight);

        setLinkEntityPopup({
            slug,
            entities: linkedEntities,
            top,
            left,
        });
    }, [relations.entitiesById, relations.wikiBySlug, relations.wikiEntityIdsBySlug, selectEntity, wikiCache]);

    const closeWikiSidebar = useCallback(() => {
        setActiveEntityId(null);
        setActiveWikiSlug(null);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        setSelectedFeatureIds([]);
        setIsManualSidebarOpen(false);
    }, [setSelectedFeatureIds]);

    return {
        activeEntity,
        activeWiki,
        isActiveWikiLoading,
        activeWikiError,
        linkEntityPopup,
        linkEntityPopupRef,
        getHoverPopupContent,
        selectEntity,
        handleWikiLinkRequest,
        closeWikiSidebar,
        setLinkEntityPopup,
        isManualSidebarOpen,
        setIsManualSidebarOpen,
    };
}

async function fetchRelationWikisForEntity(entityId: string): Promise<Wiki[]> {
    const rows = await fetchWikisByEntityIdsWithPreviews([entityId]);
    return rows[entityId] || [];
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
        }))
        .filter((row) => row.quote.length > 0);
    return rows.length ? { rows, isLoaded: true } : undefined;
}

async function fetchFullWikiContent(wiki: Wiki): Promise<Wiki> {
    const slug = String(wiki.slug || "").trim();
    let row = wiki;
    if (slug) {
        row = await fetchWikiBySlug(slug) || wiki;
    }

    let versionContent = row.content;
    try {
        if (row.content_sample?.[0]?.id) {
            const res = await getContentByVersionWikiId(row.content_sample[0].id);
            if (res?.data?.content) versionContent = res.data.content;
        }
    } catch (err) {
        console.error("Failed to fetch hover wiki version content:", err);
    }

    return { ...row, content: versionContent };
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
