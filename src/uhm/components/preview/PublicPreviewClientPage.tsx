"use client";

import dynamic from "next/dynamic";

const PreviewMapShell = dynamic(
    () => import("@/uhm/components/preview/PreviewMapShell"),
    { ssr: false }
);

import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import MapPlaceholder from "@/uhm/components/preview/MapPlaceholder";
import { usePublicPreviewData } from "@/uhm/components/preview/hooks/usePublicPreviewData";
import { useReplayPreview } from "@/uhm/lib/replay/useReplayPreview";
import type { MapHandle } from "@/uhm/components/Map";
import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { usePublicPreviewInteraction } from "@/uhm/components/preview/hooks/usePublicPreviewInteraction";
import PresentPlaceSearch, {
    type HistoricalGeometryFocusPayload,
    type PresentPlaceSelection,
} from "@/uhm/components/editor/PresentPlaceSearch";
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
            }, 2000);
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
    const [replayMode, setReplayMode] = useState<"idle" | "playing">("idle");
    const [selectedReplayStageId, setSelectedReplayStageId] = useState<number | null>(null);
    const [selectedReplayStepIndex, setSelectedReplayStepIndex] = useState<number | null>(null);
    const [focusedPresentPlace, setFocusedPresentPlace] = useState<PresentPlaceSelection | null>(null);

    const [searchTimelineYear, setSearchTimelineYear] = useState(timelineYear);
    useEffect(() => {
        if (replayMode !== "playing") {
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
        handleWikiLinkRequest,
        closeWikiSidebar,
        setLinkEntityPopup,
        isManualSidebarOpen,
    } = usePublicPreviewInteraction({
        data,
        relations,
        setRelations,
        selectedFeatureIds,
        setSelectedFeatureIds,
        replayActiveWikiId: replayPreview.activeWikiId,
        replayMode,
    });

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
        if (replayMode === "playing" && !replayPreview.isPlaying) {
            replayPreview.playFromSelection();
        }
    }, [replayMode, replayPreview.isPlaying, replayPreview.playFromSelection]);

    const handlePlayPreviewReplay = useCallback(() => {
        if (!activeReplay) return;
        setReplayMode("playing");
        setSelectedReplayStageId(activeReplay.stageId);
        setSelectedReplayStepIndex(activeReplay.stepIndex);
    }, [activeReplay]);

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

    const filteredRenderDraft = useMemo(() => {
        if (replayMode !== "playing" || !replayPreview.hiddenGeometryIds?.length) {
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
        if (replayMode !== "playing" || !replayPreview.hiddenGeometryIds?.length) {
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

    const currentTimelineYear = replayMode === "playing" ? replayPreview.timelineYear : timelineDraftYear;

    const activeStepLabel = useMemo(() => {
        if (
            replayPreview.activeCursor.stageId == null ||
            replayPreview.activeCursor.stepIndex == null
        ) {
            return null;
        }
        return `Stage #${replayPreview.activeCursor.stageId} · Step ${replayPreview.activeCursor.stepIndex + 1}`;
    }, [replayPreview.activeCursor.stageId, replayPreview.activeCursor.stepIndex]);

    const isSidebarOpen = replayMode === "playing"
        ? (replayPreview.sidebarOpen || isManualSidebarOpen)
        : Boolean(activeEntity);

    const displayedActiveEntity = isSidebarOpen ? activeEntity : null;
    const displayedActiveWiki = isSidebarOpen ? activeWiki : null;

    const computedTimelineStyle = useMemo(() => {
        const leftMargin = isLayerPanelVisible ? 88 : 18;
        const rightMargin = (displayedActiveEntity && isLargeScreen) ? sidebarWidth + 32 : 18;
        const bottomOffset = (displayedActiveEntity && !isLargeScreen) ? `${sidebarHeight + 16}px` : undefined;
        return {
            left: `${leftMargin}px`,
            right: `${rightMargin}px`,
            bottom: bottomOffset,
            transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        };
    }, [isLayerPanelVisible, displayedActiveEntity, isLargeScreen, sidebarWidth, sidebarHeight]);

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
                left: "50%",
                transform: "translateX(-50%)",
                right: "auto",
                zIndex: 18,
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                pointerEvents: "auto" as const,
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
    }, [isLargeScreen]);

    return (
        <>
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
                    hoverPopupEnabled
                    getHoverPopupContent={getHoverPopupContent}
                    activeEntity={displayedActiveEntity}
                    activeWiki={displayedActiveWiki}
                    isWikiLoading={isActiveWikiLoading}
                    wikiError={activeWikiError}
                    onCloseWikiSidebar={closeWikiSidebar}
                    onWikiLinkRequest={handleWikiLinkRequest}
                    sidebarWidth={sidebarWidth}
                    onSidebarWidthChange={setSidebarWidth}
                    maxSidebarDragWidth={maxDragWidth}
                    sidebarHeight={sidebarHeight}
                    onSidebarHeightChange={handleSidebarHeightChange}
                    onPlayPreviewReplay={activeReplay && replayMode === "idle" ? handlePlayPreviewReplay : undefined}
                    timelineDisabled={replayMode === "playing"}
                    overlay={
                        replayMode === "playing" ? (
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
                                onPlayPreview={replayPreview.playFromStart}
                                onStopPreview={replayPreview.stopPreview}
                                onResetPreview={replayPreview.resetPreview}
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
                            onClearFocus={clearPresentPlaceFocus}
                            style={{
                                position: "relative",
                                top: 0,
                                left: 0,
                                transform: "none",
                                width: searchBarWidth,
                            }}
                        />
                    </div>
                </PreviewMapShell>
            )}

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
        </>
    );
}

