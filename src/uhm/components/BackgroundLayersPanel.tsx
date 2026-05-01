"use client";

import { ReactNode } from "react";
import {
    BACKGROUND_LAYER_OPTIONS,
    BackgroundLayerId,
    BackgroundLayerVisibility,
} from "@/uhm/lib/backgroundLayers";

type Props = {
    visibility: BackgroundLayerVisibility;
    onToggleLayer: (id: BackgroundLayerId) => void;
    onShowAll: () => void;
    onHideAll: () => void;
    topContent?: ReactNode;
};

export default function BackgroundLayersPanel({
    visibility,
    onToggleLayer,
    onShowAll,
    onHideAll,
    topContent,
}: Props) {
    return (
        <aside
            style={{
                width: "240px",
                background: "#111827",
                color: "#e5e7eb",
                borderLeft: "1px solid #1f2937",
                padding: "12px",
                height: "100vh",
                overflowY: "auto",
            }}
        >
            {topContent ? <div style={{ marginBottom: "12px" }}>{topContent}</div> : null}

            <h3 style={{ margin: 0, marginBottom: "10px" }}>Map Layers</h3>

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button
                    onClick={onShowAll}
                    style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        cursor: "pointer",
                        background: "#374151",
                        color: "#f9fafb",
                    }}
                >
                    Bật hết
                </button>
                <button
                    onClick={onHideAll}
                    style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        cursor: "pointer",
                        background: "#1f2937",
                        color: "#f9fafb",
                    }}
                >
                    Tắt hết
                </button>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
                {BACKGROUND_LAYER_OPTIONS.map((layer) => (
                    <label
                        key={layer.id}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "14px",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={visibility[layer.id]}
                            onChange={() => onToggleLayer(layer.id)}
                        />
                        <span>{layer.label}</span>
                    </label>
                ))}
            </div>
        </aside>
    );
}
