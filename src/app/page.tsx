"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Map, { type MapHoverPayload } from "@/uhm/components/Map";
import PublicWikiSidebar from "@/uhm/components/wiki/PublicWikiSidebar";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import mapLayersStyles from "@/styles/MapLayers.module.css";
import { fetchEntities, type Entity } from "@/uhm/api/entities";
import { fetchGeometriesByBBox } from "@/uhm/api/geometries";
import { ApiError } from "@/uhm/api/http";
import { fetchWikiBySlug, getContentByVersionWikiId, searchWikisByTitle, type Wiki } from "@/uhm/api/wikis";
import {
    BACKGROUND_LAYER_OPTIONS,
    type BackgroundLayerId,
    type BackgroundLayerVisibility,
    DEFAULT_BACKGROUND_LAYER_VISIBILITY,
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/map/styles/backgroundLayers";
import {
    loadBackgroundLayerVisibilityFromStorage,
    persistBackgroundLayerVisibility,
} from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { EMPTY_FEATURE_COLLECTION, WORLD_BBOX } from "@/uhm/lib/map/geo/constants";
import { GEO_TYPE_KEYS } from "@/uhm/lib/map/geo/geoTypeMap";
import { clampYearToFixedRange, TIMELINE_DEBOUNCE_MS } from "@/uhm/lib/utils/timeline";
import type { FeatureCollection } from "@/uhm/types/geo";

const CURRENT_YEAR = new Date().getUTCFullYear();
const ENTITY_PAGE_LIMIT = 100;
const WIKI_PAGE_LIMIT = 100;
const RELATION_CONCURRENCY = 6;

type RelationIndex = {
    entitiesById: Record<string, Entity>;
    entityGeometriesById: Record<string, FeatureCollection>;
    entityWikisById: Record<string, Wiki[]>;
    geometryEntityIds: Record<string, string[]>;
    wikiEntityIdsBySlug: Record<string, string[]>;
    wikiBySlug: Record<string, Wiki>;
};

type LinkEntityPopupState = {
    slug: string;
    entities: Entity[];
    top: number;
    left: number;
};

type CachedWiki = Wiki & { __fetched?: boolean };

const EMPTY_RELATIONS: RelationIndex = {
    entitiesById: {},
    entityGeometriesById: {},
    entityWikisById: {},
    geometryEntityIds: {},
    wikiEntityIdsBySlug: {},
    wikiBySlug: {},
};

export default function Page() {
    const [data, setData] = useState<FeatureCollection>(EMPTY_FEATURE_COLLECTION);
    const [selectedFeatureIds, setSelectedFeatureIds] = useState<(string | number)[]>([]);
    const [timelineYear, setTimelineYear] = useState<number>(() => clampYearToFixedRange(CURRENT_YEAR));
    const [timelineDraftYear, setTimelineDraftYear] = useState<number>(() => clampYearToFixedRange(CURRENT_YEAR));
    const [timeRange, setTimeRange] = useState<number>(0);
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
    const [backgroundVisibility, setBackgroundVisibility] = useState<BackgroundLayerVisibility>(
        () => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY })
    );
    const [isBackgroundVisibilityReady, setIsBackgroundVisibilityReady] = useState(false);
    const [geometryVisibility, setGeometryVisibility] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const key of GEO_TYPE_KEYS) init[key] = true;
        return init;
    });
    const [relations, setRelations] = useState<RelationIndex>(EMPTY_RELATIONS);
    const [isRelationsLoading, setIsRelationsLoading] = useState(false);
    const [relationsStatus, setRelationsStatus] = useState<string | null>(null);
    const [relationsProgress, setRelationsProgress] = useState<{ completed: number; total: number }>({
        completed: 0,
        total: 0,
    });
    const [hoverAnchor, setHoverAnchor] = useState<MapHoverPayload | null>(null);
    const [isMapLayersCollapsed, setIsMapLayersCollapsed] = useState(false);
    const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
    const [activeWikiSlug, setActiveWikiSlug] = useState<string | null>(null);
    const [wikiCache, setWikiCache] = useState<Record<string, CachedWiki>>({});
    const [isActiveWikiLoading, setIsActiveWikiLoading] = useState(false);
    const [activeWikiError, setActiveWikiError] = useState<string | null>(null);
    const [linkEntityPopup, setLinkEntityPopup] = useState<LinkEntityPopupState | null>(null);
    const [entityFocusToken, setEntityFocusToken] = useState(0);

    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("public-wiki-sidebar-width");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed >= 320 && parsed <= 800) {
                    return parsed;
                }
            }
        }
        return 420;
    });
    const [isLargeScreen, setIsLargeScreen] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            setIsLargeScreen(window.innerWidth >= 1024);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const maxDragWidth = typeof window !== "undefined"
        ? Math.min(800, window.innerWidth - 340)
        : 800;

    const timelineFetchRequestRef = useRef(0);
    const hoverHideTimerRef = useRef<number | null>(null);
    const hoverPopupHoveredRef = useRef(false);
    const linkEntityPopupRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!selectedFeatureIds || selectedFeatureIds.length === 0) return;
        const stillExistIds = selectedFeatureIds.filter(id =>
            data.features.some(feature => String(feature.properties.id) === String(id))
        );
        if (stillExistIds.length !== selectedFeatureIds.length) {
            setSelectedFeatureIds(stillExistIds);
        }
    }, [data.features, selectedFeatureIds]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (timelineDraftYear !== timelineYear) setTimelineYear(timelineDraftYear);
        }, TIMELINE_DEBOUNCE_MS);
        return () => window.clearTimeout(timeoutId);
    }, [timelineDraftYear, timelineYear]);

    useEffect(() => {
        setBackgroundVisibility(loadBackgroundLayerVisibilityFromStorage());
        setIsBackgroundVisibilityReady(true);
    }, []);

    useEffect(() => {
        let disposed = false;
        const requestId = ++timelineFetchRequestRef.current;

        async function loadByTimeline() {
            setIsTimelineLoading(true);
            setTimelineStatus(null);
            try {
                const next = await fetchGeometriesByBBox({ ...WORLD_BBOX, time: timelineYear, timeRange });
                if (disposed || requestId !== timelineFetchRequestRef.current) return;
                setData(next);
            } catch (err) {
                if (err instanceof ApiError) {
                    console.error("Load timeline data failed", err.body);
                } else {
                    console.error("Load timeline data failed", err);
                }
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setTimelineStatus("Không tải được geometry tại mốc thời gian đã chọn.");
                }
            } finally {
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setIsTimelineLoading(false);
                }
            }
        }

        loadByTimeline();
        return () => {
            disposed = true;
        };
    }, [timelineYear, timeRange]);

    useEffect(() => {
        let disposed = false;

        async function loadRelations() {
            setIsRelationsLoading(true);
            setRelationsStatus(null);
            setRelationsProgress({ completed: 0, total: 0 });

            try {
                const entities = await fetchAllEntities();
                if (disposed) return;

                const next: RelationIndex = {
                    entitiesById: {},
                    entityGeometriesById: {},
                    entityWikisById: {},
                    geometryEntityIds: {},
                    wikiEntityIdsBySlug: {},
                    wikiBySlug: {},
                };

                for (const entity of entities) {
                    next.entitiesById[entity.id] = entity;
                }

                setRelationsProgress({ completed: 0, total: entities.length });

                await mapWithConcurrency(entities, RELATION_CONCURRENCY, async (entity, index) => {
                    const [geometries, wikis] = await Promise.all([
                        fetchGeometriesByBBox({ ...WORLD_BBOX, entity_id: entity.id }),
                        fetchAllWikisForEntity(entity.id),
                    ]);
                    if (disposed) return;

                    next.entityGeometriesById[entity.id] = geometries;
                    next.entityWikisById[entity.id] = wikis;

                    for (const feature of geometries.features) {
                        pushUniqueString(next.geometryEntityIds, String(feature.properties.id), entity.id);
                    }

                    for (const wiki of wikis) {
                        const slug = String(wiki.slug || "").trim();
                        if (!slug.length) continue;
                        next.wikiBySlug[slug] = wiki;
                        pushUniqueString(next.wikiEntityIdsBySlug, slug, entity.id);
                    }

                    const completed = index + 1;
                    if (completed === entities.length || completed % 5 === 0) {
                        setRelationsProgress({ completed, total: entities.length });
                    }
                });

                if (disposed) return;

                normalizeRelationArrays(next.geometryEntityIds);
                normalizeRelationArrays(next.wikiEntityIdsBySlug);

                setRelations(next);
                setWikiCache((prev) => ({ ...next.wikiBySlug, ...prev }));
            } catch (err) {
                console.error("Load relation index failed", err);
                if (!disposed) {
                    setRelationsStatus("Không tải được liên kết entity/wiki cho bản đồ.");
                }
            } finally {
                if (!disposed) {
                    setIsRelationsLoading(false);
                }
            }
        }

        loadRelations();
        return () => {
            disposed = true;
        };
    }, []);

    const hoverEntityIds = useMemo(() => {
        if (!hoverAnchor) return [];
        return relations.geometryEntityIds[String(hoverAnchor.featureId)] || [];
    }, [hoverAnchor, relations.geometryEntityIds]);

    const hoverEntities = useMemo(() => {
        return hoverEntityIds
            .map((entityId) => relations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));
    }, [hoverEntityIds, relations.entitiesById]);

    const activeEntity = activeEntityId ? relations.entitiesById[activeEntityId] || null : null;
    const activeEntityGeometries = activeEntityId
        ? relations.entityGeometriesById[activeEntityId] || EMPTY_FEATURE_COLLECTION
        : EMPTY_FEATURE_COLLECTION;
    const mapLabelContextDraft = useMemo(
        () => buildEntityLabelContextDraft(data, relations.geometryEntityIds, relations.entitiesById),
        [data, relations.entitiesById, relations.geometryEntityIds]
    );

    const activeWiki = useMemo(() => {
        if (!activeWikiSlug) return null;
        return wikiCache[activeWikiSlug] || relations.wikiBySlug[activeWikiSlug] || null;
    }, [activeWikiSlug, relations.wikiBySlug, wikiCache]);

    const updateBackgroundVisibility = (updater: (prev: BackgroundLayerVisibility) => BackgroundLayerVisibility) => {
        setBackgroundVisibility((prev) => {
            const next = updater(prev);
            persistBackgroundLayerVisibility(next);
            return next;
        });
    };

    const handleToggleBackgroundLayer = (id: BackgroundLayerId) => {
        updateBackgroundVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const handleShowAllBackgroundLayers = () => {
        updateBackgroundVisibility(() => ({ ...DEFAULT_BACKGROUND_LAYER_VISIBILITY }));
    };

    const handleHideAllBackgroundLayers = () => {
        updateBackgroundVisibility(() => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY }));
    };

    const handleTimelineYearChange = (nextYear: number) => {
        setTimelineDraftYear(clampYearToFixedRange(Math.trunc(nextYear)));
    };

    const handleTimeRangeChange = (nextRange: number) => {
        const safe = Number.isFinite(nextRange) ? Math.trunc(nextRange) : 0;
        setTimeRange(Math.max(0, Math.min(30, safe)));
    };

    const clearHoverHideTimer = useCallback(() => {
        if (hoverHideTimerRef.current !== null) {
            window.clearTimeout(hoverHideTimerRef.current);
            hoverHideTimerRef.current = null;
        }
    }, []);

    const selectEntity = useCallback((
        entityId: string,
        options?: {
            sourceFeatureId?: string | number | null;
            preferredWikiSlug?: string | null;
            focusMap?: boolean;
            selectGeometry?: boolean;
        }
    ) => {
        const entity = relations.entitiesById[entityId] || null;
        if (!entity) return;

        const linkedWikis = relations.entityWikisById[entityId] || [];
        const preferredWikiSlug = String(options?.preferredWikiSlug || "").trim();
        const nextWikiSlug =
            (preferredWikiSlug && linkedWikis.some((wiki) => String(wiki.slug || "").trim() === preferredWikiSlug)
                ? preferredWikiSlug
                : "") ||
            linkedWikis.map((wiki) => String(wiki.slug || "").trim()).find((slug) => slug.length > 0) ||
            null;

        setActiveEntityId(entityId);
        setActiveWikiSlug(nextWikiSlug);
        setActiveWikiError(null);
        setLinkEntityPopup(null);
        if (options?.focusMap !== false) {
            setEntityFocusToken((prev) => prev + 1);
        }
        if (options?.selectGeometry && options?.sourceFeatureId != null) {
            setSelectedFeatureIds([options.sourceFeatureId]);
        }
    }, [relations.entitiesById, relations.entityWikisById]);

    useEffect(() => {
        if (!selectedFeatureIds || selectedFeatureIds.length === 0) return;
        // For UI simplicity in viewer, just link to the first selected geometry
        const linkedEntityIds = relations.geometryEntityIds[String(selectedFeatureIds[0])] || [];
        if (linkedEntityIds.length !== 1) return;

        const onlyEntityId = linkedEntityIds[0];
        if (activeEntityId === onlyEntityId) return;

        selectEntity(onlyEntityId, {
            sourceFeatureId: selectedFeatureIds[0],
            focusMap: true,
            selectGeometry: false,
        });
    }, [activeEntityId, relations.geometryEntityIds, selectEntity, selectedFeatureIds]);

    const handleMapHoverChange = useCallback((payload: MapHoverPayload | null) => {
        clearHoverHideTimer();

        if (payload) {
            setHoverAnchor(payload);
            return;
        }

        if (hoverPopupHoveredRef.current) return;
        hoverHideTimerRef.current = window.setTimeout(() => {
            setHoverAnchor(null);
        }, 120);
    }, [clearHoverHideTimer]);

    useEffect(() => {
        return () => {
            if (hoverHideTimerRef.current !== null) {
                window.clearTimeout(hoverHideTimerRef.current);
            }
        };
    }, []);

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

    const cachedWiki = activeWikiSlug ? wikiCache[activeWikiSlug] : undefined;

    useEffect(() => {
        if (!activeWikiSlug) {
            setIsActiveWikiLoading(false);
            setActiveWikiError(null);
            return;
        }

        if (cachedWiki && (cachedWiki.__fetched || cachedWiki.id === "__not_found__")) {
            setIsActiveWikiLoading(false);
            if (cachedWiki.id === "__not_found__") {
                setActiveWikiError("Không tìm thấy wiki cho entity đã chọn.");
            } else {
                setActiveWikiError(null);
            }
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
                            if (res?.data?.content) {
                                versionContent = res.data.content;
                            }
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

    const helperText = isRelationsLoading
        ? `Đang index entity/wiki ${relationsProgress.completed}/${relationsProgress.total || "?"}`
        : relationsStatus || `Features: ${data.features.length}`;

    return (
        <div className="relative min-h-screen overflow-hidden bg-gray-950 text-gray-100">
            <div className="relative min-h-screen">
                {isBackgroundVisibilityReady ? (
                    <Map
                        mode="select"
                        renderDraft={data}
                        labelContextDraft={mapLabelContextDraft}
                        labelTimelineYear={timelineDraftYear}
                        selectedFeatureIds={selectedFeatureIds}
                        onSelectFeatureIds={setSelectedFeatureIds}
                        backgroundVisibility={backgroundVisibility}
                        geometryVisibility={geometryVisibility}
                        allowGeometryEditing={false}
                        applyGeometryBindingFilter={true}
                        onHoverFeatureChange={handleMapHoverChange}
                        highlightFeatures={activeEntityGeometries}
                        focusFeatureCollection={activeEntityGeometries}
                        focusRequestKey={entityFocusToken}
                        focusPadding={activeEntityId && isLargeScreen ? { top: 84, right: sidebarWidth + 80, bottom: 116, left: 84 } : { top: 84, right: 84, bottom: 116, left: 84 }}
                    />
                ) : (
                    <div className="h-screen w-full bg-[#0b1220]" />
                )}

                <TimelineBar
                    year={timelineDraftYear}
                    onYearChange={handleTimelineYearChange}
                    timeRange={timeRange}
                    onTimeRangeChange={handleTimeRangeChange}
                    isLoading={isTimelineLoading}
                    disabled={false}
                    statusText={timelineStatus}
                    style={activeEntityId && isLargeScreen ? { right: `${sidebarWidth + 32}px` } : undefined}
                />

                <div className={mapLayersStyles.panel}>
                    <div className={`${mapLayersStyles.header} ${isMapLayersCollapsed ? mapLayersStyles.headerCollapsed : ""}`}>
                        <div>
                            <div className={mapLayersStyles.title}>Map Layers</div>
                            <div className={mapLayersStyles.subtitle}>{helperText}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsMapLayersCollapsed(!isMapLayersCollapsed)}
                            className={mapLayersStyles.collapseButton}
                            aria-label={isMapLayersCollapsed ? "Expand Map Layers" : "Collapse Map Layers"}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`${mapLayersStyles.collapseIcon} ${isMapLayersCollapsed ? mapLayersStyles.iconRotated : ""}`}
                            >
                                <polyline points="18 15 12 9 6 15" />
                            </svg>
                        </button>
                    </div>

                    <div className={`${mapLayersStyles.content} ${isMapLayersCollapsed ? mapLayersStyles.contentCollapsed : ""}`}>
                        <div>
                            <div className={mapLayersStyles.sectionHeader}>
                                <span>Background</span>
                                <div className={mapLayersStyles.actions}>
                                    <button
                                        type="button"
                                        onClick={handleShowAllBackgroundLayers}
                                        className={mapLayersStyles.actionButton}
                                    >
                                        All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleHideAllBackgroundLayers}
                                        className={mapLayersStyles.actionButton}
                                    >
                                        Off
                                    </button>
                                </div>
                            </div>
                            <div className={mapLayersStyles.listContainer}>
                                {BACKGROUND_LAYER_OPTIONS.map((layer) => {
                                    const active = Boolean(backgroundVisibility[layer.id]);
                                    return (
                                        <button
                                            key={layer.id}
                                            type="button"
                                            onClick={() => handleToggleBackgroundLayer(layer.id)}
                                            className={`${mapLayersStyles.listItem} ${
                                                active ? mapLayersStyles.listItemActiveSky : mapLayersStyles.listItemInactive
                                            }`}
                                        >
                                            <div className={mapLayersStyles.listItemLeft}>
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className={mapLayersStyles.itemHashIcon}
                                                >
                                                    <line x1="4" y1="9" x2="20" y2="9" />
                                                    <line x1="4" y1="15" x2="20" y2="15" />
                                                    <line x1="10" y1="3" x2="8" y2="21" />
                                                    <line x1="16" y1="3" x2="14" y2="21" />
                                                </svg>
                                                <span className={mapLayersStyles.itemName}>{layer.label}</span>
                                            </div>
                                            
                                            {active ? (
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className={mapLayersStyles.eyeIcon}
                                                >
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            ) : (
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className={mapLayersStyles.eyeIconInactive}
                                                >
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                    <line x1="1" y1="1" x2="23" y2="23" />
                                                </svg>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <div className={mapLayersStyles.sectionTitle}>
                                Geometry
                            </div>
                            <div className={mapLayersStyles.listContainer}>
                                {GEO_TYPE_KEYS.map((typeKey) => {
                                    const active = geometryVisibility[typeKey] !== false;
                                    return (
                                        <button
                                            key={typeKey}
                                            type="button"
                                            onClick={() => {
                                                setGeometryVisibility((prev) => ({
                                                    ...prev,
                                                    [typeKey]: prev[typeKey] === false,
                                                }));
                                            }}
                                            className={`${mapLayersStyles.listItem} ${
                                                active ? mapLayersStyles.listItemActiveEmerald : mapLayersStyles.listItemInactive
                                            }`}
                                        >
                                            <div className={mapLayersStyles.listItemLeft}>
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className={mapLayersStyles.itemHashIcon}
                                                >
                                                    <line x1="4" y1="9" x2="20" y2="9" />
                                                    <line x1="4" y1="15" x2="20" y2="15" />
                                                    <line x1="10" y1="3" x2="8" y2="21" />
                                                    <line x1="16" y1="3" x2="14" y2="21" />
                                                </svg>
                                                <span className={mapLayersStyles.itemName}>
                                                    {typeKey.replaceAll("_", " ")}
                                                </span>
                                            </div>

                                            {active ? (
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className={mapLayersStyles.eyeIcon}
                                                >
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            ) : (
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className={mapLayersStyles.eyeIconInactive}
                                                >
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                    <line x1="1" y1="1" x2="23" y2="23" />
                                                </svg>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {hoverAnchor && hoverEntities.length > 0 ? (
                    <div
                        className="absolute z-30 w-[320px] max-w-[calc(100vw-2rem)]"
                        style={{
                            left: clampNumber(hoverAnchor.point.x + 18, 16, typeof window !== "undefined" ? window.innerWidth - 340 : hoverAnchor.point.x + 18),
                            top: clampNumber(hoverAnchor.point.y - 8, 16, typeof window !== "undefined" ? window.innerHeight - 280 : hoverAnchor.point.y - 8),
                        }}
                        onMouseEnter={() => {
                            hoverPopupHoveredRef.current = true;
                            clearHoverHideTimer();
                        }}
                        onMouseLeave={() => {
                            hoverPopupHoveredRef.current = false;
                            setHoverAnchor(null);
                        }}
                    >
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur">
                            {hoverEntities.length > 1 ? (
                                <div className="border-b border-white/10 px-4 py-3">
                                    <div className="text-sm font-semibold text-white">Related Entities</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                        Geometry #{String(hoverAnchor.featureId)}
                                    </div>
                                </div>
                            ) : null}
                            <div className="max-h-[252px] overflow-y-auto">
                                <div className="grid gap-2 p-3">
                                    {hoverEntities.map((entity) => (
                                        <button
                                            key={entity.id}
                                            type="button"
                                            onClick={() => {
                                                selectEntity(entity.id, {
                                                    sourceFeatureId: hoverAnchor.featureId,
                                                    focusMap: true,
                                                    selectGeometry: true,
                                                });
                                                setHoverAnchor(null);
                                            }}
                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10"
                                        >
                                            <div className="truncate text-sm font-semibold text-white">
                                                {entity.name}
                                            </div>
                                            <div
                                                className="mt-1 text-xs leading-5 text-slate-400"
                                                style={{
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: "vertical",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                {entity.description?.trim() || "Không có mô tả."}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {activeEntity ? (
                    <aside className="absolute bottom-4 right-4 top-4 z-20 max-w-[calc(100vw-2rem)]">
                        <PublicWikiSidebar
                            entity={activeEntity}
                            wiki={activeWiki}
                            isLoading={isActiveWikiLoading}
                            error={activeWikiError}
                            onClose={() => {
                                setActiveEntityId(null);
                                setActiveWikiSlug(null);
                                setActiveWikiError(null);
                                setLinkEntityPopup(null);
                                setSelectedFeatureIds([]);
                            }}
                            onWikiLinkRequest={handleWikiLinkRequest}
                            sidebarWidth={sidebarWidth}
                            onSidebarWidthChange={setSidebarWidth}
                            maxDragWidth={maxDragWidth}
                        />
                    </aside>
                ) : null}
            </div>

            {linkEntityPopup ? (
                <div
                    ref={linkEntityPopupRef}
                    className="fixed z-[60] w-[240px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
                    style={{ top: linkEntityPopup.top, left: linkEntityPopup.left }}
                >
                    <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Related Entities
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            /wiki/{linkEntityPopup.slug}
                        </div>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto p-2">
                        <div className="grid gap-1">
                            {linkEntityPopup.entities.map((entity) => (
                                <button
                                    key={entity.id}
                                    type="button"
                                    onClick={() => {
                                        selectEntity(entity.id, { preferredWikiSlug: linkEntityPopup.slug });
                                        setLinkEntityPopup(null);
                                    }}
                                    className="rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.04] dark:hover:text-white"
                                >
                                    {entity.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

async function fetchAllEntities(): Promise<Entity[]> {
    const items: Entity[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;

    while (true) {
        const page = await fetchEntities({ q: "", limit: ENTITY_PAGE_LIMIT, cursor });
        if (!page.length) break;

        for (const entity of page) {
            if (!entity?.id || seen.has(entity.id)) continue;
            seen.add(entity.id);
            items.push(entity);
        }

        if (page.length < ENTITY_PAGE_LIMIT) break;
        const nextCursor = page[page.length - 1]?.id;
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
    }

    return items;
}

async function fetchAllWikisForEntity(entityId: string): Promise<Wiki[]> {
    const items: Wiki[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;

    while (true) {
        const page = await searchWikisByTitle("", {
            entityId,
            limit: WIKI_PAGE_LIMIT,
            cursor,
        });
        if (!page.length) break;

        for (const wiki of page) {
            if (!wiki?.id || seen.has(wiki.id)) continue;
            seen.add(wiki.id);
            items.push(wiki);
        }

        if (page.length < WIKI_PAGE_LIMIT) break;
        const nextCursor = page[page.length - 1]?.id;
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
    }

    return items;
}

async function mapWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>
): Promise<void> {
    const runnerCount = Math.max(1, Math.min(concurrency, items.length));
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: runnerCount }, async () => {
            while (true) {
                const current = nextIndex++;
                if (current >= items.length) return;
                await worker(items[current], current);
            }
        })
    );
}

function pushUniqueString(target: Record<string, string[]>, key: string, value: string) {
    if (!target[key]) {
        target[key] = [value];
        return;
    }
    if (!target[key].includes(value)) {
        target[key].push(value);
    }
}

function normalizeRelationArrays(target: Record<string, string[]>) {
    for (const key of Object.keys(target)) {
        target[key] = Array.from(new Set(target[key]));
    }
}

function buildEntityLabelContextDraft(
    draft: FeatureCollection,
    geometryEntityIds: Record<string, string[]>,
    entitiesById: Record<string, Entity>
): FeatureCollection {
    if (!draft.features.length) return draft;

    return {
        ...draft,
        features: draft.features.map((feature) => {
            const entityIds = geometryEntityIds[String(feature.properties.id)] || [];
            if (!entityIds.length) return feature;

            const candidates = entityIds.map((id) => {
                const entity = entitiesById[id] || null;
                const name = String(entity?.name || id).trim();
                if (!name) return null;
                return {
                    id,
                    name,
                    time_start: entity?.time_start ?? null,
                    time_end: entity?.time_end ?? null,
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

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
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
