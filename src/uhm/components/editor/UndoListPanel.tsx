import type { UndoAction } from "@/uhm/lib/editor/state/useEditorState";
import { Panel } from "./Panel";

type UndoListPanelProps = {
    undoStack: UndoAction[];
};

export function UndoListPanel({ undoStack }: UndoListPanelProps) {
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

    return (
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
    );
}

export function formatUndoLabel(action: UndoAction) {
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
        case "replay":
        case "replays":
        case "replay_session":
        case "group":
            return action.label;
        default:
            return "Tác vụ";
    }
}
