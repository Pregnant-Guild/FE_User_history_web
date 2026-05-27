"use client";

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import EditorMap, { type MapFeaturePayload, type MapHandle } from "@/uhm/components/Map";
import PresentPlaceSearch, { type HistoricalGeometryFocusPayload, type PresentPlaceSelection } from "@/uhm/components/editor/PresentPlaceSearch";
import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import ReplayPreviewLayerPanel from "@/uhm/components/editor/ReplayPreviewLayerPanel";
import PublicWikiSidebar from "@/uhm/components/wiki/PublicWikiSidebar";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import { useReplayPreview } from "@/uhm/lib/replay/useReplayPreview";
import RelatedEntityPopup from "./RelatedEntityPopup";
import PinnedWikiPopup from "./PinnedWikiPopup";

import { fetchWikiById, type Wiki } from "@/uhm/api/wikis";
import type { Entity } from "@/uhm/api/entities";
import type { Feature, FeatureCollection } from "@/uhm/types/geo";
import type { BattleReplay, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import { type BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { persistBackgroundLayerVisibility } from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import {
    clampNumber,
    isFeatureVisibleAtYear,
} from "@/uhm/lib/editor/editorPageUtils";
import { normalizeFeatureEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import { normalizeTimelineYearValue } from "@/uhm/lib/utils/timeline";
import { deepClone } from "@/uhm/lib/editor/draft/draftDiff";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

type Props = {
    projectId: string;
    mode: "preview" | "replay_preview";
    onModeChange: (mode: "preview" | "replay_preview") => void;
    onExitPreview: () => void;
    draft: FeatureCollection;
    replays: BattleReplay[];
    entities: Entity[];
    wikis: WikiSnapshot[];
    entityWikiLinks: EntityWikiLinkSnapshot[];
    backgroundVisibility: BackgroundLayerVisibility;
    onBackgroundVisibilityChange: (vis: BackgroundLayerVisibility) => void;
    geometryVisibility: Record<string, boolean>;
    onGeometryVisibilityChange: (vis: Record<string, boolean>) => void;
    viewMode: "local" | "global";
    onViewModeChange?: (mode: "local" | "global") => void;
    globalGeometries?: FeatureCollection;
    isGlobalLoading?: boolean;
    baseline?: FeatureCollection;
    activeReplay?: BattleReplay | null;
    selectedStageId?: number | null;
    selectedStepIndex?: number | null;
    autoplayMode?: "start" | "selection" | null;

    replayPreview: any;
    mapHandleRef: React.RefObject<MapHandle | null>;
    previewRelations: PreviewRelationIndex;
    previewActiveEntityId: string | null;
    setPreviewActiveEntityId: (id: string | null) => void;
    previewEntityFocusToken: number;
    setPreviewEntityFocusToken: React.Dispatch<React.SetStateAction<number>>;
    previewSidebarWidth: number;
    setPreviewSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
    isLargeScreen: boolean;
    setIsLargeScreen: (isLarge: boolean) => void;
    previewWikiCache: Record<string, Wiki>;
    setPreviewWikiCache: React.Dispatch<React.SetStateAction<Record<string, Wiki>>>;
};

type PreviewRelationIndex = {
    entitiesById: Record<string, Entity>;
    entityGeometriesById: Record<string, FeatureCollection>;
    entityWikisById: Record<string, Wiki[]>;
    geometryEntityIds: Record<string, string[]>;
    wikiEntityIdsById: Record<string, string[]>;
    wikiEntityIdsBySlug: Record<string, string[]>;
    wikiById: Record<string, Wiki>;
    wikiBySlug: Record<string, Wiki>;
};

const PreviewLayout = forwardRef<any, Props>(({
    projectId,
    mode,
    onModeChange,
    onExitPreview,
    draft,
    replays,
    entities,
    wikis,
    entityWikiLinks,
    backgroundVisibility,
    onBackgroundVisibilityChange,
    geometryVisibility,
    onGeometryVisibilityChange,
    viewMode,
    onViewModeChange,
    globalGeometries = EMPTY_FEATURE_COLLECTION,
    isGlobalLoading = false,
    baseline = EMPTY_FEATURE_COLLECTION,
    activeReplay,
    selectedStageId = null,
    selectedStepIndex = null,
    autoplayMode = null,

    replayPreview,
    mapHandleRef,
    previewRelations,
    previewActiveEntityId,
    setPreviewActiveEntityId,
    previewEntityFocusToken,
    setPreviewEntityFocusToken,
    previewSidebarWidth,
    setPreviewSidebarWidth,
    isLargeScreen,
    setIsLargeScreen,
    previewWikiCache,
    setPreviewWikiCache,
}: Props, ref) => {
    const isReplayPreviewMode = mode === "replay_preview";

    // State for local active replay (when played from standard preview click)
    const [localActiveReplay, setLocalActiveReplay] = useState<BattleReplay | null>(null);
    const currentActiveReplay = activeReplay !== undefined ? activeReplay : localActiveReplay;

    // Preview specific UI states
    const [previewWikiError, setPreviewWikiError] = useState<string | null>(null);
    const [isPreviewWikiLoading, setIsPreviewWikiLoading] = useState(false);
    const [previewPinnedWikiPopupAnchor, setPreviewPinnedWikiPopupAnchor] = useState<MapFeaturePayload | null>(null);
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
        setPreviewWikiCache({});
        setPreviewWikiError(null);
        setIsPreviewWikiLoading(false);
        setPreviewPinnedWikiPopupAnchor(null);
        setPreviewActiveEntityId(null);
        setIsPreviewEntitySidebarOpen(false);
        setPreviewLinkEntityPopup(null);
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
        hiddenGeometryIds: replayPreviewHiddenGeometryIds,
        timelineYear: replayPreviewTimelineYear,
        timelineFilterEnabled: replayPreviewTimelineFilterEnabled,
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
    const activeTimelineFilterEnabled = isReplayPreviewMode ? replayPreviewTimelineFilterEnabled : true;

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
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        const activeWikiId = String(replayPreviewActiveWikiId || "").trim();
        if (!activeWikiId.length) {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        const localWiki = wikis.find((item) => item.id === activeWikiId) || null;
        if (!localWiki) {
            setPreviewWikiError("Không tìm thấy wiki trong snapshot preview.");
            setIsPreviewWikiLoading(false);
            return;
        }

        if (typeof localWiki.doc === "string") {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        if (previewWikiCache[activeWikiId]) {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        let disposed = false;
        setPreviewWikiError(null);
        setIsPreviewWikiLoading(true);
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
        };
    }, [
        mode,
        previewWikiCache,
        replayPreviewActiveWikiId,
        replayPreviewSidebarOpen,
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

    const replayPreviewActiveEntityGeometries = replayPreviewActiveEntityId
        ? previewRelations.entityGeometriesById[replayPreviewActiveEntityId] || EMPTY_FEATURE_COLLECTION
        : EMPTY_FEATURE_COLLECTION;

    const isReplayPreviewWikiSidebarOpen = mode && (replayPreviewSidebarOpen || isPreviewEntitySidebarOpen);

    // Selected feature ids
    const [selectedFeatureIds, setSelectedFeatureIds] = useState<(string | number)[]>([]);

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
        setPreviewWikiError(null);
        setPreviewPinnedWikiPopupAnchor(null);
        setPreviewLinkEntityPopup(null);

        if (options?.focusMap === true) {
            setPreviewEntityFocusToken((prev) => (prev ?? 0) + 1);
        }
        if (options?.selectGeometry && options.sourceFeatureId != null) {
            setSelectedFeatureIds([options.sourceFeatureId]);
        }
        if (nextWiki) {
            openReplayPreviewWikiPanelById(nextWiki.id);
        }
    }, [
        openReplayPreviewWikiPanelById,
        previewRelations.entitiesById,
        previewRelations.entityWikisById,
        setSelectedFeatureIds,
    ]);

    // Handle close sidebar
    const closeReplayPreviewSidebar = useCallback(() => {
        closeReplayPreviewWikiPanel();
        setPreviewActiveEntityId(null);
        setIsPreviewEntitySidebarOpen(false);
        setPreviewWikiError(null);
        setPreviewLinkEntityPopup(null);
        setSelectedFeatureIds([]);
    }, [closeReplayPreviewWikiPanel, setSelectedFeatureIds]);

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
            setPreviewPinnedWikiPopupAnchor(null);
            return;
        }

        const entityIds = previewRelations.geometryEntityIds[String(payload.featureId)] || [];
        const rows = entityIds.flatMap((entityId) => {
            const entity = previewRelations.entitiesById[entityId] || null;
            if (!entity) return [];

            const linkedWikis = previewRelations.entityWikisById[entity.id] || [];
            if (!linkedWikis.length) {
                return [{ entity, wiki: null as Wiki | null }];
            }

            return linkedWikis.map((wiki) => ({ entity, wiki }));
        });

        if (!rows.length) {
            setPreviewPinnedWikiPopupAnchor(null);
            return;
        }

        if (rows.length === 1) {
            const row = rows[0];
            selectReplayPreviewEntity(row.entity.id, {
                sourceFeatureId: payload.featureId,
                preferredWikiId: row.wiki?.id,
                focusMap: false,
                selectGeometry: false,
            });
            setPreviewPinnedWikiPopupAnchor(null);
            return;
        }

        setPreviewPinnedWikiPopupAnchor(payload);
    }, [
        previewRelations.entitiesById,
        previewRelations.entityWikisById,
        previewRelations.geometryEntityIds,
        selectReplayPreviewEntity,
    ]);

    // Hover popup content provider
    const getPreviewHoverPopupContent = useCallback((feature: Feature) => {
        const entityIds = normalizeFeatureEntityIds(feature);
        const entitiesForFeature = entityIds
            .map((entityId) => previewRelations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));
        if (!entitiesForFeature.length) return null;

        return {
            rows: entitiesForFeature.flatMap((entity) => {
                const linkedWikis = previewRelations.entityWikisById[entity.id] || [];
                if (!linkedWikis.length) {
                    return [{ title: entity.name || String(entity.id), quote: "" }];
                }

                return linkedWikis.map((wiki) => ({
                    title: entity.name || String(entity.id),
                    quote: extractWikiBlockquoteText(wiki.content),
                }));
            }),
        };
    }, [previewRelations.entitiesById, previewRelations.entityWikisById]);

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

    // Render Draft geometries builder
    const replayPreviewDraft = useMemo(() => {
        const sourceDraft = draft;
        if (!isReplayPreviewMode || replayPreviewHiddenGeometryIds.length === 0) {
            return sourceDraft;
        }
        const hiddenIds = new Set(replayPreviewHiddenGeometryIds);
        return {
            ...sourceDraft,
            features: sourceDraft.features.filter(
                (feature) => !hiddenIds.has(String(feature.properties.id))
            ),
        };
    }, [isReplayPreviewMode, draft, replayPreviewHiddenGeometryIds]);

    const mapRenderDraft = useMemo(() => {
        if (isReplayPreviewMode) {
            return replayPreviewDraft;
        }

        const sourceDraft = draft;
        if (!activeTimelineFilterEnabled) {
            return sourceDraft;
        }

        return {
            ...sourceDraft,
            features: sourceDraft.features.filter((feature) =>
                isFeatureVisibleAtYear(feature, activeTimelineYear)
            ),
        };
    }, [
        activeTimelineFilterEnabled,
        activeTimelineYear,
        draft,
        isReplayPreviewMode,
        replayPreviewDraft,
    ]);

    // Build label context
    const labelContextBaseDraft = useMemo(() => {
        if (viewMode === "local") {
            return draft;
        }

        const localFeatureIds = new Set<string>();
        for (const f of draft.features) {
            if (f.properties?.id != null) {
                localFeatureIds.add(String(f.properties.id));
            }
        }
        if (baseline && baseline.features) {
            for (const f of baseline.features) {
                if (f.properties?.id != null) {
                    localFeatureIds.add(String(f.properties.id));
                }
            }
        }

        const mergedFeatures = [...draft.features];
        for (const globalFeature of globalGeometries.features) {
            const globalId = globalFeature.properties?.id != null ? String(globalFeature.properties.id) : null;
            if (globalId === null || !localFeatureIds.has(globalId)) {
                mergedFeatures.push(globalFeature);
            }
        }

        return {
            ...draft,
            features: mergedFeatures,
        };
    }, [viewMode, draft, baseline, globalGeometries.features]);

    const mapLabelContextDraft = useMemo(() => {
        return buildEntityLabelContextDraft(labelContextBaseDraft, entities);
    }, [entities, labelContextBaseDraft]);

    // Replay matching the selected feature
    const viewerPreviewSelectedReplay = useMemo(() => {
        if (isReplayPreviewMode || !selectedFeatureIds.length) return null;
        const selectedGeometryId = String(selectedFeatureIds[0] ?? "").trim();
        if (!selectedGeometryId.length) return null;
        return replays.find(
            (r) =>
                String(r?.geometry_id || "").trim() === selectedGeometryId &&
                hasPlayableReplaySteps(r)
        ) || null;
    }, [isReplayPreviewMode, replays, selectedFeatureIds]);

    // Search and focus place
    const handleFocusPresentPlace = useCallback((place: PresentPlaceSelection) => {
        setFocusedPresentPlace(place);
    }, []);

    const clearPresentPlaceFocus = useCallback(() => {
        setFocusedPresentPlace(null);
    }, []);

    const handleFocusHistoricalGeometry = useCallback((payload: HistoricalGeometryFocusPayload) => {
        setFocusedPresentPlace(null);
        setSelectedFeatureIds([payload.geometry.id]);
        setPreviewEntityFocusToken((prev) => (prev ?? 0) + 1);

        const linkedEntityIds = previewRelations.geometryEntityIds[String(payload.geometry.id)] || [];
        if (linkedEntityIds.length === 1) {
            selectReplayPreviewEntity(linkedEntityIds[0], {
                sourceFeatureId: payload.geometry.id,
                focusMap: false,
                selectGeometry: false,
            });
        }
    }, [previewRelations.geometryEntityIds, selectReplayPreviewEntity]);

    const effectiveGeometryVisibility = useMemo(() => {
        return geometryVisibility;
    }, [geometryVisibility]);

    const handleSetMode = useCallback((m: EditorMode) => {
        if (m === "preview" || m === "replay_preview") {
            onModeChange(m);
        }
    }, [onModeChange]);

    // Popup PinnedWikiPopup rows
    const previewPinnedWikiPopupRows = useMemo(() => {
        if (!previewPinnedWikiPopupAnchor) return [];

        const entityIds = previewRelations.geometryEntityIds[String(previewPinnedWikiPopupAnchor.featureId)] || [];
        return entityIds.flatMap((entityId) => {
            const entity = previewRelations.entitiesById[entityId] || null;
            if (!entity) return [];

            const linkedWikis = previewRelations.entityWikisById[entity.id] || [];
            if (!linkedWikis.length) {
                return [{ entity, wiki: null as Wiki | null, quote: "" }];
            }

            return linkedWikis.map((wiki) => ({
                entity,
                wiki,
                quote: extractWikiBlockquoteText(wiki.content),
            }));
        });
    }, [previewPinnedWikiPopupAnchor, previewRelations]);

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
                onClearFocus={clearPresentPlaceFocus}
                leftOffset={18}
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

            <aside
                style={{
                    position: "absolute",
                    top: "50%",
                    left: 18,
                    transform: "translateY(-50%)",
                    zIndex: 16,
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
            </aside>

            {previewPinnedWikiPopupAnchor && previewPinnedWikiPopupRows.length > 0 ? (
                <PinnedWikiPopup
                    rows={previewPinnedWikiPopupRows}
                    featureId={previewPinnedWikiPopupAnchor.featureId}
                    top={clampNumber(
                        previewPinnedWikiPopupAnchor.point.y - 8,
                        16,
                        typeof window !== "undefined" ? window.innerHeight - 280 : previewPinnedWikiPopupAnchor.point.y - 8
                    )}
                    left={clampNumber(
                        previewPinnedWikiPopupAnchor.point.x + 18,
                        16,
                        typeof window !== "undefined" ? window.innerWidth - 340 : previewPinnedWikiPopupAnchor.point.x + 18
                    )}
                    onClose={() => setPreviewPinnedWikiPopupAnchor(null)}
                    onSelectRow={(entityId, wikiId) => {
                        selectReplayPreviewEntity(entityId, {
                            sourceFeatureId: previewPinnedWikiPopupAnchor.featureId,
                            preferredWikiId: wikiId,
                            focusMap: false,
                            selectGeometry: false,
                        });
                    }}
                />
            ) : null}

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
                    style={
                        isReplayPreviewWikiSidebarOpen
                            ? { right: `${previewSidebarWidth + 32}px` }
                            : undefined
                    }
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

export default PreviewLayout;

// ==========================================
// Helper functions
// ==========================================

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

function buildPreviewRelationIndex(options: {
    draft: FeatureCollection;
    entities: Entity[];
    wikis: WikiSnapshot[];
    entityWikiLinks: EntityWikiLinkSnapshot[];
    wikiCache: Record<string, Wiki>;
    projectId: string;
}): PreviewRelationIndex {
    const next: PreviewRelationIndex = {
        entitiesById: {},
        entityGeometriesById: {},
        entityWikisById: {},
        geometryEntityIds: {},
        wikiEntityIdsById: {},
        wikiEntityIdsBySlug: {},
        wikiById: {},
        wikiBySlug: {},
    };

    for (const entity of options.entities || []) {
        const id = String(entity?.id || "").trim();
        if (!id) continue;
        next.entitiesById[id] = entity;
    }

    const wikiMap = new Map<string, Wiki>();
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
            if (!next.entityGeometriesById[entityId]) {
                next.entityGeometriesById[entityId] = { type: "FeatureCollection", features: [] };
            }
            if (!next.entityGeometriesById[entityId].features.some((item) => String(item.properties.id) === geometryId)) {
                next.entityGeometriesById[entityId].features.push(feature);
            }
        }
    }

    for (const link of options.entityWikiLinks || []) {
        if (!link || link.operation === "delete") continue;
        const entityId = String(link.entity_id || "").trim();
        const wikiId = String(link.wiki_id || "").trim();
        const entity = next.entitiesById[entityId] || null;
        const wiki = next.wikiById[wikiId] || null;
        if (!entity || !wiki) continue;

        if (!next.entityWikisById[entityId]) next.entityWikisById[entityId] = [];
        if (!next.entityWikisById[entityId].some((item) => item.id === wiki.id)) {
            next.entityWikisById[entityId].push(wiki);
        }

        pushUniqueString(next.wikiEntityIdsById, wiki.id, entityId);
        const slug = String(wiki.slug || "").trim();
        if (slug) pushUniqueString(next.wikiEntityIdsBySlug, slug, entityId);
    }

    normalizeRelationArrays(next.geometryEntityIds);
    normalizeRelationArrays(next.wikiEntityIdsById);
    normalizeRelationArrays(next.wikiEntityIdsBySlug);
    return next;
}

function hasPlayableReplaySteps(replay: BattleReplay | null | undefined) {
    return Boolean(
        replay?.detail?.some((stage) => Array.isArray(stage?.steps) && stage.steps.length > 0)
    );
}

function buildEntityLabelContextDraft(draft: FeatureCollection, entities: Entity[]): FeatureCollection {
    if (!draft.features.length) return draft;

    const entityById = new globalThis.Map<string, Entity>();
    for (const entity of entities || []) {
        const id = String(entity?.id || "").trim();
        if (!id) continue;
        entityById.set(id, entity);
    }

    return {
        ...draft,
        features: draft.features.map((feature) => {
            const entityIds = normalizeFeatureEntityIds(feature);
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
