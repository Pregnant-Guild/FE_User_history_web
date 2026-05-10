"use client";

import { useState, type ReactNode } from "react";
import type { UndoAction } from "@/uhm/lib/useEditorState";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

type Props = {
    mode: EditorMode;
    setMode: (mode: EditorMode) => void;
    entityStatus?: string | null;
    onUndo: () => void;
    onCommit: () => void;
    onSubmit: (content: string) => void;
    onRestoreCommit: (commitId: string) => void;
    isSaving: boolean;
    isSubmitting: boolean;
    sectionTitle: string;
    sectionStatus: string;
    commitTitle: string;
    onCommitTitleChange: (title: string) => void;
    commitCount: number;
    hasHeadCommit: boolean;
    headCommitId: string | null;
    latestCommitLabel: string | null;
    commits: Array<{
        id: string;
        created_at?: string;
        edit_summary: string;
        user_id: string;
    }>;
    changesCount: number;
    undoStack: UndoAction[];
    createdEntities: Array<{
        id: string;
        name: string;
    }>;
    createdGeometries: Array<{
        id: string | number;
        geometryType: string;
        semanticType?: string | null;
        entityNames: string[];
    }>;
    width?: number;
};

export default function Editor({
    mode,
    setMode,
    entityStatus,
    onUndo,
    onCommit,
    onSubmit,
    onRestoreCommit,
    isSaving,
    isSubmitting,
    sectionTitle,
    sectionStatus,
    commitTitle,
    onCommitTitleChange,
    commitCount,
    hasHeadCommit,
    headCommitId,
    latestCommitLabel,
    commits,
    changesCount,
    undoStack,
    createdEntities,
    createdGeometries,
    width = 280,
}: Props) {
    const toggleMode = (newMode: EditorMode) => {
        if (mode === newMode) {
            setMode("idle");
        } else {
            setMode(newMode);
        }
    };

    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [submitContent, setSubmitContent] = useState("");

    const handleOpenSubmitModal = () => {
        setSubmitContent("");
        setIsSubmitModalOpen(true);
    };

    const handleConfirmSubmit = () => {
        setIsSubmitModalOpen(false);
        onSubmit(submitContent);
    };

    const handleCancelSubmit = () => {
        setIsSubmitModalOpen(false);
    };

    const recentUndoLabels = (() => {
        const seen = new Set<string>();
        const labels: string[] = [];
        for (let i = undoStack.length - 1; i >= 0 && labels.length < 8; i -= 1) {
            const label = formatUndoLabel(undoStack[i]);
            if (seen.has(label)) continue;
            seen.add(label);
            labels.push(label);
        }
        return labels.reverse();
    })();

    const formatCommitTitle = (commit: Props["commits"][number]) =>
        commit.edit_summary?.trim() || `Commit ${commit.id.slice(0, 8)}`;

    const modeButtonStyle = (btnMode: EditorMode) =>
        ({
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: mode === btnMode ? "#16a34a" : "#111827",
            color: "white",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 12,
            minHeight: 34,
            boxSizing: "border-box",
        }) as const;

    const primaryButtonStyle =
        ({
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontWeight: 850,
            fontSize: 12,
        }) as const;

    return (
        <div
            style={{
                width,
                height: "100vh",
                overflowY: "auto",
                background: "#0b1220",
                color: "white",
                padding: "12px 12px 20px",
                borderRight: "1px solid #1f2937",
            }}
        >
            <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#0b1220", paddingBottom: 10 }}>
                <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>Editor</div>

                <Panel title="Project" defaultOpen>
                    <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
                        <div style={{ color: "white", fontWeight: 850, overflowWrap: "anywhere" }}>{sectionTitle}</div>
                        <div style={{ marginTop: 6 }}>
                            Status: <span style={{ color: "#e2e8f0" }}>{sectionStatus}</span>
                        </div>
                        <div style={{ marginTop: 6 }}>
                            Commits: <span style={{ color: "#e2e8f0" }}>{commitCount}</span>
                        </div>
                        <div style={{ marginTop: 6 }}>
                            {latestCommitLabel ? (
                                <span style={{ color: "#e2e8f0" }}>{latestCommitLabel}</span>
                            ) : (
                                <span style={{ color: "#94a3b8" }}>Chưa có head commit</span>
                            )}
                        </div>
                    </div>
                </Panel>

                <Panel title="Tools" defaultOpen>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <button style={modeButtonStyle("select")} onClick={() => toggleMode("select")} title="Select">
                            Select
                        </button>
                        <button style={modeButtonStyle("draw")} onClick={() => toggleMode("draw")} title="Draw polygon">
                            Draw
                        </button>
                        <button style={modeButtonStyle("add-point")} onClick={() => setMode("add-point")} title="Add point">
                            Point
                        </button>
                        <button style={modeButtonStyle("add-line")} onClick={() => setMode("add-line")} title="Add line">
                            Line
                        </button>
                        <button style={modeButtonStyle("add-path")} onClick={() => setMode("add-path")} title="Add path">
                            Path
                        </button>
                        <button style={modeButtonStyle("add-circle")} onClick={() => setMode("add-circle")} title="Add circle">
                            Circle
                        </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                        Mode: <span style={{ color: "white", fontWeight: 850 }}>{mode}</span>
                    </div>
                    <ModeHint mode={mode} />

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <button
                            style={{
                                ...modeButtonStyle("idle"),
                                background: "#111827",
                            }}
                            onClick={() => setMode("idle")}
                            title="Tắt tool hiện tại"
                        >
                            Idle
                        </button>
                        <button
                            style={{
                                ...modeButtonStyle("idle"),
                                background: "#334155",
                            }}
                            onClick={onUndo}
                            title="Undo thao tác gần nhất"
                        >
                            Undo
                        </button>
                    </div>
                </Panel>

                {entityStatus ? (
                    <div
                        style={{
                            marginTop: 10,
                            padding: "10px",
                            background: "#111827",
                            borderRadius: 8,
                            border: "1px solid #7f1d1d",
                            color: "#fecaca",
                            fontSize: 12,
                            overflowWrap: "anywhere",
                        }}
                    >
                        {entityStatus}
                    </div>
                ) : null}
            </div>

            <Panel title="Commit" defaultOpen>
                <input
                    value={commitTitle}
                    onChange={(event) => onCommitTitleChange(event.target.value)}
                    placeholder="Edit Summary (Commit Title)"
                    disabled={isSaving || isSubmitting}
                    style={textInputStyle}
                />
                <button
                    style={{
                        ...primaryButtonStyle,
                        marginTop: 8,
                        background: isSaving || isSubmitting || changesCount <= 0 ? "#475569" : "#0f766e",
                        cursor: isSaving || isSubmitting || changesCount <= 0 ? "not-allowed" : "pointer",
                        opacity: changesCount <= 0 ? 0.75 : 1,
                    }}
                    onClick={onCommit}
                    disabled={isSaving || isSubmitting || changesCount <= 0}
                    title={changesCount <= 0 ? "Khong co thay doi de commit" : undefined}
                >
                    Commit ({changesCount})
                </button>
                <button
                    style={{
                        ...primaryButtonStyle,
                        marginTop: 8,
                        background: isSubmitting || !hasHeadCommit ? "#475569" : "#16a34a",
                        cursor: isSubmitting || !hasHeadCommit ? "not-allowed" : "pointer",
                        opacity: !hasHeadCommit ? 0.6 : 1,
                    }}
                    onClick={handleOpenSubmitModal}
                    disabled={isSubmitting || !hasHeadCommit}
                >
                    Submit
                </button>
            </Panel>

            <Panel title="Commit History" badge={String(commits.length)} defaultOpen={false}>
                {commits.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: 12 }}>Chưa có commit</div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}>
                        {commits.slice(0, 8).map((commit) => {
                            const isHead = Boolean(headCommitId && commit.id === headCommitId);
                            return (
                                <li
                                    key={commit.id}
                                    style={{
                                        padding: "8px 0",
                                        borderBottom: "1px solid #1f2937",
                                        color: "#e2e8f0",
                                        display: "flex",
                                        flexDirection: "row"
                                    }}
                                >
                                    <div style={{flex:1}}>
                                        <div
                                            title={formatCommitTitle(commit)}
                                            style={{
                                                fontWeight: 750,
                                                color: "#f8fafc",
                                                overflowWrap: "anywhere",
                                            }}
                                        >
                                            {formatCommitTitle(commit)}
                                        </div>
                                        <div style={{ marginTop: 3, color: "#94a3b8" }}>
                                            {commit.created_at ? new Date(commit.created_at).toLocaleString() : ""}
                                        </div>
                                    </div>

                                    <button
                                        style={{
                                            marginTop: 6,
                                            padding: "6px 8px",
                                            borderRadius: 6,
                                            border: "1px solid #334155",
                                            background: isHead ? "#0b1220" : "#334155",
                                            color: "white",
                                            cursor: isSaving || isSubmitting || isHead ? "not-allowed" : "pointer",
                                            opacity: isHead ? 0.65 : 1,
                                            fontWeight: 800,
                                            fontSize: 12,
                                        }}
                                        onClick={() => onRestoreCommit(commit.id)}
                                        disabled={isSaving || isSubmitting || isHead}
                                        title={isHead ? "Đang là head commit" : "Restore snapshot từ commit này (FE-only)"}
                                    >
                                        Restore
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>

            <Panel title="Undo List" badge={String(recentUndoLabels.length)} defaultOpen={false}>
                {recentUndoLabels.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Chưa có thao tác</div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13, color: "#e2e8f0" }}>
                        {recentUndoLabels.map((label, idx) => (
                            <li key={`${label}-${idx}`} style={{ padding: "6px 0", borderBottom: "1px solid #1f2937" }}>
                                {label}
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            <Panel title="This Session" defaultOpen={false}>
                <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                    Entities ({createdEntities.length})
                </div>
                {createdEntities.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>Chưa tạo entity mới</div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12, marginBottom: 10 }}>
                        {createdEntities.map((entity) => (
                            <li
                                key={entity.id}
                                style={{ padding: "6px 0", borderBottom: "1px solid #1f2937", color: "#e2e8f0" }}
                                title={entity.id}
                            >
                                {entity.name}
                            </li>
                        ))}
                    </ul>
                )}

                <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                    Geometries mới chưa commit ({createdGeometries.length})
                </div>
                {createdGeometries.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: 12 }}>Chưa có geometry mới chờ commit</div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}>
                        {createdGeometries.map((geometry) => (
                            <li
                                key={String(geometry.id)}
                                style={{ padding: "6px 0", borderBottom: "1px solid #1f2937", color: "#e2e8f0" }}
                            >
                                #{geometry.id} [{geometry.geometryType}]{" "}
                                {geometry.semanticType ? `- ${geometry.semanticType}` : ""}
                                {geometry.entityNames.length ? ` | ${geometry.entityNames.join(", ")}` : ""}
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            {isSubmitModalOpen && (
                <div style={{
                    position: "fixed",
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000
                }}>
                    <div style={{
                        background: "#0b1220",
                        padding: 20,
                        borderRadius: 8,
                        border: "1px solid #334155",
                        width: 400,
                        color: "white"
                    }}>
                        <h3 style={{ marginTop: 0 }}>Nội dung Submit</h3>
                        <textarea
                            value={submitContent}
                            onChange={(e) => setSubmitContent(e.target.value)}
                            placeholder="Nhập nội dung submit..."
                            style={{ ...textAreaStyle, height: 100 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 15 }}>
                            <button onClick={handleCancelSubmit} style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", border: "1px solid #334155", background: "transparent", color: "white" }}>Hủy</button>
                            <button onClick={handleConfirmSubmit} style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", border: "none", background: "#16a34a", color: "white", fontWeight: "bold" }}>Gửi Submit</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const textInputStyle = {
    width: "100%",
    marginTop: 0,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box",
    fontSize: 13,
    outline: "none",
} as const;

const textAreaStyle = {
    ...textInputStyle,
    marginTop: 8,
    resize: "vertical",
    fontFamily: "inherit",
} as const;

function Panel({
    title,
    badge,
    defaultOpen,
    children,
}: {
    title: string;
    badge?: string | null;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    return (
        <details
            open={Boolean(defaultOpen)}
            style={{
                marginTop: 10,
                padding: 10,
                background: "#111827",
                borderRadius: 8,
                border: "1px solid #1f2937",
            }}
        >
            <summary
                style={{
                    cursor: "pointer",
                    listStyle: "none",
                    fontWeight: 900,
                    fontSize: 13,
                    color: "white",
                    userSelect: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <span>{title}</span>
                {badge ? (
                    <span
                        style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #334155",
                            background: "#0b1220",
                            color: "#cbd5e1",
                            fontSize: 12,
                            fontWeight: 850,
                            flex: "0 0 auto",
                        }}
                    >
                        {badge}
                    </span>
                ) : null}
            </summary>
            <div style={{ marginTop: 10 }}>{children}</div>
        </details>
    );
}

function ModeHint({ mode }: { mode: EditorMode }) {
    if (mode === "add-line" || mode === "add-path") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Click để thêm điểm, Enter để hoàn tất, Esc để hủy.
            </div>
        );
    }
    if (mode === "add-circle") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Giữ chuột trái kéo để mở bán kính, thả chuột để hoàn tất.
            </div>
        );
    }
    if (mode === "add-point") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Chọn 1 điểm trên bản đồ để đặt địa điểm.
            </div>
        )
    }
    if (mode === "select") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Chọn 1 hình, đường, điểm trên bản đồ để xem chi tiết.
            </div>
        )
    }
    if (mode === "draw") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Chọn các điểm trên bản đồ để vẽ hình, ENTER để kết thúc, ESC để hủy.
            </div>
        )
    }
    return null;
}

function formatUndoLabel(action: UndoAction) {
    switch (action.type) {
        case "create":
            return `Thêm mới #${action.id}`;
        case "delete":
            return `Xóa #${action.feature.properties.id}`;
        case "update":
            return `Chỉnh sửa #${action.id}`;
        case "properties":
            return `Cập nhật thuộc tính #${action.id}`;
        case "snapshot_entities":
        case "snapshot_wikis":
        case "snapshot_entity_wiki":
            return action.label;
        default:
            return "Tác vụ";
    }
}
