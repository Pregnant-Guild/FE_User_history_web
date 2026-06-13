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
    type RelationGeometry,
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
import { reverseGeocodePresentPlace } from "@/uhm/api/goongPlaces";
import { fetchWikiBySlug, type Wiki } from "@/uhm/api/wikis";
import type { FeatureCollection } from "@/uhm/types/geo";
import { getGeometryRepresentativePoint } from "@/uhm/components/map/mapUtils";
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
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from "@/uhm/lib/map/constants";
import { clampYearToFixedRange, TIMELINE_DEBOUNCE_MS } from "@/uhm/lib/utils/timeline";

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
            replayPreview.activeCursor.stepIndex == null
        ) {
            return null;
        }
        return `Cảnh #${replayPreview.activeCursor.stageId} · Bước ${replayPreview.activeCursor.stepIndex + 1}`;
    }, [replayPreview.activeCursor.stageId, replayPreview.activeCursor.stepIndex]);

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
                                    playbackSpeed={replayPreview.playbackSpeed}
                                    activeStepLabel={activeStepLabel}
                                    activeStepNumber={replayPreview.activeStepNumber}
                                    totalSteps={replayPreview.totalSteps}
                                    playButtonLabel={replayMode === "paused" ? "Tiếp tục" : "Phát lại"}
                                    onPlayPreview={handleResumePreviewReplay}
                                    onStopPreview={handleStopPreviewReplay}
                                    onResetPreview={handleResetPreviewReplay}
                                    onExitPreview={handleExitReplay}
                                />
                            ) : null
                        }
                    >
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
                        <FirstVisitGuideModal />
                    </PreviewMapShell>
                )}

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
                            {linkEntityPopup.entities.length ? (
                                <div className="grid gap-1">
                                    {linkEntityPopup.entities.map((entity) => (
                                        <button
                                            key={entity.id}
                                            type="button"
                                            onClick={() => {
                                                setWikiSelectionPanelAnchor(null);
                                                setRightPanelMode("wiki");
                                                selectEntity(entity.id, { preferredWikiSlug: linkEntityPopup.slug });
                                                setLinkEntityPopup(null);
                                            }}
                                            className="rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.04] dark:hover:text-white"
                                        >
                                            {entity.name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    Không có entity liên quan.
                                </div>
                            )}
                        </div>
                    </div>
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

export function PublicMapZoomPanel({
    mapHandleRef,
    onPlayPreviewReplay,
    onResumePreviewReplay,
    onStopPreviewReplay,
}: {
    mapHandleRef: RefObject<MapHandle | null>;
    onPlayPreviewReplay?: () => void;
    onResumePreviewReplay?: () => void;
    onStopPreviewReplay?: () => void;
}) {
    const [zoomLevel, setZoomLevel] = useState(2);
    const [isGlobeProjection, setIsGlobeProjection] = useState(false);
    const isDraggingRef = useRef(false);

    useEffect(() => {
        let disposed = false;
        let cleanup: (() => void) | null = null;
        let retryTimer: number | null = null;

        const bind = () => {
            if (disposed) return;
            const map = mapHandleRef.current?.getMap();
            if (!map) {
                retryTimer = window.setTimeout(bind, 120);
                return;
            }

            const syncProjection = () => {
                const projection = mapHandleRef.current?.getViewState()?.projection;
                setIsGlobeProjection(projection === "globe");
            };

            const syncZoom = () => {
                if (isDraggingRef.current) return;
                setZoomLevel(roundPanelZoom(map.getZoom()));
            };

            syncZoom();
            syncProjection();
            map.on("zoom", syncZoom);
            map.on("zoomend", syncZoom);
            map.on("styledata", syncProjection);
            cleanup = () => {
                map.off("zoom", syncZoom);
                map.off("zoomend", syncZoom);
                map.off("styledata", syncProjection);
            };
        };

        bind();
        return () => {
            disposed = true;
            if (retryTimer) window.clearTimeout(retryTimer);
            cleanup?.();
        };
    }, [mapHandleRef]);

    const toggleProjection = () => {
        const next = !isGlobeProjection;
        setIsGlobeProjection(next);
        mapHandleRef.current?.setGlobeProjection(next);
    };

    const zoomByStep = (delta: number) => {
        const map = mapHandleRef.current?.getMap();
        if (!map) return;
        const next = clampZoom(zoomLevel + delta);
        setZoomLevel(next);
        map.easeTo({ zoom: next, duration: 120 });
    };

    const handleSliderChange = (nextRaw: number) => {
        const map = mapHandleRef.current?.getMap();
        if (!map || !Number.isFinite(nextRaw)) return;
        const next = clampZoom(nextRaw);
        setZoomLevel(next);
        map.jumpTo({ zoom: next });
    };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexShrink: 0,
                minWidth: 0,
                background: "linear-gradient(135deg, rgba(30, 30, 30, 0.72) 0%, rgba(20, 20, 20, 0.85) 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 50,
                padding: "8px 14px",
                color: "#f8fafc",
                boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.05)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                pointerEvents: "auto",
            }}
        >
            <style jsx>{`
                .uhm-public-zoom-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.08);
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    display: grid;
                    place-items: center;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                    flex: 0 0 auto;
                }
                .uhm-public-zoom-btn:hover {
                    border-color: rgba(255, 255, 255, 0.3);
                    background: rgba(255, 255, 255, 0.15);
                }
                .uhm-public-zoom-btn:active {
                    background: rgba(16, 185, 129, 0.25);
                    border-color: #10b981;
                }
                .uhm-public-zoom-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    width: clamp(72px, 12vw, 132px);
                    height: 24px;
                    background: transparent;
                    cursor: pointer;
                    outline: none;
                    flex: 1 1 72px;
                    min-width: 0;
                }
                .uhm-public-zoom-slider::-webkit-slider-runnable-track {
                    width: 100%;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 999px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.2s;
                }
                .uhm-public-zoom-slider:hover::-webkit-slider-runnable-track {
                    background: rgba(255, 255, 255, 0.25);
                    border-color: rgba(255, 255, 255, 0.1);
                }
                .uhm-public-zoom-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    margin-top: -6px;
                    height: 18px;
                    width: 18px;
                    border-radius: 50%;
                    background: radial-gradient(circle at 30% 30%, #34d399 0%, #059669 100%);
                    border: 1.5px solid #ffffff;
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.4), 0 3px 6px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.4);
                    cursor: pointer;
                    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease;
                }
                .uhm-public-zoom-slider:hover::-webkit-slider-thumb {
                    transform: scale(1.2);
                    box-shadow: 0 0 15px rgba(16, 185, 129, 0.6), 0 5px 10px rgba(0, 0, 0, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.5);
                }
                .uhm-public-projection-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    border: 0;
                    background: transparent;
                    color: #94a3b8;
                    cursor: pointer;
                    padding: 0 2px 0 0;
                    user-select: none;
                    flex: 0 0 auto;
                }
                .uhm-public-projection-track {
                    width: 36px;
                    height: 20px;
                    border-radius: 999px;
                    background: rgba(148, 163, 184, 0.18);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
                    position: relative;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .uhm-public-projection-track.active {
                    background: rgba(52, 211, 153, 0.35);
                    border-color: rgba(16, 185, 129, 0.6);
                    box-shadow: 0 0 8px rgba(16, 185, 129, 0.35), inset 0 1px 2px rgba(0, 0, 0, 0.2);
                }
                .uhm-public-projection-thumb {
                    position: absolute;
                    top: 1.5px;
                    left: 2px;
                    width: 15px;
                    height: 15px;
                    border-radius: 50%;
                    background: #94a3b8;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .uhm-public-projection-track.active .uhm-public-projection-thumb {
                    left: 19px;
                    background: #34d399;
                    box-shadow: 0 0 10px rgba(52, 211, 153, 0.6), 0 2px 4px rgba(0, 0, 0, 0.25);
                }
                .uhm-public-projection-label {
                    font-size: 12px;
                    color: #94a3b8;
                    font-weight: 700;
                    min-width: 40px;
                    text-align: left;
                    transition: color 0.25s ease;
                }
                .uhm-public-projection-label.active {
                    color: #ffffff;
                }
                .uhm-public-play-btn {
                    width: auto;
                    min-width: 64px;
                    height: 28px;
                    padding: 0 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    background: rgba(56, 189, 248, 0.15);
                    color: #38bdf8;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                    flex: 0 0 auto;
                }
                .uhm-public-play-btn:hover {
                    border-color: rgba(56, 189, 248, 0.65);
                    background: rgba(56, 189, 248, 0.24);
                    color: #7dd3fc;
                }
                .uhm-public-play-btn.stop {
                    border-color: rgba(248, 113, 113, 0.45);
                    background: rgba(127, 29, 29, 0.45);
                    color: #fecaca;
                }
                .uhm-public-play-btn.stop:hover {
                    border-color: rgba(248, 113, 113, 0.75);
                    background: rgba(153, 27, 27, 0.62);
                    color: #ffffff;
                }
                .uhm-public-play-btn.resume {
                    border-color: rgba(34, 197, 94, 0.45);
                    background: rgba(22, 101, 52, 0.45);
                    color: #bbf7d0;
                }
                .uhm-public-play-btn.resume:hover {
                    border-color: rgba(34, 197, 94, 0.75);
                    background: rgba(22, 163, 74, 0.5);
                    color: #ffffff;
                }
                .uhm-public-play-icon {
                    width: 0;
                    height: 0;
                    border-top: 5px solid transparent;
                    border-bottom: 5px solid transparent;
                    border-left: 8px solid currentColor;
                }
                .uhm-public-stop-icon {
                    width: 9px;
                    height: 9px;
                    border-radius: 2px;
                    background: currentColor;
                }
            `}</style>
            <button
                type="button"
                onClick={toggleProjection}
                className="uhm-public-projection-toggle"
                aria-label="Chuyển chế độ hiển thị hình cầu"
                title={isGlobeProjection ? "Đang ở chế độ hình cầu" : "Đang ở chế độ bản đồ phẳng"}
            >
                <span className={`uhm-public-projection-track ${isGlobeProjection ? "active" : ""}`}>
                    <span className="uhm-public-projection-thumb" />
                </span>
                <span className={`uhm-public-projection-label ${isGlobeProjection ? "active" : ""}`}>
                    {isGlobeProjection ? "Cầu" : "Phẳng"}
                </span>
            </button>
            {onPlayPreviewReplay ? (
                <button
                    type="button"
                    onClick={onPlayPreviewReplay}
                    className="uhm-public-play-btn"
                    aria-label="Phát diễn biến đã chọn"
                    title="Phát diễn biến của hình đang chọn"
                >
                    <span aria-hidden="true" className="uhm-public-play-icon" />
                    Phát
                </button>
            ) : null}
            {onResumePreviewReplay ? (
                <button
                    type="button"
                    onClick={onResumePreviewReplay}
                    className="uhm-public-play-btn resume"
                    aria-label="Tiếp tục diễn biến đã chọn"
                    title="Tiếp tục diễn biến đang tạm dừng"
                >
                    <span aria-hidden="true" className="uhm-public-play-icon" />
                    Tiếp tục
                </button>
            ) : null}
            {onStopPreviewReplay ? (
                <button
                    type="button"
                    onClick={onStopPreviewReplay}
                    className="uhm-public-play-btn stop"
                    aria-label="Dừng diễn biến đã chọn"
                    title="Dừng diễn biến đang phát"
                >
                    <span aria-hidden="true" className="uhm-public-stop-icon" />
                    Dừng
                </button>
            ) : null}
            <button
                type="button"
                onClick={() => zoomByStep(-0.8)}
                className="uhm-public-zoom-btn"
                aria-label="Thu nhỏ bản đồ"
            >
                -
            </button>
            <input
                type="range"
                min={MAP_MIN_ZOOM}
                max={MAP_MAX_ZOOM}
                step={0.1}
                value={zoomLevel}
                className="uhm-public-zoom-slider"
                onPointerDown={() => {
                    isDraggingRef.current = true;
                }}
                onPointerUp={() => {
                    isDraggingRef.current = false;
                    const map = mapHandleRef.current?.getMap();
                    if (map) setZoomLevel(roundPanelZoom(map.getZoom()));
                }}
                onPointerCancel={() => {
                    isDraggingRef.current = false;
                }}
                onBlur={() => {
                    isDraggingRef.current = false;
                }}
                onChange={(event) => handleSliderChange(Number(event.target.value))}
                aria-label="Mức thu phóng bản đồ"
            />
            <button
                type="button"
                onClick={() => zoomByStep(0.8)}
                className="uhm-public-zoom-btn"
                aria-label="Phóng to bản đồ"
            >
                +
            </button>
            <div
                style={{
                    minWidth: 48,
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#94a3b8",
                    fontVariantNumeric: "tabular-nums",
                    flex: "0 0 auto",
                }}
            >
                {zoomLevel.toFixed(1)}x
            </div>
        </div>
    );
}

