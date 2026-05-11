"use client";

import { ReactNode } from "react";
import {
    BACKGROUND_LAYER_OPTIONS,
    BackgroundLayerId,
    BackgroundLayerVisibility,
} from "@/uhm/lib/backgroundLayers";
import { GEO_TYPE_KEYS } from "@/uhm/lib/geoTypeMap";

type Props = {
    visibility: BackgroundLayerVisibility;
    onToggleLayer: (id: BackgroundLayerId) => void;
    onShowAll: () => void;
    onHideAll: () => void;
    geometryVisibility?: Record<string, boolean>;
    onToggleGeometryType?: (typeKey: string) => void;
    topContent?: ReactNode;
    width?: number;
};

export default function BackgroundLayersPanel({
    visibility,
    onToggleLayer,
    onShowAll,
    onHideAll,
    geometryVisibility,
    onToggleGeometryType,
    topContent,
    width = 240,
}: Props) {
    return (
        <aside
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
                            onClick={() => onToggleLayer(layer.id)}
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

            {geometryVisibility && onToggleGeometryType ? (
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
                                    onClick={() => onToggleGeometryType(typeKey)}
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
            ) : null}
        </aside>
    );
}
