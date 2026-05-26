"use client";

import type { CSSProperties } from "react";
import type { DialogState } from "@/uhm/types/projects";
import type { ReplayPreviewToast } from "@/uhm/lib/replay/useReplayPreview";

type Props = {
    isPreviewMode: boolean;
    isPlaying: boolean;
    dialog: DialogState | null;
    toasts: ReplayPreviewToast[];
    sidebarOpen: boolean;
    playbackSpeed: number;
    activeStepLabel: string | null;
    activeStepNumber: number | null;
    totalSteps: number;
    onPlayPreview: () => void;
    onStopPreview: () => void;
    onResetPreview: () => void;
    onExitPreview: () => void;
};

export default function ReplayPreviewOverlay({
    isPreviewMode,
    isPlaying,
    dialog,
    toasts,
    sidebarOpen,
    playbackSpeed,
    activeStepLabel,
    activeStepNumber,
    totalSteps,
    onPlayPreview,
    onStopPreview,
    onResetPreview,
    onExitPreview,
}: Props) {
    const hasWikiPreview = sidebarOpen;
    const shouldRender =
        isPreviewMode ||
        isPlaying ||
        Boolean(dialog) ||
        Boolean(toasts.length);

    if (!shouldRender) {
        return null;
    }

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 15,
                pointerEvents: "none",
            }}
        >
            {toasts.length ? (
                <div
                    style={{
                        position: "absolute",
                        top: 72,
                        right: hasWikiPreview ? 454 : 18,
                        display: "grid",
                        gap: 8,
                        width: 280,
                    }}
                >
                    {toasts.map((toast) => (
                        <div
                            key={toast.id}
                            style={{
                                borderRadius: 14,
                                border: "1px solid rgba(56, 189, 248, 0.28)",
                                background: "rgba(8, 47, 73, 0.9)",
                                color: "#e0f2fe",
                                padding: "12px 14px",
                                fontSize: 13,
                                lineHeight: 1.4,
                                boxShadow: "0 10px 26px rgba(2, 6, 23, 0.32)",
                            }}
                        >
                            {toast.message}
                        </div>
                    ))}
                </div>
            ) : null}

            {dialog && (dialog.text?.trim() || dialog.image_url?.trim()) ? (
                <div
                    style={{
                        position: "absolute",
                        right: hasWikiPreview ? 472 : 18,
                        bottom: 96,
                        width: 380,
                        borderRadius: 20,
                        overflow: "hidden",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "rgba(11, 18, 32, 0.85)",
                        backdropFilter: "blur(12px)",
                        boxShadow: "0 16px 44px rgba(2, 6, 23, 0.42)",
                        pointerEvents: "auto",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    {dialog.image_url?.trim() ? (
                        <img
                            src={dialog.image_url}
                            alt="Historical"
                            style={{
                                width: "100%",
                                display: "block",
                                maxHeight: 220,
                                objectFit: "cover",
                                background: "#020617",
                            }}
                        />
                    ) : null}
                    {dialog.text?.trim() ? (
                        <div
                            className="ql-editor"
                            style={{
                                padding: "16px",
                                color: "#f8fafc",
                                fontSize: "14px",
                                lineHeight: "1.6",
                                overflowY: "auto",
                                maxHeight: "250px",
                                background: "transparent",
                            }}
                            dangerouslySetInnerHTML={{ __html: dialog.text }}
                        />
                    ) : null}
                </div>
            ) : null}

            {isPreviewMode ? (
                <div
                    style={{
                        position: "absolute",
                        top: 64,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "min(520px, calc(100% - 72px))",
                        borderRadius: 18,
                        border: "1px solid rgba(148, 163, 184, 0.24)",
                        background: "rgba(15, 23, 42, 0.9)",
                        color: "#e2e8f0",
                        padding: "12px 14px",
                        boxShadow: "0 12px 32px rgba(2, 6, 23, 0.3)",
                        pointerEvents: "auto",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        background: "rgba(34, 197, 94, 0.2)",
                                        color: "#86efac",
                                        fontWeight: 900,
                                        fontSize: 11,
                                        letterSpacing: 0.3,
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Preview
                                </span>
                                {activeStepLabel ? (
                                    <span
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 800,
                                            color: "#f8fafc",
                                            overflowWrap: "anywhere",
                                        }}
                                    >
                                        {activeStepLabel}
                                    </span>
                                ) : null}
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                    x{playbackSpeed.toFixed(2)}
                                </span>
                            </div>
                            {totalSteps > 0 ? (
                                <div style={{ display: "grid", gap: 6 }}>
                                    <div
                                        style={{
                                            width: "100%",
                                            height: 6,
                                            borderRadius: 999,
                                            background: "rgba(51, 65, 85, 0.8)",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${Math.max(0, Math.min(100, ((activeStepNumber || 0) / totalSteps) * 100))}%`,
                                                height: "100%",
                                                borderRadius: 999,
                                                background: "linear-gradient(90deg, #22c55e, #38bdf8)",
                                                transition: "width 180ms ease",
                                            }}
                                        />
                                    </div>
                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                        Step {activeStepNumber || 0}/{totalSteps}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                            {isPlaying ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={onStopPreview}
                                        style={previewButtonStyle("#7f1d1d")}
                                    >
                                        Dừng
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onResetPreview}
                                        style={previewButtonStyle("#1e3a8a")}
                                    >
                                        Reset
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onPlayPreview}
                                    style={previewButtonStyle("#166534")}
                                >
                                    Phát lại
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onExitPreview}
                                style={previewButtonStyle("#334155")}
                            >
                                Thoát preview
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function previewButtonStyle(background: string): CSSProperties {
    return {
        border: "none",
        background,
        color: "white",
        borderRadius: 10,
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 800,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
    };
}
