"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "@/uhm/types/geo";
import type { BattleReplay, ReplayStage, ReplayStep, DialogState } from "@/uhm/types/projects";
import { dispatchReplayAction } from "./replayDispatcher";
import { mapActions } from "./mapActions";
import { createReplayMapEffects } from "./replayMapEffects";

export type ReplayPreviewToast = {
    id: number;
    message: string;
};

type PreviewBaseline = {
    timelineYear: number;
    timelineFilterEnabled: boolean;
    timelineVisible: boolean;
    layerPanelVisible: boolean;
    zoomPanelVisible: boolean;
    labelVisibility: Record<string, "visible" | "none">;
    mapViewState: {
        center: { lng: number; lat: number };
        zoom: number;
        pitch: number;
        bearing: number;
        projection: string;
    } | null;
};

type FlattenedReplayStep = {
    stage: ReplayStage;
    step: ReplayStep;
    stageId: number;
    stepIndex: number;
};

type UseReplayPreviewOptions = {
    replay: BattleReplay | null;
    draft: FeatureCollection;
    getMapInstance: () => import("maplibre-gl").Map | null;
    initialTimelineYear: number;
    initialTimelineFilterEnabled: boolean;
    initialMapViewState: PreviewBaseline["mapViewState"];
    selectedStageId: number | null;
    selectedStepIndex: number | null;
    onSelectStep: (stageId: number | null, stepIndex: number | null) => void;
    setMapProjection?: (type: "globe" | "mercator") => void;
};

