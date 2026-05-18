"use client";

import { useEffect, useMemo, useState } from "react";
import type {
    BattleReplay,
    GeoFunctionName,
    MapFunctionName,
    NarrativeFunctionName,
    ReplayAction,
    ReplayStage,
    ReplayStep,
    UIOptionName,
} from "@/uhm/types/projects";
import type { UndoAction } from "@/uhm/lib/editor/state/useEditorState";
import { Panel } from "./Panel";
import { UndoListPanel } from "./UndoListPanel";

type Props = {
    width?: number;
    replay: BattleReplay | null;
    selectedStageId: number | null;
    selectedStepIndex: number | null;
    pendingSaveCount: number;
    replayUndoStack: UndoAction[];
    canUndoReplay: boolean;
    onSelectStep: (stageId: number | null, stepIndex: number | null) => void;
    onMutateReplay: (label: string, mutator: (draftReplay: BattleReplay) => void) => boolean;
    onUndoReplay: () => void;
    onExitReplay: () => void;
    isPreviewPlaying: boolean;
    previewPlaybackSpeed: number;
    onPlayPreviewFromStart: () => void;
    onPlayPreviewFromSelection: () => void;
    onStopPreview: () => void;
    onResetPreview: () => void;
};

type ActionGroupKey = "use_UI_function" | "use_map_function" | "use_geo_function" | "use_narrow_function";

type StageFormState = {
    title: string;
    detail_time_start: string;
    detail_time_stop: string;
};

const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box" as const,
    fontSize: 13,
    outline: "none",
};

const buttonStyle = {
    padding: "7px 9px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#111827",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
};

