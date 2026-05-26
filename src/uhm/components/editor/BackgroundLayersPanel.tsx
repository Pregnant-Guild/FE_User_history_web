"use client";

import { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { persistBackgroundLayerVisibility } from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import {
    BACKGROUND_LAYER_OPTIONS,
    BackgroundLayerId,
    DEFAULT_BACKGROUND_LAYER_VISIBILITY,
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/map/styles/backgroundLayers";
import { GEO_TYPE_KEYS } from "@/uhm/lib/map/geo/geoTypeMap";
import { useEditorStore } from "@/uhm/store/editorStore";

type Props = {
    topContent?: ReactNode;
    width?: number;
};

export default function BackgroundLayersPanel({
    topContent,
    width = 240,
}: Props) {
    const {
        visibility,
        setBackgroundVisibility,
        geometryVisibility,
        setGeometryVisibility,
    } = useEditorStore(
        useShallow((state) => ({
            visibility: state.backgroundVisibility,
            setBackgroundVisibility: state.setBackgroundVisibility,
            geometryVisibility: state.geometryVisibility,
            setGeometryVisibility: state.setGeometryVisibility,
        }))
    );

    const updateBackgroundVisibility = (
        updater: (prev: typeof visibility) => typeof visibility
    ) => {
        setBackgroundVisibility((prev) => {
            const next = updater(prev);
            persistBackgroundLayerVisibility(next);
            return next;
        });
    };

    const handleToggleLayer = (id: BackgroundLayerId) => {
        updateBackgroundVisibility((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const handleShowAll = () => {
        updateBackgroundVisibility(() => ({ ...DEFAULT_BACKGROUND_LAYER_VISIBILITY }));
    };

    const handleHideAll = () => {
        updateBackgroundVisibility(() => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY }));
    };

    return (
        <aside
            className="no-scrollbar"
            style={{
                width,
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px" }}>
                {BACKGROUND_LAYER_OPTIONS.map((layer) => {
                    const on = Boolean(visibility[layer.id]);
                    return (
                        <button
                            key={layer.id}
                            type="button"
                            onClick={() => handleToggleLayer(layer.id)}
                            style={{
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                margin: 0,
                                cursor: "pointer",
                                color: on ? "#22c55e" : "#e5e7eb",
                                textDecorationLine: on ? "none" : "line-through",
                                textDecorationThickness: on ? undefined : "2px",
                                textDecorationColor: on ? undefined : "rgba(148, 163, 184, 0.7)",
                                fontSize: 13,
                                fontWeight: 750,
                                whiteSpace: "nowrap",
                            }}
                            title={on ? "On" : "Off"}
                        >
                            {layer.label}
                        </button>
                    );
                })}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                    type="button"
                    onClick={handleShowAll}
                    style={secondaryButtonStyle}
                >
                    Show all
                </button>
                <button
                    type="button"
                    onClick={handleHideAll}
                    style={secondaryButtonStyle}
                >
                    Hide all
                </button>
            </div>

            <>
                <div style={{ height: 1, background: "#1f2937", margin: "12px 0" }} />
                <div style={{ margin: 0, marginBottom: 10, fontWeight: 800, fontSize: 13, color: "#e5e7eb" }}>
                    Geometries
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px" }}>
                    {GEO_TYPE_KEYS.map((typeKey) => {
                        const on = geometryVisibility[typeKey] !== false;
                        return (
                            <button
                                key={typeKey}
                                type="button"
                                onClick={() => {
                                    setGeometryVisibility((prev) => ({
                                        ...prev,
                                        [typeKey]: prev[typeKey] === false,
                                    }));
                                }}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    padding: 0,
                                    margin: 0,
                                    cursor: "pointer",
                                    color: on ? "#22c55e" : "#e5e7eb",
                                    textDecorationLine: on ? "none" : "line-through",
                                    textDecorationThickness: on ? undefined : "2px",
                                    textDecorationColor: on ? undefined : "rgba(148, 163, 184, 0.7)",
                                    fontSize: 13,
                                    fontWeight: 750,
                                    whiteSpace: "nowrap",
                                    textTransform: "capitalize",
                                }}
                                title={on ? "On" : "Off"}
                            >
                                {typeKey.replaceAll("_", " ")}
                            </button>
                        );
                    })}
                </div>
            </>
        </aside>
    );
}

const secondaryButtonStyle = {
    border: "1px solid #334155",
    borderRadius: 6,
    background: "#0b1220",
    color: "#cbd5e1",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 8px",
} as const;