export function useReplayPreview({
    replay,
    draft,
    getMapInstance,
    initialTimelineYear,
    initialTimelineFilterEnabled,
    initialMapViewState,
    selectedStageId,
    selectedStepIndex,
    onSelectStep,
    setMapProjection,
}: UseReplayPreviewOptions) {
    const [isPlaying, setIsPlaying] = useState(false);
    const isPlayingRef = useRef(false);
    isPlayingRef.current = isPlaying;
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const dialogRef = useRef<DialogState | null>(null);
    const setDialogWithRef = useCallback((d: DialogState | null) => {
        dialogRef.current = d;
        setDialog(d);
    }, []);
    const [toasts, setToasts] = useState<ReplayPreviewToast[]>([]);
    const [timelineVisible, setTimelineVisible] = useState(true);
    const [layerPanelVisible, setLayerPanelVisible] = useState(false);
    const [zoomPanelVisible, setZoomPanelVisible] = useState(true);
    const [timelineYear, setTimelineYear] = useState(initialTimelineYear);
    const [timelineFilterEnabled, setTimelineFilterEnabled] = useState(initialTimelineFilterEnabled);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeWikiId, setActiveWikiId] = useState<string | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [hiddenGeometryIds, setHiddenGeometryIds] = useState<string[]>([]);
    const [activeCursor, setActiveCursor] = useState<{
        stageId: number | null;
        stepIndex: number | null;
    }>({
        stageId: null,
        stepIndex: null,
    });
    const [activeStepNumber, setActiveStepNumber] = useState<number | null>(null);

    const runIdRef = useRef(0);
    const playbackSpeedRef = useRef(1);
    const toastIdRef = useRef(0);
    const toastTimeoutsRef = useRef<number[]>([]);
    const baselineRef = useRef<PreviewBaseline | null>(null);
    const effects = useMemo(() => createReplayMapEffects(), []);

    const selectedStageIdRef = useRef(selectedStageId);
    const selectedStepIndexRef = useRef(selectedStepIndex);
    useEffect(() => {
        selectedStageIdRef.current = selectedStageId;
        selectedStepIndexRef.current = selectedStepIndex;
    }, [selectedStageId, selectedStepIndex]);

    const flatSteps = useMemo(() => flattenReplaySteps(replay), [replay]);

    useEffect(() => {
        playbackSpeedRef.current = playbackSpeed;
    }, [playbackSpeed]);

    useEffect(() => {
        const map = getMapInstance();
        baselineRef.current = {
            timelineYear: initialTimelineYear,
            timelineFilterEnabled: initialTimelineFilterEnabled,
            timelineVisible: true,
            layerPanelVisible: false,
            zoomPanelVisible: true,
            labelVisibility: map ? mapActions.get_label_visibility(map) : {},
            mapViewState: initialMapViewState,
        };
    }, [getMapInstance, initialMapViewState, initialTimelineFilterEnabled, initialTimelineYear, replay?.id]);

    useEffect(() => {
        return () => {
            runIdRef.current += 1;
            effects.clear(getMapInstance());
            toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
            toastTimeoutsRef.current = [];
        };
    }, [effects, getMapInstance]);
    const clearToasts = useCallback(() => {
        toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        toastTimeoutsRef.current = [];
        setToasts([]);
    }, []);

    const resetPresentation = useCallback(() => {
        setDialogWithRef(null);
        setSidebarOpen(false);
        setActiveWikiId(null);
        setLayerPanelVisible(false);
        setZoomPanelVisible(true);
        playbackSpeedRef.current = 1;
        setPlaybackSpeed(1);
        setHiddenGeometryIds([]);
        effects.clear(getMapInstance());
        clearToasts();
    }, [clearToasts, effects, getMapInstance, setDialogWithRef]);

    const addToast = useCallback((message: string) => {
        const text = String(message || "").trim();
        if (!text.length) return;

        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, message: text }]);
        const timeoutId = window.setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
            toastTimeoutsRef.current = toastTimeoutsRef.current.filter((item) => item !== timeoutId);
        }, 3200);
        toastTimeoutsRef.current.push(timeoutId);
    }, []);

    const restorePreviewState = useCallback(() => {
        setIsPlaying(false);
        setActiveCursor({ stageId: null, stepIndex: null });
        setActiveStepNumber(null);
        resetPresentation();

        const baseline = baselineRef.current;
        if (!baseline) {
            setTimelineVisible(true);
            return;
        }

        setTimelineVisible(baseline.timelineVisible);
        setLayerPanelVisible(baseline.layerPanelVisible);
        setZoomPanelVisible(baseline.zoomPanelVisible);
        setTimelineYear(baseline.timelineYear);
        setTimelineFilterEnabled(baseline.timelineFilterEnabled);
        const map = getMapInstance();
        if (map) {
            map.stop(); // Stop ongoing camera animations/transitions immediately
            mapActions.restore_label_visibility(map, baseline.labelVisibility);
            if (baseline.mapViewState) {
                if (setMapProjection) {
                    setMapProjection(baseline.mapViewState.projection === "globe" ? "globe" : "mercator");
                } else {
                    map.setProjection({
                        type: baseline.mapViewState.projection === "globe" ? "globe" : "mercator",
                    });
                }
                mapActions.set_camera_view(map, {
                    center: baseline.mapViewState.center,
                    zoom: baseline.mapViewState.zoom,
                    pitch: baseline.mapViewState.pitch,
                    bearing: baseline.mapViewState.bearing,
                    duration: 650,
                });
            }
        }
    }, [getMapInstance, resetPresentation, setMapProjection]);

    const resetPreview = useCallback(() => {
        runIdRef.current += 1;
        restorePreviewState();
    }, [restorePreviewState]);

    const stopPreview = useCallback(() => {
        runIdRef.current += 1;
        restorePreviewState();
    }, [restorePreviewState]);

    useEffect(() => {
        runIdRef.current += 1;
        restorePreviewState();
    }, [replay?.id, restorePreviewState]);

    const controllersRef = useRef<Parameters<typeof dispatchReplayAction>[0] | null>(null);
    controllersRef.current = {
        map: getMapInstance(),
        draft,
        effects,
        setTimelineVisible,
        setTimelineFilterEnabled,
        setLayerPanelVisible,
        setZoomPanelVisible,
        setSidebarOpen,
        onSelectWiki: (id) => {
            const nextId = String(id || "").trim();
            setActiveWikiId(nextId || null);
        },
        addToast,
        setPlaybackSpeed: (nextSpeed) => {
            const safe = Number.isFinite(nextSpeed) && nextSpeed > 0 ? nextSpeed : 1;
            playbackSpeedRef.current = safe;
            setPlaybackSpeed(safe);
        },
        onYearChange: setTimelineYear,
        showGeometries: (ids) => {
            const nextIds = normalizeIdList(ids);
            if (!nextIds.length) return;
            setHiddenGeometryIds((prev) => prev.filter((id) => !nextIds.includes(id)));
        },
        hideGeometries: (ids) => {
            const nextIds = normalizeIdList(ids);
            if (!nextIds.length) return;
            setHiddenGeometryIds((prev) => {
                const seen = new Set(prev);
                for (const id of nextIds) {
                    seen.add(id);
                }
                return Array.from(seen);
            });
        },
        showOnlyGeometries: (ids) => {
            const keepIds = new Set(normalizeIdList(ids));
            if (!keepIds.size) return;
            setHiddenGeometryIds(
                draft.features
                    .map((feature) => String(feature.properties.id))
                    .filter((id) => !keepIds.has(id))
            );
        },
        showAllGeometries: () => {
            setHiddenGeometryIds([]);
        },
        setDialog: setDialogWithRef,
        getDialog: () => dialogRef.current,
    };

    const playFromIndex = useCallback(async (startIndex: number) => {
        console.log("playFromIndex starting at:", startIndex, "flatSteps count:", flatSteps.length);
        if (!flatSteps.length) return;

        const map = getMapInstance();
        if (map) {
            map.stop(); // Stop ongoing camera animations/transitions immediately
            if (baselineRef.current && !isPlayingRef.current) {
                const center = map.getCenter();
                const projection = map.getProjection();
                baselineRef.current.mapViewState = initialMapViewState || {
                    center: { lng: center.lng, lat: center.lat },
                    zoom: map.getZoom(),
                    pitch: map.getPitch(),
                    bearing: map.getBearing(),
                    projection: String(projection?.type || "mercator"),
                };
                baselineRef.current.labelVisibility = mapActions.get_label_visibility(map);
                baselineRef.current.timelineYear = timelineYear;
                baselineRef.current.timelineFilterEnabled = timelineFilterEnabled;
                baselineRef.current.timelineVisible = timelineVisible;
                baselineRef.current.layerPanelVisible = layerPanelVisible;
                baselineRef.current.zoomPanelVisible = zoomPanelVisible;
            }
        }

        const safeStartIndex = Math.max(0, Math.min(flatSteps.length - 1, startIndex));
        resetPresentation();
        effects.clear(getMapInstance());
        setTimelineVisible(true);
        setTimelineYear(initialTimelineYear);
        setTimelineFilterEnabled(initialTimelineFilterEnabled);

        const runId = runIdRef.current + 1;
        runIdRef.current = runId;
        setIsPlaying(true);

        for (let index = safeStartIndex; index < flatSteps.length; index += 1) {
            if (runIdRef.current !== runId) {
                console.log("playFromIndex loop aborted because runId changed");
                return;
            }

            const current = flatSteps[index];
            setActiveCursor({
                stageId: current.stageId,
                stepIndex: current.stepIndex,
            });
            setActiveStepNumber(index + 1);
            onSelectStep(current.stageId, current.stepIndex);

            const controllers = controllersRef.current;
            if (!controllers) {
                console.warn("playFromIndex aborted: controllersRef.current is null!");
                return;
            }
            controllers.map = getMapInstance();
            controllers.draft = draft;

            const actions = [
                ...current.step.use_narrow_function,
                ...current.step.use_map_function,
                ...current.step.use_geo_function,
                ...current.step.use_UI_function,
            ];
            for (const action of actions) {
                if (runIdRef.current !== runId) return;
                dispatchReplayAction(controllers, action);
            }

            const duration = Math.max(1, Math.trunc(Number(current.step.duration) || 1000));
            const waitMs = Math.max(60, Math.round(duration / playbackSpeedRef.current));
            const completed = await waitForPreviewDelay(waitMs, () => runIdRef.current !== runId);
            if (!completed) return;
        }

        if (runIdRef.current !== runId) return;
        restorePreviewState();
    }, [
        flatSteps,
        draft,
        effects,
        getMapInstance,
        initialTimelineFilterEnabled,
        initialTimelineYear,
        initialMapViewState,
        timelineYear,
        timelineFilterEnabled,
        timelineVisible,
        layerPanelVisible,
        zoomPanelVisible,
        onSelectStep,
        resetPresentation,
        restorePreviewState,
    ]);

    const playFromStart = useCallback(() => {
        void playFromIndex(0);
    }, [playFromIndex]);

    const playFromSelection = useCallback(() => {
        const selectedIndex = findReplayStepIndex(flatSteps, selectedStageIdRef.current, selectedStepIndexRef.current);
        console.log("playFromSelection called: selectedIndex =", selectedIndex, "selectedStageId =", selectedStageIdRef.current, "selectedStepIndex =", selectedStepIndexRef.current);
        void playFromIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }, [flatSteps, playFromIndex]);

    return {
        isPlaying,
        dialog,
        toasts,
        timelineVisible,
        layerPanelVisible,
        zoomPanelVisible,
        timelineYear,
        timelineFilterEnabled,
        sidebarOpen,
        activeWikiId,
        playbackSpeed,
        activeStepNumber,
        totalSteps: flatSteps.length,
        hiddenGeometryIds,
        activeCursor,
        hasPlayableSteps: flatSteps.length > 0,
        playFromStart,
        playFromSelection,
        stopPreview,
        resetPreview,
        setTimelineYear,
        setTimelineFilterEnabled,
        closeWikiPanel: () => {
            setSidebarOpen(false);
            setActiveWikiId(null);
        },
        openWikiPanelById: (wikiId: string) => {
            const nextId = String(wikiId || "").trim();
            if (!nextId.length) return;
            setActiveWikiId(nextId);
            setSidebarOpen(true);
        },
    };
}

