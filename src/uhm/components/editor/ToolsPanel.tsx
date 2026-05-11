import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";
import { Panel } from "./Panel";
import { ModeHint } from "./ModeHint";

type ToolsPanelProps = {
    mode: EditorMode;
    setMode: (mode: EditorMode) => void;
    onUndo: () => void;
};

export function ToolsPanel({ mode, setMode, onUndo }: ToolsPanelProps) {
    const toggleMode = (newMode: EditorMode) => {
        if (mode === newMode) {
            setMode("idle");
        } else {
            setMode(newMode);
        }
    };

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

    return (
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
    );
}
