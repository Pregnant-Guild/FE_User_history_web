"use client";

import dynamic from "next/dynamic";

const PreviewMapShell = dynamic(
    () => import("@/uhm/components/preview/PreviewMapShell"),
    { ssr: false }
);

import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import MapPlaceholder from "@/uhm/components/preview/MapPlaceholder";
import FirstVisitGuideModal from "@/uhm/components/preview/FirstVisitGuideModal";
import GeometrySelectionPanel, {
    type GeometrySelectionRow,
} from "@/uhm/components/preview/GeometrySelectionPanel";
import WikiSelectionPanel from "@/uhm/components/preview/WikiSelectionPanel";
import { usePublicPreviewData } from "@/uhm/components/preview/hooks/usePublicPreviewData";
import {
    fetchEntitiesByWikiIds,
    fetchGeometriesByEntityIds,
} from "@/uhm/api/relations";
import { useReplayPreview } from "@/uhm/lib/replay/useReplayPreview";
import type { MapFeaturePayload, MapHandle } from "@/uhm/components/Map";
import { useRef, useMemo, useCallback, useState, useEffect, type RefObject } from "react";
import { usePublicPreviewInteraction } from "@/uhm/components/preview/hooks/usePublicPreviewInteraction";
import PresentPlaceSearch, {
    type HistoricalGeometryFocusPayload,
    type PresentPlaceSelection,
} from "@/uhm/components/editor/PresentPlaceSearch";
import type { Entity } from "@/uhm/api/entities";
import { fetchWikiBySlug, type Wiki } from "@/uhm/api/wikis";
import type { FeatureCollection } from "@/uhm/types/geo";
import {
    type BackgroundLayerId,
    type BackgroundLayerVisibility,
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/map/styles/backgroundLayers";
import {
    loadBackgroundLayerVisibilityFromStorage,
    persistBackgroundLayerVisibility,
} from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { GEO_TYPE_KEYS } from "@/uhm/lib/map/geo/geoTypeMap";
import { clampYearToFixedRange, TIMELINE_DEBOUNCE_MS } from "@/uhm/lib/utils/timeline";
import RelatedEntityPopup from "@/uhm/components/preview/RelatedEntityPopup";
import { PublicMapZoomPanel } from "@/uhm/components/preview/PublicMapZoomPanel";
import {
    cleanWikiPreviewQuote,
    extractWikiBlockquoteText,
    buildGeometrySelectionRows,
    filterRelationGeometriesByEarliestStartTime,
    relationGeometriesToFeatureCollection,
    getEntityPreferredTimeStart,
    findRelationWikiBySlug,
    findRelationEntityIdsByWikiSlug,
    cloneStringArrayRecord,
    appendUnique,
} from "@/uhm/lib/preview/previewUtils";

const CURRENT_YEAR = new Date().getUTCFullYear();

interface PublicPreviewClientPageProps {
    userHasEntered: boolean;
    onEnter: () => void;
    instantLoad: boolean;
    toggleInstantLoad: (val: boolean) => void;
}

export default function PublicPreviewClientPage({
    userHasEntered,
    onEnter,
    instantLoad,
    toggleInstantLoad
}: PublicPreviewClientPageProps) {
    const [selectedFeatureIds, setSelectedFeatureIds] = useState<(string | number)[]>([]);
    const [timelineYear, setTimelineYear] = useState<number>(1000);
    const [timelineDraftYear, setTimelineDraftYear] = useState<number>(1000);
    const [timeRange, setTimeRange] = useState<number>(0);
    const [backgroundVisibility, setBackgroundVisibility] = useState<BackgroundLayerVisibility>(
        () => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY })
    );
    const [isBackgroundVisibilityReady, setIsBackgroundVisibilityReady] = useState(false);
    const [geometryVisibility, setGeometryVisibility] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const key of GEO_TYPE_KEYS) init[key] = true;
        return init;
    });
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("public-wiki-sidebar-width");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed >= 320 && parsed <= 800) return parsed;
            }
        }
        return 420;
    });
    const [sidebarHeight, setSidebarHeight] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("public-wiki-sidebar-height");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed >= 200 && parsed <= 1200) return parsed;
            }
        }
        return 400;
    });
    const handleSidebarHeightChange = (height: number) => {
        setSidebarHeight(height);
        if (typeof window !== "undefined") {
            localStorage.setItem("public-wiki-sidebar-height", String(height));
        }
    };
    const [isLargeScreen, setIsLargeScreen] = useState(false);
    const [loadInteractiveMap, setLoadInteractiveMap] = useState(false);
    const [isLayerPanelVisible, setIsLayerPanelVisible] = useState(true);
    const [wikiSelectionPanelAnchor, setWikiSelectionPanelAnchor] = useState<MapFeaturePayload | null>(null);
    const [geometrySelectionPanel, setGeometrySelectionPanel] = useState<{
        wikiSlug: string;
        rows: GeometrySelectionRow[];
        isLoading: boolean;
        error: string | null;
    } | null>(null);
    const [rightPanelMode, setRightPanelMode] = useState<"wiki" | "selection" | "geometry-selection" | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("timeline-year");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed)) {
                    const clamped = clampYearToFixedRange(parsed);
                    setTimelineYear(clamped);
                    setTimelineDraftYear(clamped);
                }
            }
        }

        if (instantLoad) {
            setLoadInteractiveMap(true);
        } else {
            const timer = setTimeout(() => {
                setLoadInteractiveMap(true);
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [instantLoad]);

    useEffect(() => {
        if (userHasEntered) {
            setLoadInteractiveMap(true);
        }
    }, [userHasEntered]);

    const mapHandleRef = useRef<MapHandle>(null);
    const isFirstMount = useRef(true);
    const [replayMode, setReplayMode] = useState<"idle" | "playing" | "paused">("idle");
    const previousReplayModeRef = useRef<typeof replayMode>("idle");
    const [selectedReplayStageId, setSelectedReplayStageId] = useState<number | null>(null);
    const [selectedReplayStepIndex, setSelectedReplayStepIndex] = useState<number | null>(null);
    const [focusedPresentPlace, setFocusedPresentPlace] = useState<PresentPlaceSelection | null>(null);

    const [searchTimelineYear, setSearchTimelineYear] = useState(timelineYear);
    useEffect(() => {
        if (replayMode === "idle") {
            setSearchTimelineYear(timelineYear);
        }
    }, [timelineYear, replayMode]);

    const {
        data,
        renderDraft,
        labelContextDraft,
        relations,
        setRelations,
        isTimelineLoading,
        timelineStatus,
        isRelationsLoading,
        relationsStatus,
        replays,
        ensureChildrenForGeometry,
    } = usePublicPreviewData({ timelineYear: searchTimelineYear, timeRange, enabled: loadInteractiveMap });

    const activeReplay = useMemo(() => {
        if (!selectedFeatureIds.length || !replays?.length) return null;
        for (const featureId of selectedFeatureIds) {
            const id = String(featureId);
            // 1. Direct geometry_id match (priority)
            for (const replay of replays) {
                if (String(replay.geometry_id || "").trim() === id) {
                    const firstStage = replay.detail?.find((s) => Array.isArray(s?.steps) && s.steps.length > 0);
                    if (firstStage) {
                        return { replay, stageId: firstStage.id, stepIndex: 0 };
                    }
                }
            }
            // 2. Fallback: Check inside steps parameters
            for (const replay of replays) {
                for (const stage of replay.detail || []) {
                    for (let stepIndex = 0; stepIndex < (stage.steps || []).length; stepIndex++) {
                        const step = stage.steps[stepIndex];
                        if (step?.use_geo_function?.some((g) => g.params && Array.isArray(g.params) && g.params.some((p) => String(p) === id))) {
                            return { replay, stageId: stage.id, stepIndex };
                        }
                    }
                }
            }
        }
        return null;
    }, [replays, selectedFeatureIds]);

    const getMapInstance = useCallback(() => mapHandleRef.current?.getMap() || null, []);
    const handleSelectReplayStep = useCallback((stageId: number | null, stepIndex: number | null) => {
        setSelectedReplayStageId(stageId);
        setSelectedReplayStepIndex(stepIndex);
    }, []);

    const focusFirstWikiEntityGeometries = useCallback(async (wiki: Wiki) => {
        const wikiId = String(wiki.id || "").trim();
        if (!wikiId) return;

        try {
            const entitiesByWikiId = await fetchEntitiesByWikiIds([wikiId]);
            const firstEntity = (entitiesByWikiId[wikiId] || [])[0] || null;
            if (!firstEntity?.id) return;

            const geometriesByEntityId = await fetchGeometriesByEntityIds([firstEntity.id]);
            const geometries = geometriesByEntityId[firstEntity.id] || [];
            const features = geometries
                .filter((geometry) => geometry.draw_geometry)
                .map((geometry) => ({
                    type: "Feature" as const,
                    properties: { id: geometry.id },
                    geometry: geometry.draw_geometry,
                }));
            if (!features.length) return;

            const map = mapHandleRef.current?.getMap();
            if (!map) return;
            const { fitMapToFeatureCollection } = await import("@/uhm/components/map/mapUtils");
            fitMapToFeatureCollection(
                map,
                { type: "FeatureCollection", features },
                96,
                { duration: 1000, maxZoom: 8, pointZoom: 6 }
            );
        } catch (err) {
            console.error("Focus wiki linked entity geometries failed", err);
        }
    }, []);

    const replayPreview = useReplayPreview({
        replay: activeReplay?.replay || null,
        draft: renderDraft,
        getMapInstance,
        initialTimelineYear: timelineDraftYear,
        initialTimelineFilterEnabled: false,
        initialMapViewState: null,
        selectedStageId: selectedReplayStageId,
        selectedStepIndex: selectedReplayStepIndex,
        onSelectStep: handleSelectReplayStep,
    });

    const {
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
    } = usePublicPreviewInteraction({
        data,
        relations,
        setRelations,
        selectedFeatureIds,
        setSelectedFeatureIds,
        timelineYear: replayMode !== "idle" ? replayPreview.timelineYear : timelineDraftYear,
        replayActiveWikiId: replayPreview.activeWikiId,
        replayMode,
        onWikiLinkNavigate: focusFirstWikiEntityGeometries,
        onSelect: useCallback(() => {
            setWikiSelectionPanelAnchor(null);
            setGeometrySelectionPanel(null);
            setRightPanelMode("wiki");
        }, []),
    });

    const handlePanelWikiLinkRequest = useCallback((request: { slug: string; rect: DOMRect }) => {
        setWikiSelectionPanelAnchor(null);
        setGeometrySelectionPanel(null);
        setRightPanelMode("wiki");
        void handleWikiLinkRequest(request);
    }, [handleWikiLinkRequest]);

    const handlePanelWikiLinkEntitySelectionRequest = useCallback(async (request: { slug: string; rect: DOMRect }) => {
        const nextSlug = String(request.slug || "").trim();
        if (!nextSlug.length) return;

        setWikiSelectionPanelAnchor(null);
        setLinkEntityPopup(null);
        setRightPanelMode("geometry-selection");
        setGeometrySelectionPanel({
            wikiSlug: nextSlug,
            rows: [],
            isLoading: true,
            error: null,
        });

        let wiki = findRelationWikiBySlug(relations.wikiBySlug, nextSlug) || null;
        const linkedEntityIds = findRelationEntityIdsByWikiSlug(relations.wikiEntityIdsBySlug, nextSlug);
        let entities = linkedEntityIds
            .map((entityId) => relations.entitiesById[entityId] || null)
            .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));

        try {
            if (!entities.length) {
                if (!wiki) wiki = await fetchWikiBySlug(nextSlug);
                if (wiki?.id) {
                    const loadedWiki = wiki;
                    const entitiesByWikiId = await fetchEntitiesByWikiIds([loadedWiki.id]);
                    entities = entitiesByWikiId[loadedWiki.id] || [];

                    setRelations((prev) => {
                        const wikiById = { ...prev.wikiById };
                        const wikiBySlug = { ...prev.wikiBySlug };
                        const wikiEntityIdsById = cloneStringArrayRecord(prev.wikiEntityIdsById);
                        const wikiEntityIdsBySlug = cloneStringArrayRecord(prev.wikiEntityIdsBySlug);
                        const entitiesById = { ...prev.entitiesById };
                        const canonicalSlug = String(loadedWiki.slug || nextSlug).trim();

                        wikiById[loadedWiki.id] = loadedWiki;
                        if (canonicalSlug) wikiBySlug[canonicalSlug] = loadedWiki;

                        for (const entity of entities) {
                            if (!entity?.id) continue;
                            entitiesById[entity.id] = entity;
                            appendUnique(wikiEntityIdsById, loadedWiki.id, entity.id);
                            if (canonicalSlug) appendUnique(wikiEntityIdsBySlug, canonicalSlug, entity.id);
                            appendUnique(wikiEntityIdsBySlug, nextSlug, entity.id);
                        }

                        return {
                            ...prev,
                            entitiesById,
                            wikiById,
                            wikiBySlug,
                            wikiEntityIdsById,
                            wikiEntityIdsBySlug,
                        };
                    });
                }
            }

            const entityIds = entities.map((entity) => entity.id).filter((id) => String(id || "").trim().length > 0);
            if (!entityIds.length) {
                setGeometrySelectionPanel({
                    wikiSlug: nextSlug,
                    rows: [],
                    isLoading: false,
                    error: "Wiki này chưa có thực thể liên quan.",
                });
                return;
            }

            const allGeometriesByEntityId = await fetchGeometriesByEntityIds(entityIds);
            const earliestGeometriesByEntityId = filterRelationGeometriesByEarliestStartTime(allGeometriesByEntityId);
            const rows = await buildGeometrySelectionRows(entities, earliestGeometriesByEntityId);

            setRelations((prev) => ({
                ...prev,
                entitiesById: {
                    ...prev.entitiesById,
                    ...Object.fromEntries(entities.map((entity) => [entity.id, entity])),
                },
                entityGeometriesById: {
                    ...prev.entityGeometriesById,
                    ...Object.fromEntries(entityIds.map((entityId) => [
                        entityId,
                        relationGeometriesToFeatureCollection(earliestGeometriesByEntityId[entityId] || []),
                    ])),
                },
            }));

            setGeometrySelectionPanel({
                wikiSlug: nextSlug,
                rows,
                isLoading: false,
                error: null,
            });
        } catch (err) {
            console.error("Load wiki geometry selection failed", err);
            setGeometrySelectionPanel({
                wikiSlug: nextSlug,
                rows: [],
                isLoading: false,
                error: err instanceof Error ? err.message : "Không tải được danh sách geometry.",
            });
        }
    }, [
        relations.entitiesById,
        relations.wikiBySlug,
        relations.wikiEntityIdsBySlug,
        setLinkEntityPopup,
        setRelations,
    ]);

    useEffect(() => {
        if (!selectedFeatureIds.length) return;
        for (const featureId of selectedFeatureIds) {
            void ensureChildrenForGeometry(featureId);
        }
    }, [ensureChildrenForGeometry, selectedFeatureIds]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            setIsLargeScreen(window.innerWidth >= 1024);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (timelineDraftYear !== timelineYear) setTimelineYear(timelineDraftYear);
        }, TIMELINE_DEBOUNCE_MS);
        return () => window.clearTimeout(timeoutId);
    }, [timelineDraftYear, timelineYear]);



    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        if (typeof window !== "undefined") {
            localStorage.setItem("timeline-year", String(timelineYear));
        }
    }, [timelineYear]);

    // Prevent global browser zoom on multi-touch pinch gestures for this entire route
    useEffect(() => {
        const preventZoom = (e: TouchEvent) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        };

        document.addEventListener("touchmove", preventZoom, { passive: false });
        return () => {
            document.removeEventListener("touchmove", preventZoom);
        };
    }, []);

    useEffect(() => {
        if (!loadInteractiveMap) return;
        const timeoutId = window.setTimeout(() => {
            setBackgroundVisibility(loadBackgroundLayerVisibilityFromStorage());
            setIsBackgroundVisibilityReady(true);
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [loadInteractiveMap]);
    const maxDragWidth = typeof window !== "undefined"
        ? Math.min(800, window.innerWidth - 340)
        : 800;

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

    const handleTimelineYearChange = (nextYear: number) => {
        setTimelineDraftYear(clampYearToFixedRange(Math.trunc(nextYear)));
    };

    const handleTimeRangeChange = (nextRange: number) => {
        const safe = Number.isFinite(nextRange) ? Math.trunc(nextRange) : 0;
        setTimeRange(Math.max(0, Math.min(30, safe)));
    };

    useEffect(() => {
        const previousReplayMode = previousReplayModeRef.current;
        previousReplayModeRef.current = replayMode;
        if (previousReplayMode !== "playing" && replayMode === "playing" && !replayPreview.isPlaying) {
            replayPreview.playFromSelection();
        }
    }, [replayMode, replayPreview.isPlaying, replayPreview.playFromSelection]);

    const handlePlayPreviewReplay = useCallback(() => {
        if (!activeReplay) return;
        setReplayMode("playing");
        setSelectedReplayStageId(activeReplay.stageId);
        setSelectedReplayStepIndex(activeReplay.stepIndex);
    }, [activeReplay]);

    const handleStopPreviewReplay = useCallback(() => {
        setReplayMode("paused");
        replayPreview.stopPreview();
    }, [replayPreview]);

    const handleResumePreviewReplay = useCallback(() => {
        setReplayMode("playing");
    }, []);

    const handleResetPreviewReplay = useCallback(() => {
        if (!activeReplay) {
            setReplayMode("idle");
            replayPreview.resetPreview();
            return;
        }
        setReplayMode("playing");
        setSelectedReplayStageId(activeReplay.stageId);
        setSelectedReplayStepIndex(activeReplay.stepIndex);
        replayPreview.playFromStart();
    }, [activeReplay, replayPreview]);

    const handleExitReplay = useCallback(() => {
        setReplayMode("idle");
        replayPreview.resetPreview();
        setFocusedPresentPlace(null);
    }, [replayPreview]);

    const handleFocusPresentPlace = useCallback((place: PresentPlaceSelection) => {
        setFocusedPresentPlace(place);
        const map = mapHandleRef.current?.getMap();
        if (map) {
            const currentZoom = map.getZoom();
            map.flyTo({
                center: [place.lng, place.lat],
                zoom: Math.max(currentZoom, 13.5),
            });
        }
    }, []);

    const clearPresentPlaceFocus = useCallback(() => {
        setFocusedPresentPlace(null);
    }, []);

    const handleFocusHistoricalGeometry = useCallback((payload: HistoricalGeometryFocusPayload) => {
        setFocusedPresentPlace(null);

        const map = mapHandleRef.current?.getMap();
        if (map && payload.geometry?.draw_geometry) {
            const fc: FeatureCollection = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            id: payload.geometry.id,
                        },
                        geometry: payload.geometry.draw_geometry,
                    },
                ],
            };
            import("@/uhm/components/map/mapUtils").then(({ fitMapToFeatureCollection }) => {
                fitMapToFeatureCollection(map, fc, 84, { duration: 1000 });
            });
        }

        if (payload.geometry.time_start != null) {
            handleTimelineYearChange(payload.geometry.time_start);
        }

        setSelectedFeatureIds([payload.geometry.id]);

        const linkedEntityIds = relations.geometryEntityIds[String(payload.geometry.id)] || [];
        if (linkedEntityIds.length === 1) {
            selectEntity(linkedEntityIds[0], {
                sourceFeatureId: payload.geometry.id,
                selectGeometry: false,
            });
        }
    }, [relations.geometryEntityIds, selectEntity, setSelectedFeatureIds]);

    const handleFocusWiki = useCallback((wiki: Wiki) => {
        setFocusedPresentPlace(null);
        setWikiSelectionPanelAnchor(null);
        setGeometrySelectionPanel(null);
        setRightPanelMode("wiki");
        selectWiki(wiki);

        // Focus geometries if any
        const entityIds = relations.wikiEntityIdsById[wiki.id] || [];
        if (entityIds.length > 0) {
            const geometries = relations.entityGeometriesById[entityIds[0]];
            const map = mapHandleRef.current?.getMap();
            if (map && geometries && geometries.features.length > 0) {
                import("@/uhm/components/map/mapUtils").then(({ fitMapToFeatureCollection }) => {
                    fitMapToFeatureCollection(map, geometries, 84, { duration: 1000 });
                });
            }
        }
    }, [relations.wikiEntityIdsById, relations.entityGeometriesById, selectWiki]);

    const handleCloseWikiSidebar = useCallback(() => {
        setRightPanelMode(null);
        setWikiSelectionPanelAnchor(null);
        setGeometrySelectionPanel(null);
        closeWikiSidebar();
    }, [closeWikiSidebar]);

    const wikiSelectionPanelRows = useMemo(() => {
        if (!wikiSelectionPanelAnchor) return [];

        const entityIds = relations.geometryEntityIds[String(wikiSelectionPanelAnchor.featureId)] || [];
        return entityIds.flatMap((entityId) => {
            const entity = relations.entitiesById[entityId] || null;
            if (!entity) return [];

            const linkedWikis = relations.entityWikisById[entity.id] || [];
            return linkedWikis.map((wiki) => ({
                entity,
                wiki,
                quote: cleanWikiPreviewQuote(wiki.preview_quote) || extractWikiBlockquoteText(wiki.content),
            }));
        });
    }, [wikiSelectionPanelAnchor, relations.entitiesById, relations.entityWikisById, relations.geometryEntityIds]);

    const handleMapFeatureClick = useCallback((payload: MapFeaturePayload | null) => {
        setLinkEntityPopup(null);
        setGeometrySelectionPanel(null);

        if (!payload) {
            setWikiSelectionPanelAnchor(null);
            setRightPanelMode(null);
            return;
        }

        const entityIds = relations.geometryEntityIds[String(payload.featureId)] || [];
        const rows = entityIds.flatMap((entityId) => {
            const entity = relations.entitiesById[entityId] || null;
            if (!entity) return [];

            const linkedWikis = relations.entityWikisById[entity.id] || [];
            return linkedWikis.map((wiki) => ({ entity, wiki }));
        });

        if (!rows.length) {
            setWikiSelectionPanelAnchor(null);
            setRightPanelMode(null);
            return;
        }

        if (rows.length === 1) {
            const row = rows[0];
            selectEntity(row.entity.id, {
                sourceFeatureId: payload.featureId,
                preferredWikiSlug: row.wiki.slug,
                selectGeometry: false,
            });
            setWikiSelectionPanelAnchor(null);
            setRightPanelMode("wiki");
            return;
        }

        closeWikiSidebarPreserveSelection();
        setWikiSelectionPanelAnchor(payload);
        setRightPanelMode("selection");
    }, [
        closeWikiSidebarPreserveSelection,
        relations.entitiesById,
        relations.entityWikisById,
        relations.geometryEntityIds,
        selectEntity,
        setLinkEntityPopup,
    ]);

    const handleGeometrySelectionEntitySelect = useCallback((entityId: string) => {
        const selectedRow = geometrySelectionPanel?.rows.find((row) => row.entity.id === entityId) || null;
        const geometries = selectedRow?.featureCollection || relations.entityGeometriesById[entityId] || null;

        setGeometrySelectionPanel(null);
        setWikiSelectionPanelAnchor(null);
        setRightPanelMode(null);
        closeWikiSidebar();

        if (!geometries?.features.length) return;

        setSelectedFeatureIds(geometries.features.map((feature) => feature.properties.id));
        const focusYear = getEntityPreferredTimeStart(selectedRow?.entity || null, geometries);
        if (focusYear !== null) {
            handleTimelineYearChange(focusYear);
        }

        const map = mapHandleRef.current?.getMap();
        if (!map) return;

        import("@/uhm/components/map/mapUtils").then(({ fitMapToFeatureCollection }) => {
            fitMapToFeatureCollection(map, geometries, 96, { duration: 1000, maxZoom: 8, pointZoom: 6 });
        });
    }, [closeWikiSidebar, geometrySelectionPanel?.rows, relations.entityGeometriesById, setSelectedFeatureIds]);

    const filteredRenderDraft = useMemo(() => {
        if (replayMode === "idle" || !replayPreview.hiddenGeometryIds?.length) {
            return renderDraft;
        }
        const hiddenIds = new Set(replayPreview.hiddenGeometryIds);
        return {
            type: "FeatureCollection" as const,
            features: renderDraft.features.filter(
                (feature) => !hiddenIds.has(String(feature.properties.id))
            ),
        };
    }, [replayMode, renderDraft, replayPreview.hiddenGeometryIds]);

    const filteredLabelContextDraft = useMemo(() => {
        if (replayMode === "idle" || !replayPreview.hiddenGeometryIds?.length) {
            return labelContextDraft;
        }
        const hiddenIds = new Set(replayPreview.hiddenGeometryIds);
        return {
            type: "FeatureCollection" as const,
            features: labelContextDraft.features.filter(
                (feature) => !hiddenIds.has(String(feature.properties.id))
            ),
        };
    }, [replayMode, labelContextDraft, replayPreview.hiddenGeometryIds]);

    const currentTimelineYear = replayMode !== "idle" ? replayPreview.timelineYear : timelineDraftYear;

    const activeStepLabel = useMemo(() => {
        if (
            replayPreview.activeCursor.stageId == null ||
            replayPreview.activeCursor.stepIndex == null ||
            !activeReplay?.replay
        ) {
            return null;
        }
        const stage = activeReplay.replay.detail?.find(
            (s) => s.id === replayPreview.activeCursor.stageId
        );
        if (stage && stage.title?.trim()) {
            return stage.title.trim();
        }
        return `Cảnh #${replayPreview.activeCursor.stageId}`;
    }, [replayPreview.activeCursor.stageId, replayPreview.activeCursor.stepIndex, activeReplay]);

    const isWikiChooserOpen = rightPanelMode === "selection" && Boolean(wikiSelectionPanelAnchor);
    const isGeometryChooserOpen = rightPanelMode === "geometry-selection" && Boolean(geometrySelectionPanel);
    const isSidebarOpen = replayMode !== "idle"
        ? (replayPreview.sidebarOpen || isManualSidebarOpen)
        : Boolean(activeEntity || activeWiki || isManualSidebarOpen);

    const displayedActiveEntity = rightPanelMode !== "selection" && rightPanelMode !== "geometry-selection" && isSidebarOpen ? activeEntity : null;
    const displayedActiveWiki = rightPanelMode !== "selection" && rightPanelMode !== "geometry-selection" && isSidebarOpen ? activeWiki : null;

    const computedTimelineStyle = useMemo(() => {
        const leftMargin = isLayerPanelVisible ? 88 : 18;
        const rightPanelOpen = Boolean(displayedActiveEntity || displayedActiveWiki || isWikiChooserOpen || isGeometryChooserOpen);
        const rightMargin = (rightPanelOpen && isLargeScreen) ? sidebarWidth + 32 : 18;
        const bottomOffset = (rightPanelOpen && !isLargeScreen) ? `${sidebarHeight + 16}px` : undefined;
        return {
            left: `${leftMargin}px`,
            right: `${rightMargin}px`,
            bottom: bottomOffset,
            transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        };
    }, [isLayerPanelVisible, displayedActiveEntity, displayedActiveWiki, isWikiChooserOpen, isGeometryChooserOpen, isLargeScreen, sidebarWidth, sidebarHeight]);

    const isRightPanelOpen = Boolean(displayedActiveEntity || displayedActiveWiki || isWikiChooserOpen || isGeometryChooserOpen);

    const searchBarWidth = useMemo(() => {
        if (isLargeScreen) {
            return "min(392px, calc(100vw - 120px))";
        }
        return "min(280px, calc(100vw - 86px))";
    }, [isLargeScreen]);

    const searchBarWrapperStyle = useMemo(() => {
        if (isLargeScreen) {
            return {
                position: "absolute" as const,
                top: 10,
                left: 84,
                right: isRightPanelOpen ? sidebarWidth + 32 : 18,
                transform: "none",
                zIndex: 18,
                display: "flex",
                flexWrap: "wrap" as const,
                gap: "10px",
                alignItems: "flex-start",
                pointerEvents: "auto" as const,
                maxWidth: "calc(100vw - 102px)",
            };
        }
        return {
            position: "absolute" as const,
            top: 10,
            left: "auto",
            right: 18,
            transform: "none",
            zIndex: 18,
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
            pointerEvents: "auto" as const,
        };
    }, [isLargeScreen, isRightPanelOpen, sidebarWidth]);

    return (
        <>
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    visibility: userHasEntered ? "visible" : "hidden",
                    opacity: userHasEntered ? 1 : 0,
                    transition: "opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.8s",
                }}
            >
                {isBackgroundVisibilityReady && loadInteractiveMap && (
                    <PreviewMapShell
                        mapHandleRef={mapHandleRef}
                        renderDraft={filteredRenderDraft}
                        labelContextDraft={filteredLabelContextDraft}
                        labelTimelineYear={currentTimelineYear}
                        selectedFeatureIds={selectedFeatureIds}
                        onSelectFeatureIds={setSelectedFeatureIds}
                        instantLoad={instantLoad}
                        onToggleInstantLoad={toggleInstantLoad}
                        isReplayMode={replayMode !== "idle"}
                        isLayerPanelVisible={isLayerPanelVisible}
                        onLayerPanelVisibleChange={setIsLayerPanelVisible}
                        backgroundVisibility={backgroundVisibility}
                        geometryVisibility={geometryVisibility}
                        onToggleBackground={handleToggleBackgroundLayer}
                        onToggleGeometry={(typeKey) => {
                            setGeometryVisibility((prev) => ({
                                ...prev,
                                [typeKey]: prev[typeKey] === false,
                            }));
                        }}
                        timelineYear={currentTimelineYear}
                        onTimelineYearChange={handleTimelineYearChange}
                        timelineTimeRange={timeRange}
                        onTimelineTimeRangeChange={handleTimeRangeChange}
                        isTimelineLoading={isTimelineLoading || isRelationsLoading}
                        timelineStatusText={relationsStatus || timelineStatus}
                        timelineStyle={computedTimelineStyle}
                        onFeatureClick={handleMapFeatureClick}
                        hoverPopupEnabled
                        getHoverPopupContent={getHoverPopupContent}
                        activeEntity={displayedActiveEntity}
                        activeWiki={displayedActiveWiki}
                        isWikiLoading={isActiveWikiLoading}
                        wikiError={activeWikiError}
                        onCloseWikiSidebar={handleCloseWikiSidebar}
                        onWikiLinkRequest={handlePanelWikiLinkRequest}
                        onWikiLinkEntitySelectionRequest={handlePanelWikiLinkEntitySelectionRequest}
                        onWikiLinkInteraction={replayMode !== "idle" ? handleExitReplay : undefined}
                        sidebarWidth={sidebarWidth}
                        onSidebarWidthChange={setSidebarWidth}
                        maxSidebarDragWidth={maxDragWidth}
                        sidebarHeight={sidebarHeight}
                        onSidebarHeightChange={handleSidebarHeightChange}
                        showViewportControls={false}
                        onPlayPreviewReplay={activeReplay && replayMode === "idle" ? handlePlayPreviewReplay : undefined}
                        timelineDisabled={replayMode !== "idle"}
                        hasAnyBottomPanel={isWikiChooserOpen || isGeometryChooserOpen}
                        overlay={
                            replayMode !== "idle" ? (
                                <ReplayPreviewOverlay
                                    isPreviewMode={true}
                                    isPlaying={replayPreview.isPlaying}
                                    dialog={replayPreview.dialog}
                                    toasts={replayPreview.toasts}
                                    sidebarOpen={isSidebarOpen}
                                    sidebarWidth={sidebarWidth}
                                    sidebarHeight={sidebarHeight}
                                    isLargeScreen={isLargeScreen}
                                    playbackSpeed={replayPreview.playbackSpeed}
                                    activeStepLabel={activeStepLabel}
                                    activeStepNumber={replayPreview.activeStepNumber}
                                    totalSteps={replayPreview.totalSteps}
                                    playButtonLabel={replayMode === "paused" ? "Tiếp tục" : "Phát lại"}
                                    simplified={true}
                                    onPlayPreview={handleResumePreviewReplay}
                                    onStopPreview={handleStopPreviewReplay}
                                    onResetPreview={handleResetPreviewReplay}
                                    onExitPreview={handleExitReplay}
                                />
                            ) : null
                        }
                    >
                        {!(replayMode !== "idle" && !isLargeScreen) ? (
                            <div style={searchBarWrapperStyle}>
                                <PresentPlaceSearch
                                    focusedPlace={focusedPresentPlace}
                                    onFocusPlace={handleFocusPresentPlace}
                                    onFocusHistoricalGeometry={handleFocusHistoricalGeometry}
                                    onFocusWiki={handleFocusWiki}
                                    onClearFocus={clearPresentPlaceFocus}
                                    style={{
                                        position: "relative",
                                        top: 0,
                                        left: 0,
                                        transform: "none",
                                        width: searchBarWidth,
                                    }}
                                />
                                {isLargeScreen ? (
                                    <PublicMapZoomPanel
                                        mapHandleRef={mapHandleRef}
                                        onPlayPreviewReplay={activeReplay && replayMode === "idle" ? handlePlayPreviewReplay : undefined}
                                        onResumePreviewReplay={replayMode === "paused" ? handleResumePreviewReplay : undefined}
                                        onStopPreviewReplay={replayMode === "playing" ? handleStopPreviewReplay : undefined}
                                    />
                                ) : null}
                            </div>
                        ) : null}
                        <FirstVisitGuideModal />
                    </PreviewMapShell>
                )}

                {linkEntityPopup ? (
                    <RelatedEntityPopup
                        slug={linkEntityPopup.slug}
                        entities={linkEntityPopup.entities}
                        top={linkEntityPopup.top}
                        left={linkEntityPopup.left}
                        onClose={() => setLinkEntityPopup(null)}
                        onSelectEntity={(entityId) => {
                            if (replayMode !== "idle") {
                                handleExitReplay();
                            }
                            setWikiSelectionPanelAnchor(null);
                            setRightPanelMode("wiki");
                            selectEntity(entityId, { preferredWikiSlug: linkEntityPopup.slug });
                            setLinkEntityPopup(null);
                        }}
                    />
                ) : null}

                {isGeometryChooserOpen && geometrySelectionPanel ? (
                    <aside
                        className={isLargeScreen ? "fixed bottom-4 right-4 top-4 left-auto z-20 max-w-[calc(100vw-2rem)]" : "fixed bottom-0 left-0 right-0 top-auto z-20"}
                        style={isLargeScreen ? {
                            width: `min(${sidebarWidth}px, calc(100vw - 2rem))`,
                        } : {
                            height: `${sidebarHeight || 400}px`,
                            maxHeight: "90vh",
                            width: "100%",
                            maxWidth: "100%",
                        }}
                    >
                        <GeometrySelectionPanel
                            wikiSlug={geometrySelectionPanel.wikiSlug}
                            rows={geometrySelectionPanel.rows}
                            isLoading={geometrySelectionPanel.isLoading}
                            error={geometrySelectionPanel.error}
                            onClose={() => {
                                setGeometrySelectionPanel(null);
                                setRightPanelMode(null);
                            }}
                            onSelectEntity={handleGeometrySelectionEntitySelect}
                        />
                    </aside>
                ) : null}

                {isWikiChooserOpen ? (
                    <aside
                        className={isLargeScreen ? "fixed bottom-4 right-4 top-4 left-auto z-20 max-w-[calc(100vw-2rem)]" : "fixed bottom-0 left-0 right-0 top-auto z-20"}
                        style={isLargeScreen ? {
                            width: `min(${sidebarWidth}px, calc(100vw - 2rem))`,
                        } : {
                            height: `${sidebarHeight || 400}px`,
                            maxHeight: "90vh",
                            width: "100%",
                            maxWidth: "100%",
                        }}
                    >
                        <WikiSelectionPanel
                            rows={wikiSelectionPanelRows}
                            onClose={() => {
                                setWikiSelectionPanelAnchor(null);
                                setRightPanelMode(null);
                            }}
                            onSelectRow={(entityId, wikiId) => {
                                const wiki = wikiSelectionPanelRows.find((row) => row.entity.id === entityId && row.wiki.id === wikiId)?.wiki || null;
                                const sourceFeatureId = wikiSelectionPanelAnchor?.featureId ?? null;
                                setWikiSelectionPanelAnchor(null);
                                setRightPanelMode("wiki");
                                selectEntity(entityId, {
                                    sourceFeatureId,
                                    preferredWikiSlug: wiki?.slug,
                                    selectGeometry: false,
                                });
                            }}
                        />
                    </aside>
                ) : null}
            </div>

            {/* Smooth transition loading overlay */}
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    pointerEvents: userHasEntered ? "none" : "auto",
                    opacity: userHasEntered ? 0 : 1,
                    visibility: userHasEntered ? "hidden" : "visible",
                    transition: "opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.8s",
                }}
            >
                <MapPlaceholder onEnter={onEnter} />
            </div>
        </>
    );
}