function clampZoom(value: number): number {
    if (!Number.isFinite(value)) return MAP_MIN_ZOOM;
    return Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, value));
}

function roundPanelZoom(value: number): number {
    if (!Number.isFinite(value)) return MAP_MIN_ZOOM;
    return Math.round(value * 10) / 10;
}

function cleanWikiPreviewQuote(raw: string | null | undefined): string {
    const decoded = decodeHtmlEntities(String(raw || ""));
    const blockquote = extractWikiBlockquoteText(decoded);
    return cleanWikiPlainText(blockquote || decoded);
}

function extractWikiBlockquoteText(content: string | null | undefined): string {
    if (!content) return "";

    const decoded = decodeHtmlEntities(content);
    const blockquoteMatch = decoded.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    const rawText = blockquoteMatch?.[1]?.trim() || "";
    if (!rawText) return "";

    return cleanWikiPlainText(rawText);
}

function cleanWikiPlainText(raw: string): string {
    return decodeHtmlEntities(raw)
        .replace(/<[^>]*>/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function decodeHtmlEntities(raw: string): string {
    return raw
        .replace(/&nbsp;/gi, " ")
        .replace(/&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/gi, "'");
}

async function buildGeometrySelectionRows(
    entities: Entity[],
    geometriesByEntityId: Record<string, RelationGeometry[]>
): Promise<GeometrySelectionRow[]> {
    return Promise.all(entities.map(async (entity) => {
        const geometries = geometriesByEntityId[entity.id] || [];
        const displayGeometries = await Promise.all(geometries.map(async (geometry) => {
            const center = geometry.draw_geometry ? getGeometryRepresentativePoint(geometry.draw_geometry) : null;
            if (!center) {
                return {
                    id: geometry.id,
                    center: null,
                    adminLabel: null,
                    adminAddress: null,
                };
            }

            try {
                const place = await reverseGeocodePresentPlace(center[0], center[1]);
                return {
                    id: geometry.id,
                    center,
                    adminLabel: place.label,
                    adminAddress: place.address,
                };
            } catch {
                return {
                    id: geometry.id,
                    center,
                    adminLabel: null,
                    adminAddress: null,
                };
            }
        }));

        return {
            entity,
            geometries: displayGeometries,
            featureCollection: relationGeometriesToFeatureCollection(geometries),
        };
    }));
}

function filterRelationGeometriesByEarliestStartTime(
    source: Record<string, RelationGeometry[]>
): Record<string, RelationGeometry[]> {
    const result: Record<string, RelationGeometry[]> = {};

    for (const [entityId, geometries] of Object.entries(source)) {
        const rows = (geometries || []).filter((geometry) => Boolean(geometry?.id && geometry.draw_geometry));
        if (!rows.length) {
            result[entityId] = [];
            continue;
        }

        const timedRows = rows.filter((geometry) => Number.isFinite(geometry.time_start));
        const candidateRows = timedRows.length ? timedRows : rows;
        const minStartTime = Math.min(...candidateRows.map((geometry) =>
            Number.isFinite(geometry.time_start) ? Number(geometry.time_start) : Number.POSITIVE_INFINITY
        ));

        result[entityId] = Number.isFinite(minStartTime)
            ? candidateRows.filter((geometry) => Number(geometry.time_start) === minStartTime)
            : candidateRows;
    }

    return result;
}

function relationGeometriesToFeatureCollection(geometries: RelationGeometry[]): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: geometries
            .filter((geometry) => Boolean(geometry?.id && geometry.draw_geometry))
            .map((geometry) => ({
                type: "Feature" as const,
                properties: {
                    id: geometry.id,
                    type: geometry.type,
                    time_start: geometry.time_start,
                    time_end: geometry.time_end,
                    bound_with: geometry.bound_with,
                },
                geometry: geometry.draw_geometry,
            })),
    };
}