export default function ReplayTimelineSidebar({
    width = 320,
    replay,
    selectedStageId,
    selectedStepIndex,
    pendingSaveCount,
    replayUndoStack,
    canUndoReplay,
    onSelectStep,
    onMutateReplay,
    onUndoReplay,
    onExitReplay,
    isPreviewPlaying,
    previewPlaybackSpeed,
    onPlayPreviewFromStart,
    onPlayPreviewFromSelection,
    onStopPreview,
    onResetPreview,
}: Props) {
    const stages = useMemo(() => replay?.detail || [], [replay?.detail]);
    const selectedStage =
        stages.find((stage) => stage.id === selectedStageId) ||
        stages[0] ||
        null;

    const [createStageForm, setCreateStageForm] = useState<StageFormState>({
        title: "",
        detail_time_start: "",
        detail_time_stop: "",
    });
    const [createStagePanelKey, setCreateStagePanelKey] = useState(0);
    const [openWeightEditorKey, setOpenWeightEditorKey] = useState<string | null>(null);
    const [openActionDetailKey, setOpenActionDetailKey] = useState<string | null>(null);

    const totalSteps = useMemo(
        () => stages.reduce((sum, stage) => sum + stage.steps.length, 0),
        [stages]
    );
    const totalActions = useMemo(
        () =>
            stages.reduce((sum, stage) => {
                return (
                    sum +
                    stage.steps.reduce((stepSum, step) => {
                        return (
                            stepSum +
                            step.use_UI_function.length +
                            step.use_map_function.length +
                            step.use_geo_function.length +
                            step.use_narrow_function.length
                        );
                    }, 0)
                );
            }, 0),
        [stages]
    );

    const selectStage = (stage: ReplayStage) => {
        onSelectStep(stage.id, stage.steps.length > 0 ? 0 : null);
    };

    const handleExportReplayJson = () => {
        if (!replay) return;

        const payload = {
            exported_at: new Date().toISOString(),
            geometry_id: replay.geometry_id,
            current_replay: replay,
            snapshot_fragment: {
                replays: [replay],
            },
        };

        const text = JSON.stringify(payload, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `replay-${String(replay.geometry_id || "draft")}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleCreateStage = () => {
        if (!replay) return;
        const nextId =
            stages.length > 0
                ? Math.max(...stages.map((stage) => stage.id)) + 1
                : 0;
        const nextStage: ReplayStage = {
            id: nextId,
            title: createStageForm.title.trim() || undefined,
            detail_time_start: createStageForm.detail_time_start.trim(),
            detail_time_stop: createStageForm.detail_time_stop.trim(),
            steps: [
                {
                    duration: 1000,
                    use_UI_function: [],
                    use_map_function: [],
                    use_geo_function: [],
                    use_narrow_function: [],
                },
            ],
        };

        const changed = onMutateReplay(`Replay: tạo stage #${nextId}`, (draftReplay) => {
            draftReplay.detail = [...(draftReplay.detail || []), nextStage];
        });
        if (!changed) return;

        setCreateStageForm({
            title: "",
            detail_time_start: "",
            detail_time_stop: "",
        });
        setCreateStagePanelKey((prev) => prev + 1);
        onSelectStep(nextId, 0);
    };

    const handleMoveStage = (stageId: number, direction: -1 | 1) => {
        onMutateReplay(`Replay: sắp xếp stage #${stageId}`, (draftReplay) => {
            const idx = draftReplay.detail.findIndex((item) => item.id === stageId);
            if (idx === -1) return;
            const nextIdx = idx + direction;
            if (nextIdx < 0 || nextIdx >= draftReplay.detail.length) return;
            const next = [...draftReplay.detail];
            const [picked] = next.splice(idx, 1);
            next.splice(nextIdx, 0, picked);
            draftReplay.detail = next;
        });
    };

    const handleDeleteStage = (stageId: number) => {
        const changed = onMutateReplay(`Replay: xóa stage #${stageId}`, (draftReplay) => {
            draftReplay.detail = draftReplay.detail.filter((item) => item.id !== stageId);
        });
        if (!changed) return;

        if (selectedStageId === stageId) {
            onSelectStep(null, null);
        }
    };

    const handleAddStep = (stageId: number) => {
        let nextStepIndex: number | null = null;
        const changed = onMutateReplay(`Replay: tạo step cho stage #${stageId}`, (draftReplay) => {
            const stage = draftReplay.detail.find((item) => item.id === stageId);
            if (!stage) return;
            nextStepIndex = stage.steps.length;
            stage.steps = [
                ...stage.steps,
                {
                    duration: 1000,
                    use_UI_function: [],
                    use_map_function: [],
                    use_geo_function: [],
                    use_narrow_function: [],
                },
            ];
        });
        if (!changed || nextStepIndex == null) return;

        onSelectStep(stageId, nextStepIndex);
    };

    const handleMoveStep = (stageId: number, stepIndex: number, direction: -1 | 1) => {
        let nextSelectedIndex = stepIndex;
        const changed = onMutateReplay(
            `Replay: sắp xếp step ${stepIndex + 1} của stage #${stageId}`,
            (draftReplay) => {
                const stage = draftReplay.detail.find((item) => item.id === stageId);
                if (!stage) return;
                const nextIdx = stepIndex + direction;
                if (nextIdx < 0 || nextIdx >= stage.steps.length) return;
                const nextSteps = [...stage.steps];
                const [picked] = nextSteps.splice(stepIndex, 1);
                nextSteps.splice(nextIdx, 0, picked);
                stage.steps = nextSteps;
                nextSelectedIndex = nextIdx;
            }
        );
        if (!changed) return;

        if (selectedStageId === stageId && selectedStepIndex === stepIndex) {
            onSelectStep(stageId, nextSelectedIndex);
        }
    };

    const handleDeleteStep = (stageId: number, stepIndex: number) => {
        const changed = onMutateReplay(
            `Replay: xóa step ${stepIndex + 1} của stage #${stageId}`,
            (draftReplay) => {
                const stage = draftReplay.detail.find((item) => item.id === stageId);
                if (!stage) return;
                stage.steps = stage.steps.filter((_, idx) => idx !== stepIndex);
            }
        );
        if (!changed) return;

        if (selectedStageId === stageId && selectedStepIndex === stepIndex) {
            onSelectStep(stageId, null);
        }
    };

    const handleDeleteAction = (
        stageId: number,
        stepIndex: number,
        groupKey: ActionGroupKey,
        actionIndex: number,
        actionTitle: string
    ) => {
        onMutateReplay(
            `Replay: xóa ${actionTitle} ở step ${stepIndex + 1} của stage #${stageId}`,
            (draftReplay) => {
                const stage = draftReplay.detail.find((item) => item.id === stageId);
                if (!stage) return;
                if (stepIndex < 0 || stepIndex >= stage.steps.length) return;

                const step = stage.steps[stepIndex];
                switch (groupKey) {
                    case "use_UI_function":
                        if (actionIndex < 0 || actionIndex >= step.use_UI_function.length) return;
                        step.use_UI_function = step.use_UI_function.filter((_, idx) => idx !== actionIndex);
                        return;
                    case "use_map_function":
                        if (actionIndex < 0 || actionIndex >= step.use_map_function.length) return;
                        step.use_map_function = step.use_map_function.filter((_, idx) => idx !== actionIndex);
                        return;
                    case "use_geo_function":
                        if (actionIndex < 0 || actionIndex >= step.use_geo_function.length) return;
                        step.use_geo_function = step.use_geo_function.filter((_, idx) => idx !== actionIndex);
                        return;
                    case "use_narrow_function":
                        if (actionIndex < 0 || actionIndex >= step.use_narrow_function.length) return;
                        step.use_narrow_function = step.use_narrow_function.filter((_, idx) => idx !== actionIndex);
                        return;
                }
            }
        );
    };

    return (
        <aside
            style={{
                width,
                height: "100vh",
                overflowY: "auto",
                background: "#0b1220",
                color: "white",
                padding: "8px 8px 14px",
                borderRight: "1px solid #1f2937",
            }}
        >
            <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#0b1220", paddingBottom: 6 }}>
                <Panel title="Replay" defaultOpen>
                    <div style={{ display: "grid", gap: 8, fontSize: 12, color: "#cbd5e1" }}>
                        <div>
                            <div style={{ color: "#94a3b8", fontSize: 11 }}>Geometry kích hoạt</div>
                            <div style={{ color: "white", fontWeight: 850, fontSize: 12, overflowWrap: "anywhere" }}>
                                {replay?.geometry_id || "Chưa có"}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                            <SummaryValue label="Stage" value={String(stages.length)} />
                            <SummaryValue label="Step" value={String(totalSteps)} />
                            <SummaryValue label="Action" value={String(totalActions)} />
                        </div>
                        <div style={{ fontSize: 11, color: pendingSaveCount > 0 ? "#fbbf24" : "#94a3b8" }}>
                            {pendingSaveCount > 0
                                ? `Có ${pendingSaveCount} thay đổi chưa commit. Thoát replay để commit từ editor chính.`
                                : "Replay đang đồng bộ với snapshot hiện tại."}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            <button
                                type="button"
                                onClick={onUndoReplay}
                                disabled={!canUndoReplay}
                                style={{
                                    ...buttonStyle,
                                    background: canUndoReplay ? "#334155" : "#1e293b",
                                    cursor: canUndoReplay ? "pointer" : "not-allowed",
                                    opacity: canUndoReplay ? 1 : 0.7,
                                }}
                            >
                                Undo replay
                            </button>
                            <button
                                type="button"
                                onClick={handleExportReplayJson}
                                disabled={!replay}
                                style={{
                                    ...buttonStyle,
                                    background: replay ? "#1d4ed8" : "#1e293b",
                                    border: "none",
                                    cursor: replay ? "pointer" : "not-allowed",
                                    opacity: replay ? 1 : 0.7,
                                }}
                            >
                                Export JSON
                            </button>
                            <button
                                type="button"
                                onClick={onExitReplay}
                                style={{
                                    ...buttonStyle,
                                    background: "#0f766e",
                                    border: "none",
                                }}
                            >
                                Thoát replay
                            </button>
                        </div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: isPreviewPlaying ? "1fr 1fr" : "1fr 1fr",
                                gap: 8,
                            }}
                        >
                            <button
                                type="button"
                                onClick={onPlayPreviewFromStart}
                                disabled={!replay || totalSteps === 0}
                                style={{
                                    ...buttonStyle,
                                    background: !replay || totalSteps === 0 ? "#1e293b" : "#166534",
                                    border: "none",
                                    cursor: !replay || totalSteps === 0 ? "not-allowed" : "pointer",
                                    opacity: !replay || totalSteps === 0 ? 0.7 : 1,
                                }}
                            >
                                Play từ đầu
                            </button>
                            <button
                                type="button"
                                onClick={onPlayPreviewFromSelection}
                                disabled={!replay || selectedStage == null || selectedStepIndex == null}
                                style={{
                                    ...buttonStyle,
                                    background:
                                        !replay || selectedStage == null || selectedStepIndex == null
                                            ? "#1e293b"
                                            : "#0f766e",
                                    border: "none",
                                    cursor:
                                        !replay || selectedStage == null || selectedStepIndex == null
                                            ? "not-allowed"
                                            : "pointer",
                                    opacity:
                                        !replay || selectedStage == null || selectedStepIndex == null
                                            ? 0.7
                                            : 1,
                                }}
                            >
                                Play từ step
                            </button>
                            {isPreviewPlaying ? (
                                <button
                                    type="button"
                                    onClick={onStopPreview}
                                    style={{
                                        ...buttonStyle,
                                        background: "#7f1d1d",
                                        border: "none",
                                    }}
                                >
                                    Dừng
                                </button>
                            ) : null}
                            {isPreviewPlaying ? (
                                <button
                                    type="button"
                                    onClick={onResetPreview}
                                    style={{
                                        ...buttonStyle,
                                        background: "#1e3a8a",
                                        border: "none",
                                    }}
                                >
                                    Reset preview
                                </button>
                            ) : null}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            Preview sẽ mở trong mode riêng với snapshot replay tại thời điểm bấm play.
                        </div>
                    </div>
                </Panel>
            </div>

            <Panel key={`create-stage-${createStagePanelKey}`} title="Tạo Stage" defaultOpen={false}>
                <div style={{ display: "grid", gap: 8 }}>
                    <input
                        value={createStageForm.title}
                        onChange={(event) =>
                            setCreateStageForm((prev) => ({ ...prev, title: event.target.value }))
                        }
                        placeholder="Title"
                        style={inputStyle}
                    />
                    <input
                        value={createStageForm.detail_time_start}
                        onChange={(event) =>
                            setCreateStageForm((prev) => ({
                                ...prev,
                                detail_time_start: event.target.value,
                            }))
                        }
                        placeholder="detail_time_start"
                        style={inputStyle}
                    />
                    <input
                        value={createStageForm.detail_time_stop}
                        onChange={(event) =>
                            setCreateStageForm((prev) => ({
                                ...prev,
                                detail_time_stop: event.target.value,
                            }))
                        }
                        placeholder="detail_time_stop"
                        style={inputStyle}
                    />
                    <button
                        type="button"
                        onClick={handleCreateStage}
                        style={{
                            ...buttonStyle,
                            background: "#1d4ed8",
                            border: "none",
                        }}
                    >
                        Tạo stage
                    </button>
                </div>
            </Panel>

            <Panel title="Timeline" badge={`${stages.length} stage`} defaultOpen>
                {stages.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>
                        Chưa có stage nào. Tạo stage trước, rồi thêm step vào từng stage.
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                        {stages.map((stage, stageIndex) => {
                            const isSelected = selectedStage?.id === stage.id;
                            return (
                                <div
                                    key={stage.id}
                                    style={{
                                        border: isSelected ? "1px solid #38bdf8" : "1px solid #243244",
                                        borderRadius: 8,
                                        background: isSelected ? "rgba(14, 165, 233, 0.12)" : "#0f172a",
                                        padding: 8,
                                        display: "grid",
                                        gap: 6,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => selectStage(stage)}
                                        style={{
                                            border: "none",
                                            background: "transparent",
                                            padding: 0,
                                            margin: 0,
                                            textAlign: "left",
                                            color: "inherit",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
                                            <div>
                                                <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 900 }}>
                                                    Stage #{stage.id}
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: "white", lineHeight: 1.25 }}>
                                                    {stage.title?.trim() || `Untitled stage ${stage.id}`}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 11, color: "#cbd5e1", whiteSpace: "nowrap", paddingTop: 2 }}>
                                                {stage.steps.length} step
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 2, fontSize: 11, color: "#94a3b8" }}>
                                            {stage.detail_time_start || "?"} → {stage.detail_time_stop || "?"}
                                        </div>
                                    </button>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5 }}>
                                        <button
                                            type="button"
                                            onClick={() => handleMoveStage(stage.id, -1)}
                                            disabled={stageIndex === 0}
                                            style={smallButtonStyle(stageIndex === 0)}
                                        >
                                            Lên
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMoveStage(stage.id, 1)}
                                            disabled={stageIndex === stages.length - 1}
                                            style={smallButtonStyle(stageIndex === stages.length - 1)}
                                        >
                                            Xuống
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleAddStep(stage.id)}
                                            style={{
                                                ...smallButtonStyle(false),
                                                background: "#1e40af",
                                                border: "none",
                                            }}
                                        >
                                            Thêm step
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteStage(stage.id)}
                                            style={{
                                                ...smallButtonStyle(false),
                                                background: "#7f1d1d",
                                                border: "none",
                                            }}
                                        >
                                            Xóa stage
                                        </button>
                                    </div>

                                    {isSelected ? (
                                        <div style={{ display: "grid", gap: 5 }}>
                                            {stage.steps.length === 0 ? (
                                                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                                    Stage này chưa có step.
                                                </div>
                                            ) : (
                                                stage.steps.map((step, stepIndex) => {
                                                    const isSelectedStep = selectedStepIndex === stepIndex;
                                                    const actionCount =
                                                        step.use_UI_function.length +
                                                        step.use_map_function.length +
                                                        step.use_geo_function.length +
                                                        step.use_narrow_function.length;
                                                    return (
                                                        <div
                                                            key={`${stage.id}-${stepIndex}`}
                                                            style={{
                                                                border: isSelectedStep
                                                                    ? "1px solid #f59e0b"
                                                                    : "1px solid #243244",
                                                                borderRadius: 8,
                                                                padding: 6,
                                                                background: isSelectedStep
                                                                    ? "rgba(245, 158, 11, 0.12)"
                                                                    : "rgba(15, 23, 42, 0.9)",
                                                                display: "grid",
                                                                gap: 5,
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => onSelectStep(stage.id, stepIndex)}
                                                                style={{
                                                                    border: "none",
                                                                    background: "transparent",
                                                                    padding: 0,
                                                                    margin: 0,
                                                                    textAlign: "left",
                                                                    color: "inherit",
                                                                    cursor: "pointer",
                                                                }}
                                                            >
                                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                                                    <div style={{ fontSize: 12, color: "white", fontWeight: 800 }}>
                                                                        Step {stepIndex + 1}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: "#cbd5e1", whiteSpace: "nowrap" }}>
                                                                        {step.duration} · {actionCount} action
                                                                    </div>
                                                                </div>
                                                            </button>
                                                            {isSelectedStep && actionCount > 0 ? (
                                                                <div
                                                                    style={{
                                                                        display: "grid",
                                                                        gap: 4,
                                                                        padding: "6px",
                                                                        borderRadius: 8,
                                                                        border: "1px solid rgba(148, 163, 184, 0.16)",
                                                                        background: "rgba(2, 6, 23, 0.45)",
                                                                    }}
                                                                >
                                                                    {buildStepActionEntries(step).map((entry) => {
                                                                        const actionKey = `${stage.id}:${stepIndex}:${entry.groupKey}:${entry.actionIndex}:${entry.functionName}`;
                                                                        const isActionOpen = openActionDetailKey === actionKey;
                                                                        return (
                                                                        <div
                                                                            key={actionKey}
                                                                            style={{
                                                                                display: "grid",
                                                                                gap: 3,
                                                                                padding: "5px 6px",
                                                                                borderRadius: 6,
                                                                                background: "rgba(15, 23, 42, 0.92)",
                                                                                border: "1px solid rgba(51, 65, 85, 0.8)",
                                                                            }}
                                                                        >
                                                                            <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setOpenActionDetailKey((prev) =>
                                                                                            prev === actionKey ? null : actionKey
                                                                                        )
                                                                                    }
                                                                                    style={{
                                                                                        flex: 1,
                                                                                        border: "none",
                                                                                        background: "transparent",
                                                                                        padding: 0,
                                                                                        margin: 0,
                                                                                        textAlign: "left",
                                                                                        color: "inherit",
                                                                                        cursor: "pointer",
                                                                                    }}
                                                                                >
                                                                                    <div
                                                                                        style={{
                                                                                            display: "flex",
                                                                                            alignItems: "center",
                                                                                            justifyContent: "space-between",
                                                                                            gap: 8,
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                                                                                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                                                                                <span
                                                                                                    style={{
                                                                                                        display: "inline-flex",
                                                                                                        alignItems: "center",
                                                                                                        padding: "1px 6px",
                                                                                                        borderRadius: 999,
                                                                                                        background: entry.badgeBackground,
                                                                                                        color: entry.badgeColor,
                                                                                                        fontSize: 10,
                                                                                                        fontWeight: 900,
                                                                                                        letterSpacing: 0.3,
                                                                                                        textTransform: "uppercase",
                                                                                                    }}
                                                                                                >
                                                                                                    {entry.group}
                                                                                                </span>
                                                                                                <span
                                                                                                    style={{
                                                                                                        fontSize: 11,
                                                                                                        color: "#93c5fd",
                                                                                                        fontWeight: 800,
                                                                                                        overflowWrap: "anywhere",
                                                                                                    }}
                                                                                                >
                                                                                                    {entry.functionName}
                                                                                                </span>
                                                                                            </div>
                                                                                            <div
                                                                                                style={{
                                                                                                    fontSize: 11,
                                                                                                    color: "white",
                                                                                                    fontWeight: 700,
                                                                                                    overflowWrap: "anywhere",
                                                                                                }}
                                                                                            >
                                                                                                {entry.title}
                                                                                            </div>
                                                                                        </div>
                                                                                        <span
                                                                                            style={{
                                                                                                fontSize: 11,
                                                                                                color: "#94a3b8",
                                                                                                fontWeight: 800,
                                                                                                flex: "0 0 auto",
                                                                                            }}
                                                                                        >
                                                                                            {isActionOpen ? "−" : "+"}
                                                                                        </span>
                                                                                    </div>
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        handleDeleteAction(
                                                                                            stage.id,
                                                                                            stepIndex,
                                                                                            entry.groupKey,
                                                                                            entry.actionIndex,
                                                                                            entry.title
                                                                                        )
                                                                                    }
                                                                                    style={{
                                                                                        padding: "3px 6px",
                                                                                        borderRadius: 6,
                                                                                        border: "none",
                                                                                        background: "#7f1d1d",
                                                                                        color: "white",
                                                                                        cursor: "pointer",
                                                                                        fontSize: 10,
                                                                                        fontWeight: 800,
                                                                                        flex: "0 0 auto",
                                                                                        alignSelf: "start",
                                                                                    }}
                                                                                >
                                                                                    Xóa
                                                                                </button>
                                                                            </div>
                                                                            {isActionOpen ? (
                                                                                <div
                                                                                    style={{
                                                                                        fontSize: 11,
                                                                                        color: "#94a3b8",
                                                                                        lineHeight: 1.3,
                                                                                        overflowWrap: "anywhere",
                                                                                    }}
                                                                                >
                                                                                    {entry.summary}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    );
                                                                    })}
                                                                </div>
                                                            ) : null}
                                                            <div
                                                                style={{
                                                                    display: "grid",
                                                                    gridTemplateColumns: isSelectedStep
                                                                        ? "repeat(4, minmax(0, 1fr))"
                                                                        : "repeat(3, minmax(0, 1fr))",
                                                                    gap: 5,
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleMoveStep(stage.id, stepIndex, -1)}
                                                                    disabled={stepIndex === 0}
                                                                    style={smallButtonStyle(stepIndex === 0)}
                                                                >
                                                                    Lên
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleMoveStep(stage.id, stepIndex, 1)}
                                                                    disabled={stepIndex === stage.steps.length - 1}
                                                                    style={smallButtonStyle(stepIndex === stage.steps.length - 1)}
                                                                >
                                                                    Xuống
                                                                </button>
                                                                {isSelectedStep ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setOpenWeightEditorKey((prev) =>
                                                                                prev === `${stage.id}:${stepIndex}` ? null : `${stage.id}:${stepIndex}`
                                                                            )
                                                                        }
                                                                        style={{
                                                                            ...smallButtonStyle(false),
                                                                            background: openWeightEditorKey === `${stage.id}:${stepIndex}`
                                                                                ? "#334155"
                                                                                : "#0f766e",
                                                                            border: "none",
                                                                        }}
                                                                    >
                                                                        Weight
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteStep(stage.id, stepIndex)}
                                                                    style={{
                                                                        ...smallButtonStyle(false),
                                                                        background: "#7f1d1d",
                                                                        border: "none",
                                                                    }}
                                                                >
                                                                    Xóa
                                                                </button>
                                                            </div>
                                                            {isSelectedStep && openWeightEditorKey === `${stage.id}:${stepIndex}` ? (
                                                                <InlineStepDurationEditor
                                                                    key={`duration-${stage.id}-${stepIndex}-${step.duration}`}
                                                                    stageId={stage.id}
                                                                    stepIndex={stepIndex}
                                                                    step={step}
                                                                    onApply={(nextDuration) => {
                                                                        onMutateReplay(
                                                                            `Replay: đổi duration step ${stepIndex + 1} của stage #${stage.id}`,
                                                                            (draftReplay) => {
                                                                                const targetStage = draftReplay.detail.find(
                                                                                    (item) => item.id === stage.id
                                                                                );
                                                                                if (!targetStage) return;
                                                                                if (stepIndex < 0 || stepIndex >= targetStage.steps.length) return;
                                                                                targetStage.steps[stepIndex].duration = nextDuration;
                                                                            }
                                                                        );
                                                                        setOpenWeightEditorKey(null);
                                                                    }}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </Panel>

            {selectedStage ? (
                <StageMetadataEditor
                    key={`stage-meta-${selectedStage.id}`}
                    stage={selectedStage}
                    onMutateReplay={onMutateReplay}
                />
            ) : null}

            <UndoListPanel undoStack={replayUndoStack} />
        </aside>
    );
}

function StageMetadataEditor({
    stage,
    onMutateReplay,
}: {
    stage: ReplayStage;
    onMutateReplay: (label: string, mutator: (draftReplay: BattleReplay) => void) => boolean;
}) {
    const [form, setForm] = useState<StageFormState>({
        title: stage.title || "",
        detail_time_start: stage.detail_time_start || "",
        detail_time_stop: stage.detail_time_stop || "",
    });

    useEffect(() => {
        setForm({
            title: stage.title || "",
            detail_time_start: stage.detail_time_start || "",
            detail_time_stop: stage.detail_time_stop || "",
        });
    }, [stage]);

    const handleApplyStageMetadata = () => {
        onMutateReplay(`Replay: cập nhật stage #${stage.id}`, (draftReplay) => {
            const targetStage = draftReplay.detail.find((item) => item.id === stage.id);
            if (!targetStage) return;
            targetStage.title = form.title.trim() || undefined;
            targetStage.detail_time_start = form.detail_time_start.trim();
            targetStage.detail_time_stop = form.detail_time_stop.trim();
        });
    };

    return (
            <Panel title="Stage Metadata" badge={`#${stage.id}`} defaultOpen={false}>
                <div style={{ display: "grid", gap: 8 }}>
                <input
                    value={form.title}
                    onChange={(event) =>
                        setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Title"
                    style={inputStyle}
                />
                <input
                    value={form.detail_time_start}
                    onChange={(event) =>
                        setForm((prev) => ({
                            ...prev,
                            detail_time_start: event.target.value,
                        }))
                    }
                    placeholder="detail_time_start"
                    style={inputStyle}
                />
                <input
                    value={form.detail_time_stop}
                    onChange={(event) =>
                        setForm((prev) => ({
                            ...prev,
                            detail_time_stop: event.target.value,
                        }))
                    }
                    placeholder="detail_time_stop"
                    style={inputStyle}
                />
                <button
                    type="button"
                    onClick={handleApplyStageMetadata}
                    style={{
                        ...buttonStyle,
                        background: "#0f766e",
                        border: "none",
                    }}
                >
                    Apply metadata
                </button>
            </div>
        </Panel>
    );
}

function SummaryValue({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div
            style={{
                padding: 8,
                borderRadius: 8,
                border: "1px solid #243244",
                background: "#0f172a",
            }}
        >
            <div style={{ fontSize: 10, color: "#94a3b8" }}>{label}</div>
            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 850, color: "white" }}>{value}</div>
        </div>
    );
}

function smallButtonStyle(disabled: boolean) {
    return {
        padding: "5px 6px",
        borderRadius: 6,
        border: "1px solid #334155",
        background: disabled ? "#1e293b" : "#111827",
        color: "#e2e8f0",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        fontWeight: 700,
        fontSize: 11,
    } as const;
}

function InlineStepDurationEditor({
    stageId,
    stepIndex,
    step,
    onApply,
}: {
    stageId: number;
    stepIndex: number;
    step: ReplayStep;
    onApply: (nextDuration: number) => void;
}) {
    const [durationInput, setDurationInput] = useState(String(step.duration ?? 1000));

    return (
        <div
            style={{
                display: "grid",
                gap: 5,
                padding: "6px",
                borderRadius: 8,
                border: "1px solid rgba(148, 163, 184, 0.16)",
                background: "rgba(2, 6, 23, 0.45)",
            }}
        >
            <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 800 }}>
                Weight: {step.duration}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                    value={durationInput}
                    onChange={(event) => setDurationInput(event.target.value)}
                    placeholder="1000"
                    style={inputStyle}
                />
                <button
                    type="button"
                    onClick={() => onApply(Math.max(1, Math.trunc(Number(durationInput) || 1000)))}
                    style={{
                        ...buttonStyle,
                        background: "#0f766e",
                        border: "none",
                    }}
                >
                    Apply
                </button>
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.3 }}>
                Stage #{stageId}, step {stepIndex + 1}. Step mới mặc định dùng duration `1000`.
            </div>
        </div>
    );
}

type StepActionEntry = {
    group: "Narrative" | "Map" | "Geo" | "UI";
    groupKey: ActionGroupKey;
    actionIndex: number;
    functionName: string;
    title: string;
    summary: string;
    badgeBackground: string;
    badgeColor: string;
};

const uiOptionLabels: Record<UIOptionName, string> = {
    timeline: "Timeline",
    layer_panel: "Layer Panel",
    wiki_panel: "Wiki Panel",
    close_wiki_panel: "Đóng Wiki Panel",
    zoom_panel: "Zoom Panel",
    wiki: "Wiki",
    toast: "Toast",
    wiki_header: "Wiki Header",
    playback_speed: "Playback Speed",
};

const narrativeFunctionLabels: Record<NarrativeFunctionName, string> = {
    set_title: "Tiêu đề step",
    clear_title: "Xóa tiêu đề",
    set_descriptions: "Mô tả",
    clear_descriptions: "Xóa mô tả",
    show_dialog_box: "Dialog box",
    clear_dialog_box: "Đóng dialog box",
    display_historical_image: "Ảnh lịch sử",
    clear_historical_image: "Xóa ảnh lịch sử",
    set_step_subtitle: "Phụ đề",
    clear_step_subtitle: "Xóa phụ đề",
};

const mapFunctionLabels: Record<MapFunctionName, string> = {
    set_camera_view: "Camera view",
    set_time_filter: "Lọc năm",
    enable_timeline_filter: "Bật timeline filter",
    disable_timeline_filter: "Tắt timeline filter",
    toggle_labels: "Bật/tắt labels",
    show_labels: "Hiện labels",
    hide_labels: "Ẩn labels",
    show_all_geometries: "Hiện tất cả geo",
    reset_camera_north: "North up",
};

const geoFunctionLabels: Record<GeoFunctionName, string> = {
    fly_to_geometry: "Fly tới geo",
    fly_to_geometries: "Fly tới geo",
    set_geometry_visibility: "Ẩn/hiện geometry",
    show_geometries: "Hiện geo",
    hide_geometries: "Ẩn geo",
    fit_to_geometries: "Fit nhiều geo",
    orbit_camera_around_geometry: "Orbit quanh geo",
    pulse_geometry: "Pulse geometry",
    animate_dashed_border: "Border nét đứt",
    set_geometry_style: "Style geometry",
    show_geometry_label: "Label geometry",
    follow_geometry_path: "Follow path",
    follow_geometries_path: "Follow path",
    dim_other_geometries: "Ẩn geo khác",
};

function buildStepActionEntries(step: ReplayStep): StepActionEntry[] {
    return [
        ...step.use_narrow_function.map((action, actionIndex) =>
            buildNarrativeActionEntry(action, actionIndex)
        ),
        ...step.use_map_function.map((action, actionIndex) =>
            buildMapActionEntry(action, actionIndex)
        ),
        ...step.use_geo_function.map((action, actionIndex) =>
            buildGeoActionEntry(action, actionIndex)
        ),
        ...step.use_UI_function.map((action, actionIndex) =>
            buildUiActionEntry(action, actionIndex)
        ),
    ];
}

function buildNarrativeActionEntry(
    action: ReplayAction<NarrativeFunctionName>,
    actionIndex: number
): StepActionEntry {
    const params = Array.isArray(action.params) ? action.params : [];
    let summary = "Không có tham số.";

    switch (action.function_name) {
        case "set_title":
            summary = summarizeValue(params[0], "Tiêu đề trống");
            break;
        case "clear_title":
            summary = "title=null";
            break;
        case "set_descriptions":
            summary = summarizeValue(params[0], "Mô tả trống");
            break;
        case "clear_descriptions":
            summary = "descriptions=null";
            break;
        case "show_dialog_box":
            summary = [
                `speaker=${summarizeValue(params[3], "ẩn danh")}`,
                `side=${summarizeValue(params[2], "left")}`,
                `text=${summarizeValue(params[1], "trống")}`,
            ].join(" | ");
            break;
        case "clear_dialog_box":
            summary = "dialog=null";
            break;
        case "display_historical_image":
            summary = [
                `url=${summarizeValue(params[0], "trống")}`,
                `caption=${summarizeValue(params[1], "trống")}`,
            ].join(" | ");
            break;
        case "clear_historical_image":
            summary = "image=null";
            break;
        case "set_step_subtitle":
            summary = summarizeValue(params[0], "Ẩn subtitle");
            break;
        case "clear_step_subtitle":
            summary = "subtitle=null";
            break;
    }

    return {
        group: "Narrative",
        groupKey: "use_narrow_function",
        actionIndex,
        functionName: action.function_name,
        title: narrativeFunctionLabels[action.function_name],
        summary,
        badgeBackground: "rgba(59, 130, 246, 0.18)",
        badgeColor: "#93c5fd",
    };
}

function buildMapActionEntry(
    action: ReplayAction<MapFunctionName>,
    actionIndex: number
): StepActionEntry {
    const params = Array.isArray(action.params) ? action.params : [];
    let summary = "Không có tham số.";

    switch (action.function_name) {
        case "set_time_filter":
            summary = `year=${summarizeValue(params[0], "trống")}`;
            break;
        case "enable_timeline_filter":
            summary = "enabled=true";
            break;
        case "disable_timeline_filter":
            summary = "enabled=false";
            break;
        case "toggle_labels":
            summary = `visible=${Boolean(params[0] ?? true) ? "true" : "false"}`;
            break;
        case "show_labels":
            summary = "visible=true";
            break;
        case "hide_labels":
            summary = "visible=false";
            break;
        case "show_all_geometries":
            summary = "hidden_ids=[]";
            break;
        case "set_camera_view":
            summary = summarizeCameraViewValue(params[0]);
            break;
        case "reset_camera_north":
            summary = "bearing=0";
            break;
    }

    return {
        group: "Map",
        groupKey: "use_map_function",
        actionIndex,
        functionName: action.function_name,
        title: mapFunctionLabels[action.function_name],
        summary,
        badgeBackground: "rgba(16, 185, 129, 0.18)",
        badgeColor: "#6ee7b7",
    };
}

function buildGeoActionEntry(
    action: ReplayAction<GeoFunctionName>,
    actionIndex: number
): StepActionEntry {
    const params = Array.isArray(action.params) ? action.params : [];
    let summary = "Không có tham số.";

    switch (action.function_name) {
        case "fly_to_geometry":
            summary = [
                `geometry=${summarizeValue(params[0], "trống")}`,
                `zoom=${summarizeValue(params[1], "mặc định")}`,
                `padding=${summarizeValue(params[2], "mặc định")}`,
                `duration=${summarizeValue(params[3], "mặc định")}`,
            ].join(" | ");
            break;
        case "fly_to_geometries":
            summary = `geometry=${summarizeGeometryIdsValue(params[0])}`;
            break;
        case "set_geometry_visibility":
            summary = [
                `geometry=${summarizeGeometryIdsValue(params[0])}`,
                `visible=${Boolean(params[1] ?? true) ? "true" : "false"}`,
            ].join(" | ");
            break;
        case "show_geometries":
            summary = `geometry=${summarizeGeometryIdsValue(params[0])} | visible=true`;
            break;
        case "hide_geometries":
            summary = `geometry=${summarizeGeometryIdsValue(params[0])} | visible=false`;
            break;
        case "fit_to_geometries":
            summary = [
                `geometry=${summarizeGeometryIdsValue(params[0])}`,
                `padding=${summarizeValue(params[1], "mặc định")}`,
                `duration=${summarizeValue(params[2], "mặc định")}`,
            ].join(" | ");
            break;
        case "orbit_camera_around_geometry":
            summary = [
                `geometry=${summarizeValue(params[0], "trống")}`,
                `zoom=${summarizeValue(params[1], "mặc định")}`,
                `pitch=${summarizeValue(params[2], "mặc định")}`,
                `revolutions=${summarizeValue(params[3], "mặc định")}`,
                `duration=${summarizeValue(params[4], "mặc định")}`,
            ].join(" | ");
            break;
        case "pulse_geometry":
            summary = [
                `geometry=${summarizeValue(params[0], "trống")}`,
                `color=${summarizeValue(params[1], "#f59e0b")}`,
                `repeat=${summarizeValue(params[2], "mặc định")}`,
                `duration=${summarizeValue(params[3], "mặc định")}`,
            ].join(" | ");
            break;
        case "animate_dashed_border":
            summary = [
                `geometry=${summarizeValue(params[0], "trống")}`,
                `color=${summarizeValue(params[1], "#38bdf8")}`,
                `width=${summarizeValue(params[2], "mặc định")}`,
                `speed=${summarizeValue(params[3], "mặc định")}`,
                `duration=${summarizeValue(params[4], "mặc định")}`,
            ].join(" | ");
            break;
        case "set_geometry_style":
            summary = [
                `geometry=${summarizeGeometryIdsValue(params[0])}`,
                `fill=${summarizeValue(params[1], "#f97316")}`,
                `fill_opacity=${summarizeValue(params[2], "mặc định")}`,
                `line=${summarizeValue(params[3], "#fdba74")}`,
                `line_width=${summarizeValue(params[4], "mặc định")}`,
            ].join(" | ");
            break;
        case "show_geometry_label":
            summary = [
                `geometry=${summarizeValue(params[0], "trống")}`,
                `text=${summarizeValue(params[1], "trống")}`,
                `color=${summarizeValue(params[2], "#ffffff")}`,
                `size=${summarizeValue(params[3], "mặc định")}`,
            ].join(" | ");
            break;
        case "follow_geometry_path":
            summary = [
                `geometry=${summarizeValue(params[0], "trống")}`,
                `duration=${summarizeValue(params[1], "mặc định")}`,
                `zoom=${summarizeValue(params[2], "mặc định")}`,
                `pitch=${summarizeValue(params[3], "mặc định")}`,
            ].join(" | ");
            break;
        case "follow_geometries_path":
            summary = [
                `geometry=${summarizeGeometryIdsValue(params[0])}`,
                `duration=${summarizeValue(params[1], "mặc định")}`,
                `zoom=${summarizeValue(params[2], "mặc định")}`,
                `pitch=${summarizeValue(params[3], "mặc định")}`,
            ].join(" | ");
            break;
        case "dim_other_geometries":
            summary = [
                `keep=${summarizeGeometryIdsValue(params[0])}`,
            ].join(" | ");
            break;
    }

    return {
        group: "Geo",
        groupKey: "use_geo_function",
        actionIndex,
        functionName: action.function_name,
        title: geoFunctionLabels[action.function_name],
        summary,
        badgeBackground: "rgba(34, 211, 238, 0.18)",
        badgeColor: "#67e8f9",
    };
}

function buildUiActionEntry(
    action: ReplayAction<UIOptionName>,
    actionIndex: number
): StepActionEntry {
    const descriptor = getUiActionDescriptor(action);
    const option = descriptor?.option || null;
    const params = descriptor?.payload || (Array.isArray(action.params) ? action.params : []);
    const optionLabel = option ? uiOptionLabels[option] : summarizeValue(action.function_name, "Unknown option");
    let summary = "Không có tham số.";

    if (option === "timeline" || option === "layer_panel" || option === "wiki_panel" || option === "zoom_panel") {
        summary = `visible=${Boolean(params[0]) ? "true" : "false"}`;
    } else if (option === "close_wiki_panel") {
        summary = "visible=false | active_wiki=null";
    } else if (option === "wiki") {
        summary = `wiki_id=${summarizeValue(params[0], "trống")}`;
    } else if (option === "toast") {
        summary = `message=${summarizeValue(params[0], "trống")}`;
    } else if (option === "wiki_header") {
        summary = `header_id=${summarizeValue(params[0], "trống")}`;
    } else if (option === "playback_speed") {
        summary = `speed=${summarizeValue(params[0], "1")}`;
    } else if (params.length > 0) {
        summary = summarizeValue(params, "Không có tham số");
    }

    return {
        group: "UI",
        groupKey: "use_UI_function",
        actionIndex,
        functionName: action.function_name,
        title: optionLabel,
        summary,
        badgeBackground: "rgba(245, 158, 11, 0.18)",
        badgeColor: "#fcd34d",
    };
}

function summarizeCameraViewValue(value: unknown) {
    if (!value || typeof value !== "object") {
        return summarizeValue(value, "Không có state");
    }

    const row = value as Record<string, unknown>;
    const parts: string[] = [];

    if (Array.isArray(row.center) && row.center.length >= 2) {
        parts.push(`center=${summarizeValue(row.center)}`);
    }
    if (typeof row.zoom === "number") {
        parts.push(`zoom=${row.zoom.toFixed(2)}`);
    }
    if (typeof row.bearing === "number") {
        parts.push(`bearing=${row.bearing.toFixed(1)}`);
    }
    if (typeof row.pitch === "number") {
        parts.push(`pitch=${row.pitch.toFixed(1)}`);
    }

    return parts.length > 0 ? parts.join(" | ") : "Không có state";
}

function summarizeGeometryIdsValue(value: unknown) {
    if (!Array.isArray(value)) {
        return summarizeValue(value, "trống");
    }
    const ids = value
        .map((item) => (typeof item === "string" ? item.trim() : item == null ? "" : String(item).trim()))
        .filter((item) => item.length > 0);
    if (ids.length === 0) return "trống";
    return truncateText(ids.join(", "), 96);
}

function normalizeUiOptionValue(value: unknown): UIOptionName | null {
    switch (value) {
        case "timeline":
        case "layer_panel":
        case "wiki_panel":
        case "close_wiki_panel":
        case "zoom_panel":
        case "wiki":
        case "toast":
        case "wiki_header":
        case "playback_speed":
            return value;
        default:
            return null;
    }
}

function getUiActionDescriptor(action: {
    function_name: unknown;
    params: unknown[];
}) {
    const params = Array.isArray(action.params) ? action.params : [];

    if (action.function_name === "UI") {
        const option = normalizeUiOptionValue(params[0]);
        if (!option) return null;
        return {
            option,
            payload: params.slice(1),
        };
    }

    const option = normalizeUiOptionValue(action.function_name);
    if (!option) return null;
    return {
        option,
        payload: params,
    };
}

function summarizeValue(value: unknown, fallback = "trống") {
    if (value == null) return fallback;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? truncateText(trimmed, 96) : fallback;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return truncateText(JSON.stringify(value), 96);
    } catch {
        return fallback;
    }
}

function truncateText(value: string, maxLength: number) {
    return value.length > maxLength
        ? `${value.slice(0, Math.max(0, maxLength - 1))}…`
        : value;
}
