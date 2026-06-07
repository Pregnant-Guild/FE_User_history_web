"use client";

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { RefObject, Dispatch, SetStateAction } from "react";
import { type MapFeaturePayload, type MapHandle } from "@/uhm/components/Map";
import type { MapHoverPopupContent } from "@/uhm/components/map/useMapHoverPopup";
import PresentPlaceSearch, { type HistoricalGeometryFocusPayload, type PresentPlaceSelection } from "@/uhm/components/editor/PresentPlaceSearch";
import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import ReplayPreviewLayerPanel from "@/uhm/components/editor/ReplayPreviewLayerPanel";
import PublicWikiSidebar from "@/uhm/components/wiki/PublicWikiSidebar";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import RelatedEntityPopup from "./RelatedEntityPopup";
import WikiSelectionPanel from "./WikiSelectionPanel";
import { fitMapToFeatureCollection } from "@/uhm/components/map/mapUtils";

import { fetchWikiById, type Wiki } from "@/uhm/api/wikis";
import type { Entity } from "@/uhm/api/entities";
import type { FeatureCollection } from "@/uhm/types/geo";
import type { BattleReplay, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import { type BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { normalizeFeatureEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { PreviewRelationIndex } from "@/uhm/lib/preview/types";
import { isTimelineYearWithinEntityTimeRange } from "@/uhm/lib/utils/entityTime";
import type { Feature } from "@/uhm/lib/editor/state/useEditorState";
import type { ReplayPreviewController } from "@/uhm/lib/replay/useReplayPreview";

type Props = {
    projectId: string;
    mode: "preview" | "replay_preview";
    onModeChange: (mode: "preview" | "replay_preview") => void;
    onExitPreview: () => void;
    draft: FeatureCollection;
    replays: BattleReplay[];
    entities: Entity[];
    wikis: WikiSnapshot[];
    entityWikiLinks?: EntityWikiLinkSnapshot[];
    backgroundVisibility: BackgroundLayerVisibility;
    onBackgroundVisibilityChange: (vis: BackgroundLayerVisibility) => void;
    geometryVisibility: Record<string, boolean>;
    onGeometryVisibilityChange: (vis: Record<string, boolean>) => void;
    viewMode?: "local" | "global";
    onViewModeChange?: (mode: "local" | "global") => void;
    globalGeometries?: FeatureCollection;
    isGlobalLoading?: boolean;
    baseline?: FeatureCollection;
    activeReplay?: BattleReplay | null;
    selectedStageId?: number | null;
    selectedStepIndex?: number | null;
    autoplayMode?: "start" | "selection" | null;

    replayPreview: ReplayPreviewController;
    mapHandleRef?: RefObject<MapHandle | null>;
    previewRelations: PreviewRelationIndex;
    previewActiveEntityId: string | null;
    setPreviewActiveEntityId: (id: string | null) => void;
    previewEntityFocusToken?: number;
    setPreviewEntityFocusToken: Dispatch<SetStateAction<number>>;
    previewSidebarWidth: number;
    setPreviewSidebarWidth: Dispatch<SetStateAction<number>>;
    previewWikiCache: Record<string, Wiki>;
    setPreviewWikiCache: Dispatch<SetStateAction<Record<string, Wiki>>>;
    isLargeScreen?: boolean;
    setIsLargeScreen?: Dispatch<SetStateAction<boolean>>;
};

export type PreviewLayoutHandle = {
    handleFeatureClick: (payload: MapFeaturePayload | null) => void;
    getHoverPopupContent: (feature: Feature) => MapHoverPopupContent | null;
    handlePlaySelectedReplay: (replay: BattleReplay) => void;
};

const PreviewLayout = forwardRef<PreviewLayoutHandle, Props>(({
    projectId,
    mode,
    onModeChange,
    onExitPreview,
    wikis,
    backgroundVisibility,
    onBackgroundVisibilityChange,
    geometryVisibility,
    onGeometryVisibilityChange,
    activeReplay,
    autoplayMode = null,

    replayPreview,
    mapHandleRef,
    previewRelations,
    previewActiveEntityId,
    setPreviewActiveEntityId,
    setPreviewEntityFocusToken,
    previewSidebarWidth,
    setPreviewSidebarWidth,
    previewWikiCache,
    setPreviewWikiCache,
    isLargeScreen,
}: Props, ref) => {
    const isReplayPreviewMode = mode === "replay_preview";

    // State for local active replay (when played from standard preview click)
    const [localActiveReplay, setLocalActiveReplay] = useState<BattleReplay | null>(null);
    const currentActiveReplay = activeReplay !== undefined ? activeReplay : localActiveReplay;

    // Preview specific UI states
    const [previewWikiError, setPreviewWikiError] = useState<string | null>(null);
    const [isPreviewWikiLoading, setIsPreviewWikiLoading] = useState(false);
    const [previewWikiSelectionPanelAnchor, setPreviewWikiSelectionPanelAnchor] = useState<MapFeaturePayload | null>(null);
    const [previewRightPanelMode, setPreviewRightPanelMode] = useState<"wiki" | "selection" | null>(null);
    const [isPreviewEntitySidebarOpen, setIsPreviewEntitySidebarOpen] = useState(false);
    const [previewLinkEntityPopup, setPreviewLinkEntityPopup] = useState<{
        slug: string;
        entities: Entity[];
        top: number;
        left: number;
    } | null>(null);

    // Focused present place (for PresentPlaceSearch)
    const [focusedPresentPlace, setFocusedPresentPlace] = useState<PresentPlaceSelection | null>(null);

    // Clear preview states when currentActiveReplay or mode changes
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setPreviewWikiCache({});
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            setPreviewWikiSelectionPanelAnchor(null);
            setPreviewRightPanelMode(null);
            setPreviewActiveEntityId(null);
            setIsPreviewEntitySidebarOpen(false);
            setPreviewLinkEntityPopup(null);
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [currentActiveReplay, mode, setPreviewActiveEntityId, setPreviewWikiCache]);

    const autoplayedReplayIdRef = useRef<string | number | null>(null);

    // Autoplay replay on mount/session load
    useEffect(() => {
        if (!isReplayPreviewMode || !currentActiveReplay || !autoplayMode) {
            autoplayedReplayIdRef.current = null;
            return;
        }
        if (autoplayedReplayIdRef.current === currentActiveReplay.id) return;
        autoplayedReplayIdRef.current = currentActiveReplay.id;

        if (autoplayMode === "selection") {
            replayPreview.playFromSelection();
        } else {
            replayPreview.playFromStart();
        }
    }, [autoplayMode, isReplayPreviewMode, currentActiveReplay, replayPreview]);

    const {
        timelineYear: replayPreviewTimelineYear,
        resetPreview: resetReplayPreview,
        playbackSpeed: replayPreviewPlaybackSpeed,
        activeCursor: replayPreviewActiveCursor,
        activeWikiId: replayPreviewActiveWikiId,
        sidebarOpen: replayPreviewSidebarOpen,
        openWikiPanelById: openReplayPreviewWikiPanelById,
        closeWikiPanel: closeReplayPreviewWikiPanel,
    } = replayPreview;

    // Timeline bar parameters
    const activeTimelineYear = isReplayPreviewMode ? replayPreviewTimelineYear : replayPreviewTimelineYear;

    // Timeline bar visibility
    const timelineBarVisible = !isReplayPreviewMode || replayPreview.timelineVisible;

    // Replay step active label
    const replayPreviewActiveStepLabel = useMemo(() => {
        if (
            replayPreviewActiveCursor.stageId == null ||
            replayPreviewActiveCursor.stepIndex == null
        ) {
            return null;
        }
        return `Stage #${replayPreviewActiveCursor.stageId} · Step ${replayPreviewActiveCursor.stepIndex + 1}`;
    }, [replayPreviewActiveCursor.stageId, replayPreviewActiveCursor.stepIndex]);

    // Active wiki snapshot
    const replayPreviewActiveWikiSnapshot = useMemo(() => {
        if (!replayPreviewActiveWikiId) return null;
        return wikis.find((item) => item.id === replayPreviewActiveWikiId) || null;
    }, [replayPreviewActiveWikiId, wikis]);

    // Load active wiki content if needed
    useEffect(() => {
        if (!mode || !replayPreviewSidebarOpen) {
            const timeoutId = window.setTimeout(() => {
                setPreviewWikiError(null);
                setIsPreviewWikiLoading(false);
            }, 0);
            return () => window.clearTimeout(timeoutId);
        }

        const setWikiIdle = (error: string | null = null) => {
            const timeoutId = window.setTimeout(() => {
                setPreviewWikiError(error);
                setIsPreviewWikiLoading(false);
            }, 0);
            return () => window.clearTimeout(timeoutId);
        };

        const setWikiLoading = () => {
            const timeoutId = window.setTimeout(() => {
                setPreviewWikiError(null);
                setIsPreviewWikiLoading(true);
            }, 0);
            return () => window.clearTimeout(timeoutId);
        };

        let pendingStateCleanup: (() => void) | null = null;
        const cleanupPendingState = () => {
            pendingStateCleanup?.();
            pendingStateCleanup = null;
        };

        const scheduleWikiIdle = (error: string | null = null) => {
            cleanupPendingState();
            pendingStateCleanup = setWikiIdle(error);
        };

        const scheduleWikiLoading = () => {
            cleanupPendingState();
            pendingStateCleanup = setWikiLoading();
        };

        const cleanupEffect = () => {
            cleanupPendingState();
        };

        const activeWikiId = String(replayPreviewActiveWikiId || "").trim();
        if (!activeWikiId.length) {
            scheduleWikiIdle();
            return cleanupEffect;
        }

        const localWiki = wikis.find((item) => item.id === activeWikiId) || null;
        if (!localWiki) {
            scheduleWikiIdle("Không tìm thấy wiki trong snapshot preview.");
            return cleanupEffect;
        }

        if (typeof localWiki.doc === "string") {
            scheduleWikiIdle();
            return cleanupEffect;
        }

        if (previewWikiCache[activeWikiId]) {
            scheduleWikiIdle();
            return cleanupEffect;
        }

        let disposed = false;
        scheduleWikiLoading();
        void fetchWikiById(activeWikiId)
            .then((row) => {
                if (disposed) return;
                setPreviewWikiCache((prev) => ({ ...prev, [activeWikiId]: row }));
            })
            .catch((err) => {
                if (disposed) return;
                setPreviewWikiError(err instanceof Error ? err.message : "Không tải được wiki preview.");
            })
            .finally(() => {
                if (!disposed) {
                    setIsPreviewWikiLoading(false);
                }
            });

        return () => {
            disposed = true;
            cleanupEffect();
        };
    }, [
        mode,
        previewWikiCache,
        replayPreviewActiveWikiId,
        replayPreviewSidebarOpen,
        setPreviewWikiCache,
        wikis,
    ]);

    // Active wiki fully built
    const replayPreviewActiveWiki = useMemo<Wiki | null>(() => {
        const snapshotWiki = replayPreviewActiveWikiSnapshot;
        if (!snapshotWiki) return null;
        if (typeof snapshotWiki.doc === "string") {
            return {
                id: snapshotWiki.id,
                project_id: projectId,
                title: snapshotWiki.title,
                slug: snapshotWiki.slug ?? null,
                content: snapshotWiki.doc || "",
            };
        }
        return previewWikiCache[snapshotWiki.id] || null;
    }, [previewWikiCache, projectId, replayPreviewActiveWikiSnapshot]);

    // Active entity
    const replayPreviewActiveEntityId = useMemo(() => {
        const activeWikiEntityIds = replayPreviewActiveWikiId
            ? previewRelations.wikiEntityIdsById[String(replayPreviewActiveWikiId)] || []
            : [];

        if (
            previewActiveEntityId &&
            (!activeWikiEntityIds.length || activeWikiEntityIds.includes(previewActiveEntityId))
        ) {
            return previewActiveEntityId;
        }

        return activeWikiEntityIds[0] || previewActiveEntityId;
    }, [previewActiveEntityId, previewRelations.wikiEntityIdsById, replayPreviewActiveWikiId]);

    const replayPreviewActiveEntity = replayPreviewActiveEntityId
        ? previewRelations.entitiesById[replayPreviewActiveEntityId] || null
        : null;


    const isPreviewWikiChooserOpen = previewRightPanelMode === "selection" && Boolean(previewWikiSelectionPanelAnchor);
    const isReplayPreviewWikiSidebarOpen = mode && !isPreviewWikiChooserOpen && (replayPreviewSidebarOpen || isPreviewEntitySidebarOpen);
    const isReplayPreviewRightPanelOpen = isReplayPreviewWikiSidebarOpen || isPreviewWikiChooserOpen;

    // Handle replay preview entity selection
    const selectReplayPreviewEntity = useCallback((
        entityId: string,
        options?: {
            sourceFeatureId?: string | number | null;
            preferredWikiId?: string | null;
            preferredWikiSlug?: string | null;
            focusMap?: boolean;
            selectGeometry?: boolean;
        }
    ) => {
        const id = String(entityId || "").trim();
        const entity = previewRelations.entitiesById[id] || null;
        if (!entity) return;

        const linkedWikis = previewRelations.entityWikisById[id] || [];
        const preferredWikiId = String(options?.preferredWikiId || "").trim();
        const preferredWikiSlug = String(options?.preferredWikiSlug || "").trim();
        const nextWiki =
            linkedWikis.find((wiki) => preferredWikiId && wiki.id === preferredWikiId) ||
            linkedWikis.find((wiki) => preferredWikiSlug && String(wiki.slug || "").trim() === preferredWikiSlug) ||
            linkedWikis[0] ||
            null;

        setPreviewActiveEntityId(id);
        setIsPreviewEntitySidebarOpen(true);
        setPreviewRightPanelMode("wiki");
        setPreviewWikiError(null);
        setPreviewWikiSelectionPanelAnchor(null);
        setPreviewLinkEntityPopup(null);

        if (options?.focusMap === true) {
            setPreviewEntityFocusToken((prev) => (prev ?? 0) + 1);
        }
        if (nextWiki) {
            openReplayPreviewWikiPanelById(nextWiki.id);
        }
    }, [
        openReplayPreviewWikiPanelById,
        previewRelations.entitiesById,
        previewRelations.entityWikisById,
        setPreviewActiveEntityId,
        setPreviewEntityFocusToken,
    ]);

    // Handle close sidebar
    const closeReplayPreviewSidebar = useCallback(() => {
        closeReplayPreviewWikiPanel();
        setPreviewActiveEntityId(null);
        setIsPreviewEntitySidebarOpen(false);
        setPreviewRightPanelMode(null);
        setPreviewWikiError(null);
        setPreviewLinkEntityPopup(null);
    }, [closeReplayPreviewWikiPanel, setPreviewActiveEntityId]);

    // Play selected battle replay
    const handlePlaySelectedReplay = useCallback((replay: BattleReplay) => {
        setLocalActiveReplay(replay);
        onModeChange("replay_preview");
    }, [onModeChange]);

    // Exit Replay Preview mode
    const handleExitReplayPreview = useCallback(() => {
        resetReplayPreview();
        if (activeReplay !== undefined) {
            // Started directly from parent
            onExitPreview();
        } else {
            // Started locally
            setLocalActiveReplay(null);
            onModeChange("preview");
        }
    }, [activeReplay, onExitPreview, onModeChange, resetReplayPreview]);

    // Map feature click handler
    const handlePreviewMapFeatureClick = useCallback((payload: MapFeaturePayload | null) => {
        setPreviewLinkEntityPopup(null);

        if (!payload) {
            setPreviewWikiSelectionPanelAnchor(null);
            setPreviewRightPanelMode(null);
            return;
        }

        const entityIds = previewRelations.geometryEntityIds[String(payload.featureId)] || [];
        const rows = entityIds.flatMap((entityId) => {
            const entity = previewRelations.entitiesById[entityId] || null;
            if (!entity) return [];

            const linkedWikis = previewRelations.entityWikisById[entity.id] || [];
            return linkedWikis.map((wiki) => ({ entity, wiki }));
        });

        if (!rows.length) {
            setPreviewWikiSelectionPanelAnchor(null);
            setPreviewRightPanelMode(null);
            return;
        }

        if (rows.length === 1) {
            const row = rows[0];
            selectReplayPreviewEntity(row.entity.id, {
                sourceFeatureId: payload.featureId,
                preferredWikiId: row.wiki.id,
                focusMap: false,
                selectGeometry: false,
            });
            setPreviewWikiSelectionPanelAnchor(null);
            setPreviewRightPanelMode("wiki");
            return;
        }

        closeReplayPreviewWikiPanel();
        setPreviewActiveEntityId(null);
        setIsPreviewEntitySidebarOpen(false);
        setPreviewWikiError(null);
        setPreviewWikiSelectionPanelAnchor(payload);
        setPreviewRightPanelMode("selection");
    }, [
        closeReplayPreviewWikiPanel,
        previewRelations.entitiesById,
        previewRelations.entityWikisById,
        previewRelations.geometryEntityIds,
        selectReplayPreviewEntity,
        setPreviewActiveEntityId,
    ]);

    // Hover popup content provider
    const getPreviewHoverPopupContent = useCallback((feature: Feature) => {
        const entityIds = normalizeFeatureEntityIds(feature);
        const sourceFeatureId = (feature as { id?: string | number }).id ?? null;
        const entitiesForFeature = entityIds
            .map((entityId) => previewRelations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));
        if (!entitiesForFeature.length) return null;

        type GroupedHoverRow = MapHoverPopupContent["rows"][number] & { isTimelineMatch: boolean };
        const groupedRows: GroupedHoverRow[] = entitiesForFeature.flatMap((entity): GroupedHoverRow[] => {
            const title = entity.name || String(entity.id);
            const isTimelineMatch = isTimelineYearWithinEntityTimeRange(
                activeTimelineYear,
                entity.time_start,
                entity.time_end
            );
            const linkedWikis = previewRelations.entityWikisById[entity.id] || [];
            const entityHeaderRow = {
                title,
                description: entity.description,
                isGroupHeader: true,
                isTimelineMatch,
            };

            if (!linkedWikis.length) {
                return [entityHeaderRow, {
                    title: "(chưa có wiki)",
                    titleTone: "danger",
                    isTimelineMatch,
                    quoteTone: "danger",
                }];
            }

            return [
                entityHeaderRow,
                ...linkedWikis.map((wiki) => ({
                    title: getWikiHoverTitle(wiki, title),
                    isTimelineMatch,
                    quote: extractWikiBlockquoteText(wiki.content),
                    onClick: () => selectReplayPreviewEntity(entity.id, {
                        sourceFeatureId,
                        preferredWikiId: wiki.id,
                        focusMap: false,
                        selectGeometry: false,
                    }),
                })),
            ];
        });
        const timelineMatchedRows = groupedRows.filter((row) => row.isTimelineMatch);
        const otherRows = groupedRows.filter((row) => !row.isTimelineMatch);
        const stripGroupFlag = ({ isTimelineMatch: _isTimelineMatch, ...row }: GroupedHoverRow) => row;

        return {
            key: `${activeTimelineYear}:${groupedRows.map((row) => `${row.title}:${row.description || ""}:${row.isTimelineMatch ? "in" : "out"}`).join("|")}`,
            rows: [
                ...timelineMatchedRows.map(stripGroupFlag),
                ...otherRows.map((row, index) => ({
                    ...stripGroupFlag(row),
                    separatorBefore: index === 0 && timelineMatchedRows.length > 0,
                })),
            ],
        };
    }, [activeTimelineYear, previewRelations.entitiesById, previewRelations.entityWikisById, selectReplayPreviewEntity]);

    // Wiki inner links click handler
    const handleReplayPreviewWikiLinkRequest = useCallback(({ slug, rect }: { slug: string; rect: DOMRect }) => {
        const nextSlug = String(slug || "").trim();
        if (!nextSlug.length) return;
        
        const localWiki = wikis.find((item) => String(item.slug || "").trim() === nextSlug) || null;
        if (!localWiki) {
            setPreviewWikiError(`Wiki /wiki/${nextSlug} không có trong snapshot preview.`);
            return;
        }

        const linkedEntityIds = previewRelations.wikiEntityIdsBySlug[nextSlug] || [];
        const linkedEntities = linkedEntityIds
            .map((entityId) => previewRelations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));

        if (linkedEntities.length === 1) {
            selectReplayPreviewEntity(linkedEntities[0].id, {
                preferredWikiId: localWiki.id,
                focusMap: false,
            });
            return;
        }

        if (!linkedEntities.length) return;

        const popupWidth = 240;
        const popupHeight = Math.min(240, linkedEntities.length * 44 + 20);
        const { top, left } = computeFixedPopupPosition(rect, popupWidth, popupHeight);

        setPreviewLinkEntityPopup({
            slug: nextSlug,
            entities: linkedEntities,
            top,
            left,
        });
    }, [
        previewRelations.entitiesById,
        previewRelations.wikiEntityIdsBySlug,
        selectReplayPreviewEntity,
        wikis,
    ]);



    // Search and focus place
    const handleFocusPresentPlace = useCallback((place: PresentPlaceSelection) => {
        setFocusedPresentPlace(place);
        const map = mapHandleRef?.current?.getMap();
        if (map) {
            const currentZoom = map.getZoom();
            map.flyTo({
                center: [place.lng, place.lat],
                zoom: Math.max(currentZoom, 13.5),
            });
        }
    }, [mapHandleRef]);

    const clearPresentPlaceFocus = useCallback(() => {
        setFocusedPresentPlace(null);
    }, []);

    const handleFocusHistoricalGeometry = useCallback((payload: HistoricalGeometryFocusPayload) => {
        setFocusedPresentPlace(null);
        setPreviewEntityFocusToken((prev) => (prev ?? 0) + 1);

        const map = mapHandleRef?.current?.getMap();
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
            fitMapToFeatureCollection(map, fc, 84, { duration: 1000 });
        }

        const linkedEntityIds = previewRelations.geometryEntityIds[String(payload.geometry.id)] || [];
        if (linkedEntityIds.length === 1) {
            selectReplayPreviewEntity(linkedEntityIds[0], {
                sourceFeatureId: payload.geometry.id,
                focusMap: false,
                selectGeometry: false,
            });
        }
    }, [mapHandleRef, previewRelations.geometryEntityIds, selectReplayPreviewEntity, setPreviewEntityFocusToken]);

    const handleFocusWiki = useCallback((wiki: Wiki) => {
        setFocusedPresentPlace(null);

        const entityIds = previewRelations.wikiEntityIdsById[wiki.id] || [];
        if (entityIds.length > 0) {
            selectReplayPreviewEntity(entityIds[0], {
                preferredWikiId: wiki.id,
                focusMap: true,
            });

            // Focus geometries if any
            const geometries = previewRelations.entityGeometriesById[entityIds[0]];
            const map = mapHandleRef?.current?.getMap();
            if (map && geometries && geometries.features.length > 0) {
                fitMapToFeatureCollection(map, geometries, 84, { duration: 1000 });
            }
        } else {
            // Direct wiki select without entity
            setPreviewActiveEntityId(null);
            setIsPreviewEntitySidebarOpen(true);
            setPreviewWikiError(null);
            setPreviewWikiSelectionPanelAnchor(null);
            setPreviewLinkEntityPopup(null);
            openReplayPreviewWikiPanelById(wiki.id);
        }
    }, [previewRelations, selectReplayPreviewEntity, setPreviewActiveEntityId, openReplayPreviewWikiPanelById, mapHandleRef]);

    const effectiveGeometryVisibility = useMemo(() => {
        return geometryVisibility;
    }, [geometryVisibility]);

    const computedTimelineStyle = useMemo(() => {
        const rightMargin = (isReplayPreviewRightPanelOpen && isLargeScreen)
            ? previewSidebarWidth + 32
            : 18;
        return {
            left: "88px",
            right: `${rightMargin}px`,
            transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        };
    }, [isReplayPreviewRightPanelOpen, isLargeScreen, previewSidebarWidth]);



    // WikiSelectionPanel rows
    const previewWikiSelectionPanelRows = useMemo(() => {
        if (!previewWikiSelectionPanelAnchor) return [];

        const entityIds = previewRelations.geometryEntityIds[String(previewWikiSelectionPanelAnchor.featureId)] || [];
        return entityIds.flatMap((entityId) => {
            const entity = previewRelations.entitiesById[entityId] || null;
            if (!entity) return [];

            const linkedWikis = previewRelations.entityWikisById[entity.id] || [];
            return linkedWikis.map((wiki) => ({
                entity,
                wiki,
                quote: cleanWikiPreviewQuote(wiki.preview_quote) || extractWikiBlockquoteText(wiki.content),
            }));
        });
    }, [previewWikiSelectionPanelAnchor, previewRelations]);

    useImperativeHandle(ref, () => ({
        handleFeatureClick: handlePreviewMapFeatureClick,
        getHoverPopupContent: getPreviewHoverPopupContent,
        handlePlaySelectedReplay,
    }), [handlePreviewMapFeatureClick, getPreviewHoverPopupContent, handlePlaySelectedReplay]);

    return (
        <>

            <PresentPlaceSearch
                focusedPlace={focusedPresentPlace}
                onFocusPlace={handleFocusPresentPlace}
                onFocusHistoricalGeometry={handleFocusHistoricalGeometry}
                onFocusWiki={handleFocusWiki}
                onClearFocus={clearPresentPlaceFocus}
            />

            {isReplayPreviewMode ? (
                <ReplayPreviewOverlay
                    isPreviewMode={true}
                    isPlaying={replayPreview.isPlaying}
                    dialog={replayPreview.dialog}
                    toasts={replayPreview.toasts}
                    sidebarOpen={isReplayPreviewWikiSidebarOpen}
                    sidebarWidth={previewSidebarWidth}
                    playbackSpeed={replayPreviewPlaybackSpeed}
                    activeStepLabel={replayPreviewActiveStepLabel}
                    activeStepNumber={replayPreview.activeStepNumber}
                    totalSteps={replayPreview.totalSteps}
                    onPlayPreview={replayPreview.playFromStart}
                    onStopPreview={replayPreview.stopPreview}
                    onResetPreview={replayPreview.resetPreview}
                    onExitPreview={handleExitReplayPreview}
                />
            ) : null}

            {isReplayPreviewWikiSidebarOpen ? (
                <aside
                    style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        bottom: 16,
                        left: isLargeScreen ? "auto" : 16,
                        width: isLargeScreen ? `min(${previewSidebarWidth}px, calc(100vw - 2rem))` : "auto",
                        maxWidth: "calc(100vw - 2rem)",
                        zIndex: 20,
                    }}
                >
                    <PublicWikiSidebar
                        entity={replayPreviewActiveEntity}
                        wiki={replayPreviewActiveWiki}
                        isLoading={isPreviewWikiLoading}
                        error={
                            replayPreview.activeWikiId || replayPreviewActiveEntity
                                ? previewWikiError
                                : "Chưa có wiki được chọn trong step này."
                        }
                        onClose={closeReplayPreviewSidebar}
                        onWikiLinkRequest={handleReplayPreviewWikiLinkRequest}
                        sidebarWidth={previewSidebarWidth}
                        onSidebarWidthChange={setPreviewSidebarWidth}
                        maxDragWidth={typeof window !== "undefined" ? Math.min(800, window.innerWidth - 340) : 800}
                        compactHeader
                    />
                </aside>
            ) : null}

            {isPreviewWikiChooserOpen ? (
                <aside
                    style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        bottom: 16,
                        left: isLargeScreen ? "auto" : 16,
                        width: isLargeScreen ? `min(${previewSidebarWidth}px, calc(100vw - 2rem))` : "auto",
                        maxWidth: "calc(100vw - 2rem)",
                        zIndex: 20,
                    }}
                >
                    <WikiSelectionPanel
                        rows={previewWikiSelectionPanelRows}
                        onClose={() => {
                            setPreviewWikiSelectionPanelAnchor(null);
                            setPreviewRightPanelMode(null);
                        }}
                        onSelectRow={(entityId, wikiId) => {
                            setPreviewWikiSelectionPanelAnchor(null);
                            setPreviewRightPanelMode("wiki");
                            selectReplayPreviewEntity(entityId, {
                                sourceFeatureId: previewWikiSelectionPanelAnchor?.featureId,
                                preferredWikiId: wikiId,
                                focusMap: false,
                                selectGeometry: false,
                            });
                        }}
                    />
                </aside>
            ) : null}

            <aside
                style={{
                    position: "absolute",
                    top: 80,
                    bottom: 20,
                    left: 18,
                    zIndex: 16,
                    display: "flex",
                    flexDirection: "column",
                    width: 58,
                    pointerEvents: "none",
                }}
            >
                <div
                    style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                        pointerEvents: "auto",
                    }}
                >
                    <ReplayPreviewLayerPanel
                        backgroundVisibility={backgroundVisibility}
                        geometryVisibility={effectiveGeometryVisibility}
                        onToggleBackground={(id) =>
                            onBackgroundVisibilityChange({
                                ...backgroundVisibility,
                                [id]: !backgroundVisibility[id],
                            })
                        }
                        onToggleGeometry={(typeKey) =>
                            onGeometryVisibilityChange({
                                ...geometryVisibility,
                                [typeKey]: geometryVisibility[typeKey] === false,
                            })
                        }
                    />
                </div>
            </aside>

            {timelineBarVisible ? (
                <TimelineBar
                    year={activeTimelineYear}
                    onYearChange={(year) => {
                        // Standard timeline bar year change
                        replayPreview.setTimelineYear(year);
                    }}
                    timeRange={0}
                    onTimeRangeChange={() => {}}
                    isLoading={false}
                    disabled={isReplayPreviewMode}
                    statusText={null}
                    filterEnabled={replayPreview.timelineFilterEnabled}
                    onFilterEnabledChange={replayPreview.setTimelineFilterEnabled}
                    style={computedTimelineStyle}
                />
            ) : null}

            {previewLinkEntityPopup ? (
                <RelatedEntityPopup
                    slug={previewLinkEntityPopup.slug}
                    entities={previewLinkEntityPopup.entities}
                    top={previewLinkEntityPopup.top}
                    left={previewLinkEntityPopup.left}
                    onClose={() => setPreviewLinkEntityPopup(null)}
                    onSelectEntity={(entityId) => {
                        selectReplayPreviewEntity(entityId, {
                            preferredWikiSlug: previewLinkEntityPopup.slug,
                            focusMap: false,
                        });
                        setPreviewLinkEntityPopup(null);
                    }}
                />
            ) : null}
        </>
    );
});

PreviewLayout.displayName = "PreviewLayout";

export default PreviewLayout;

// ==========================================
// Helper functions
// ==========================================

function extractWikiBlockquoteText(content: string | null | undefined): string {
    if (!content) return "";

    const decoded = decodeHtmlEntities(content);
    const blockquoteMatch = decoded.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    const rawText = blockquoteMatch?.[1]?.trim() || "";
    if (!rawText) return "";

    return cleanWikiPlainText(rawText);
}

function cleanWikiPreviewQuote(raw: string | null | undefined): string {
    const decoded = decodeHtmlEntities(String(raw || ""));
    const blockquote = extractWikiBlockquoteText(decoded);
    return cleanWikiPlainText(blockquote || decoded);
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

function getWikiHoverTitle(wiki: { title?: string | null } | null | undefined, fallbackTitle: string): string {
    return String(wiki?.title || "").trim() || fallbackTitle;
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

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