function getFeatureCollectionMinTimeStart(fc: FeatureCollection): number | null {
    const values = fc.features
        .map((feature) => feature.properties.time_start)
        .filter((value): value is number => Number.isFinite(value));
    if (!values.length) return null;
    return Math.min(...values);
}

function getEntityPreferredTimeStart(entity: Entity | null, fallbackGeometries: FeatureCollection): number | null {
    if (Number.isFinite(entity?.time_start)) {
        return Number(entity?.time_start);
    }
    return getFeatureCollectionMinTimeStart(fallbackGeometries);
}

function findRelationWikiBySlug(source: Record<string, Wiki>, slug: string): Wiki | undefined {
    const direct = source[slug];
    if (direct) return direct;

    const target = normalizeWikiSlugForCompare(slug);
    if (!target) return undefined;
    return Object.entries(source).find(([key, wiki]) =>
        normalizeWikiSlugForCompare(key) === target ||
        normalizeWikiSlugForCompare(wiki.slug) === target
    )?.[1];
}

function findRelationEntityIdsByWikiSlug(source: Record<string, string[]>, slug: string): string[] {
    const direct = source[slug];
    if (direct?.length) return direct;

    const target = normalizeWikiSlugForCompare(slug);
    if (!target) return [];
    for (const [key, ids] of Object.entries(source)) {
        if (normalizeWikiSlugForCompare(key) === target) return ids;
    }
    return [];
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
