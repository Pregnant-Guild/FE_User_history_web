"use client";

import { UndoAction } from "@/uhm/lib/useEditorState";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

type Props = {
    mode: EditorMode;
    setMode: (mode: EditorMode) => void;
    entityStatus?: string | null;
    onUndo: () => void;
    onCommit: () => void;
    onSubmit: () => void;
    onRestoreCommit: (commitId: string) => void;
    isSaving: boolean;
    isSubmitting: boolean;
    sectionTitle: string;
    sectionStatus: string;
    commitTitle: string;
    commitNote: string;
    onCommitTitleChange: (title: string) => void;
    onCommitNoteChange: (note: string) => void;
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
        type_id?: string | null;
    }>;
    createdGeometries: Array<{
        id: string | number;
        geometryType: string;
        semanticType?: string | null;
        entityNames: string[];
    }>;
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
                                   commitNote,
                                   onCommitTitleChange,
                                   onCommitNoteChange,
                                   commitCount,
                                   hasHeadCommit,
                                   headCommitId,
                                   latestCommitLabel,
                                   commits,
                                   changesCount,
                               undoStack,
                               createdEntities,
                               createdGeometries,
                           }: Props) {
    const formatCommitTitle = (commit: Props["commits"][number]) =>
        commit.edit_summary?.trim() || `Commit ${commit.id.slice(0, 8)}`;

    const toggleMode = (newMode: EditorMode) => {
        if (mode === newMode) {
            setMode("idle"); // bấm lại → tắt
        } else {
            setMode(newMode); // chuyển mode
        }
    };

    // Lấy tối đa 8 tác vụ mới nhất, bỏ trùng nhãn (cùng loại/cùng id)
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

    const getButtonStyle = (btnMode: EditorMode) => ({
        width: "100%",
        padding: "8px",
        marginBottom: "6px",
        border: "none",
        cursor: "pointer",
        background: mode === btnMode ? "#4caf50" : "#222",
        color: "white",
        borderRadius: "4px",
    });

    return (
        <div
            style={{
                width: "220px",
                height: "100vh",
                overflowY: "auto",
                background: "#111",
                color: "white",
                padding: "12px",
                borderRight: "1px solid #333",
            }}
        >
            <h3 style={{ marginBottom: "10px" }}>Editor</h3>

            <div
                style={{
                    marginBottom: "12px",
                    padding: "10px",
                    background: "#0b1220",
                    borderRadius: "6px",
                    border: "1px solid #1f2937",
                    fontSize: "12px",
                    color: "#cbd5e1",
                }}
            >
                <div style={{ color: "white", fontWeight: 600 }}>{sectionTitle}</div>
                <div style={{ marginTop: "4px" }}>Status: {sectionStatus}</div>
                <div>Commits: {commitCount}</div>
                <div>{latestCommitLabel || "Chưa có commit"}</div>
            </div>

            <div
                style={{
                    marginBottom: "12px",
                    padding: "10px",
                    background: "#0b1220",
                    borderRadius: "6px",
                    border: "1px solid #1f2937",
                    fontSize: "12px",
                    color: "#cbd5e1",
                }}
            >
                <div style={{ marginBottom: "8px", fontWeight: 600, color: "white" }}>Project</div>
            </div>

            <button
                style={getButtonStyle("draw")}
                onClick={() => toggleMode("draw")}
            >
                Draw
            </button>

            <button
                style={getButtonStyle("select")}
                onClick={() => toggleMode("select")}
            >
                Select
            </button>

            <button
                style={getButtonStyle("idle")}
                onClick={() => setMode("idle")}
            >
                Idle
            </button>

            <button
                style={getButtonStyle("add-point")}
                onClick={() => setMode("add-point")}
            >
                Add point
            </button>

            <button
                style={getButtonStyle("add-line")}
                onClick={() => setMode("add-line")}
            >
                Add line
            </button>

            <button
                style={getButtonStyle("add-path")}
                onClick={() => setMode("add-path")}
            >
                Add path
            </button>

            <button
                style={getButtonStyle("add-circle")}
                onClick={() => setMode("add-circle")}
            >
                Add circle
            </button>

            <div style={{ marginTop: "12px", fontSize: "14px" }}>
                Mode: <b>{mode}</b>
            </div>
            {mode === "add-line" ? (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#93c5fd" }}>
                    Click để thêm điểm, Enter để hoàn tất, Esc để hủy.
                </div>
            ) : null}
            {mode === "add-path" ? (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#93c5fd" }}>
                    Click để thêm điểm, Enter để hoàn tất, Esc để hủy.
                </div>
            ) : null}
            {mode === "add-circle" ? (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#93c5fd" }}>
                    Giữ chuột trái kéo để mở bán kính, thả chuột để hoàn tất.
                </div>
            ) : null}

            {entityStatus ? (
                <div
                    style={{
                        marginTop: "12px",
                        padding: "10px",
                        background: "#0b1220",
                        borderRadius: "6px",
                        border: "1px solid #1f2937",
                        color: "#fca5a5",
                        fontSize: "12px",
                    }}
                >
                    {entityStatus}
                </div>
            ) : null}

            <div style={{ marginTop: "12px" }}>
                <button
                    style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background: "#334155",
                        color: "white",
                    }}
                    onClick={onUndo}
                >
                    Undo
                </button>
            </div>
            <input
                value={commitTitle}
                onChange={(event) => onCommitTitleChange(event.target.value)}
                placeholder="Commit title"
                disabled={isSaving || isSubmitting}
                style={{
                    width: "100%",
                    marginTop: "8px",
                    padding: "7px",
                    borderRadius: "4px",
                    border: "1px solid #334155",
                    background: "#111827",
                    color: "white",
                    boxSizing: "border-box",
                }}
            />
            <textarea
                value={commitNote}
                onChange={(event) => onCommitNoteChange(event.target.value)}
                placeholder="Commit note"
                disabled={isSaving || isSubmitting}
                rows={3}
                style={{
                    width: "100%",
                    marginTop: "8px",
                    padding: "7px",
                    borderRadius: "4px",
                    border: "1px solid #334155",
                    background: "#111827",
                    color: "white",
                    boxSizing: "border-box",
                    resize: "vertical",
                    fontFamily: "inherit",
                }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 68px", gap: "8px", marginTop: "8px" }}>
                <button
                    style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "none",
                        cursor: isSaving || isSubmitting ? "not-allowed" : "pointer",
                        background: isSaving || isSubmitting ? "#555" : "#0f766e",
                        color: "white",
                    }}
                    onClick={onCommit}
                    disabled={isSaving || isSubmitting}
                >
                    Commit ({changesCount})
                </button>
                <div />
            </div>
            <button
                style={{
                    width: "100%",
                    marginTop: "8px",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "none",
                    cursor: isSubmitting || !hasHeadCommit ? "not-allowed" : "pointer",
                    background: isSubmitting || !hasHeadCommit ? "#555" : "#16a34a",
                    color: "white",
                    opacity: !hasHeadCommit ? 0.6 : 1,
                }}
                onClick={onSubmit}
                disabled={isSubmitting || !hasHeadCommit}
            >
                Submit
            </button>

            <div
                style={{
                    marginTop: "16px",
                    padding: "10px",
                    background: "#0b1220",
                    borderRadius: "6px",
                    border: "1px solid #1f2937",
                }}
            >
                <div style={{ marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                    Commit history
                </div>
                {commits.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: "12px" }}>
                        Chưa có commit
                    </div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "12px" }}>
                        {commits.slice(0, 8).map((commit) => (
                            <li
                                key={commit.id}
                                style={{
                                    padding: "6px 0",
                                    borderBottom: "1px solid #1f2937",
                                    color: "#e2e8f0",
                                }}
                            >
                                <div
                                    title={formatCommitTitle(commit)}
                                    style={{
                                        fontWeight: 600,
                                        color: "#f8fafc",
                                        overflowWrap: "anywhere",
                                    }}
                                >
                                    {formatCommitTitle(commit)}
                                </div>
                                <div style={{ marginTop: "2px", color: "#94a3b8" }}>
                                    {commit.created_at ? new Date(commit.created_at).toLocaleString() : ""}
                                </div>
                                <button
                                    style={{
                                        marginTop: "4px",
                                        padding: "4px 6px",
                                        borderRadius: "4px",
                                        border: "none",
                                        background: "#334155",
                                        color: "white",
                                        cursor: isSaving || isSubmitting ? "not-allowed" : "pointer",
                                    }}
                                    onClick={() => onRestoreCommit(commit.id)}
                                    disabled={isSaving || isSubmitting}
                                >
                                    Restore
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div
                style={{
                    marginTop: "16px",
                    padding: "10px",
                    background: "#0b1220",
                    borderRadius: "6px",
                    border: "1px solid #1f2937",
                }}
            >
                <div style={{ marginBottom: "6px", fontWeight: 600, fontSize: "14px" }}>
                    Tác vụ có thể undo ({recentUndoLabels.length})
                </div>
                {recentUndoLabels.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: "13px" }}>Chưa có thao tác</div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "13px", color: "#e2e8f0" }}>
                        {recentUndoLabels.map((label, idx) => (
                            <li key={`${label}-${idx}`} style={{ padding: "4px 0", borderBottom: "1px solid #1f2937" }}>
                                {label}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div
                style={{
                    marginTop: "16px",
                    padding: "10px",
                    background: "#0b1220",
                    borderRadius: "6px",
                    border: "1px solid #1f2937",
                }}
            >
                <div style={{ marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                    Mới tạo trong phiên
                </div>

                <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>
                    Entities ({createdEntities.length})
                </div>
                {createdEntities.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "10px" }}>
                        Chưa tạo entity mới
                    </div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "12px", marginBottom: "10px" }}>
                        {createdEntities.map((entity) => (
                            <li
                                key={entity.id}
                                style={{
                                    padding: "4px 0",
                                    borderBottom: "1px solid #1f2937",
                                    color: "#e2e8f0",
                                }}
                                title={entity.id}
                            >
                                {entity.name} ({entity.type_id || "country"})
                            </li>
                        ))}
                    </ul>
                )}

                <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>
                    Geometries mới chưa commit ({createdGeometries.length})
                </div>
                {createdGeometries.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: "12px" }}>
                        Chưa có geometry mới chờ commit
                    </div>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "12px" }}>
                        {createdGeometries.map((geometry) => (
                            <li
                                key={String(geometry.id)}
                                style={{
                                    padding: "4px 0",
                                    borderBottom: "1px solid #1f2937",
                                    color: "#e2e8f0",
                                }}
                            >
                                #{geometry.id} [{geometry.geometryType}] {geometry.semanticType ? `- ${geometry.semanticType}` : ""}
                                {geometry.entityNames.length ? ` | ${geometry.entityNames.join(", ")}` : ""}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

        </div>
    );
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
        default:
            return "Tác vụ";
    }
}