function flattenReplaySteps(replay: BattleReplay | null): FlattenedReplayStep[] {
    if (!replay) return [];
    return replay.detail.flatMap((stage) =>
        stage.steps.map((step, stepIndex) => ({
            stage,
            step,
            stageId: stage.id,
            stepIndex,
        }))
    );
}

function findReplayStepIndex(
    steps: FlattenedReplayStep[],
    selectedStageId: number | null,
    selectedStepIndex: number | null
) {
    if (selectedStageId == null || selectedStepIndex == null) {
        return -1;
    }
    return steps.findIndex(
        (item) =>
            item.stageId === selectedStageId &&
            item.stepIndex === selectedStepIndex
    );
}

function normalizeIdList(ids: string[]) {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const item of ids) {
        const id = String(item || "").trim();
        if (!id.length || seen.has(id)) continue;
        seen.add(id);
        next.push(id);
    }
    return next;
}

function waitForPreviewDelay(duration: number, isCancelled: () => boolean) {
    return new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => {
            resolve(!isCancelled());
        }, duration);

        const cancelLoop = () => {
            if (!isCancelled()) {
                window.setTimeout(cancelLoop, 32);
                return;
            }
            window.clearTimeout(timeoutId);
            resolve(false);
        };

        window.setTimeout(cancelLoop, 32);
    });
}
