"use client";

import { useEffect, useState } from "react";

import PreviewMapShell from "@/uhm/components/preview/PreviewMapShell";
import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import { usePublicPreviewData } from "@/uhm/components/preview/hooks/usePublicPreviewData";
import { useReplayPreview } from "@/uhm/lib/replay/useReplayPreview";
import type { MapHandle } from "@/uhm/components/Map";
import { useRef, useMemo, useCallback } from "react";
import { usePublicPreviewInteraction } from "@/uhm/components/preview/hooks/usePublicPreviewInteraction";
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

export default function Page() {
    const [selectedFeatureIds, setSelectedFeatureIds] = useState<(string | number)[]>([]);
    const [timelineYear, setTimelineYear] = useState<number>(() => clampYearToFixedRange(CURRENT_YEAR));
    const [timelineDraftYear, setTimelineDraftYear] = useState<number>(() => clampYearToFixedRange(CURRENT_YEAR));
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
    const [isLargeScreen, setIsLargeScreen] = useState(false);
    
    const mapHandleRef = useRef<MapHandle>(null);
    const [replayMode, setReplayMode] = useState<"idle" | "playing">("idle");
    const [selectedReplayStageId, setSelectedReplayStageId] = useState<number | null>(null);
    const [selectedReplayStepIndex, setSelectedReplayStepIndex] = useState<number | null>(null);

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
    } = usePublicPreviewData({ timelineYear: searchTimelineYear, timeRange });

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

    const replayPreview = useReplayPreview({
        replay: activeReplay?.replay || null,
        draft: renderDraft,
        getMapInstance: () => mapHandleRef.current?.getMap() || null,
        initialTimelineYear: timelineDraftYear,
        initialTimelineFilterEnabled: false,
        initialMapViewState: null,
        selectedStageId: selectedReplayStageId,
        selectedStepIndex: selectedReplayStepIndex,
        onSelectStep: (stageId, stepIndex) => {
            setSelectedReplayStageId(stageId);
            setSelectedReplayStepIndex(stepIndex);
        },
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
        const timeoutId = window.setTimeout(() => {
            setBackgroundVisibility(loadBackgroundLayerVisibilityFromStorage());
            setIsBackgroundVisibilityReady(true);
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, []);

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
    }, [replayPreview]);

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

    return (
        <>
            {isBackgroundVisibilityReady ? (
                <PreviewMapShell
                    mapHandleRef={mapHandleRef}
                    renderDraft={filteredRenderDraft}
                    labelContextDraft={filteredLabelContextDraft}
                    labelTimelineYear={currentTimelineYear}
                    selectedFeatureIds={selectedFeatureIds}
                    onSelectFeatureIds={setSelectedFeatureIds}
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
                    timelineStyle={activeEntity && isLargeScreen ? { right: `${sidebarWidth + 32}px` } : undefined}
                    hoverPopupEnabled
                    getHoverPopupContent={getHoverPopupContent}
                    activeEntity={replayMode === "playing" ? (replayPreview.sidebarOpen ? activeEntity : null) : activeEntity}
                    activeWiki={replayMode === "playing" ? (replayPreview.sidebarOpen ? activeWiki : null) : activeWiki}
                    isWikiLoading={isActiveWikiLoading}
                    wikiError={activeWikiError}
                    onCloseWikiSidebar={closeWikiSidebar}
                    onWikiLinkRequest={handleWikiLinkRequest}
                    sidebarWidth={sidebarWidth}
                    onSidebarWidthChange={setSidebarWidth}
                    maxSidebarDragWidth={maxDragWidth}
                    onPlayPreviewReplay={activeReplay && replayMode === "idle" ? handlePlayPreviewReplay : undefined}
                    timelineDisabled={replayMode === "playing"}
                    overlay={
                        replayMode === "playing" ? (
                            <ReplayPreviewOverlay
                                isPreviewMode={true}
                                isPlaying={replayPreview.isPlaying}
                                dialog={replayPreview.dialog}
                                toasts={replayPreview.toasts}
                                sidebarOpen={replayPreview.sidebarOpen}
                                sidebarWidth={sidebarWidth}
                                playbackSpeed={replayPreview.playbackSpeed}
                                activeStepLabel=""
                                activeStepNumber={replayPreview.activeStepNumber}
                                totalSteps={replayPreview.totalSteps}
                                onPlayPreview={replayPreview.playFromStart}
                                onStopPreview={replayPreview.stopPreview}
                                onResetPreview={replayPreview.resetPreview}
                                onExitPreview={handleExitReplay}
                            />
                        ) : null
                    }
                />
            ) : (
                <div className="h-screen w-full bg-[#0b1220]" />
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
