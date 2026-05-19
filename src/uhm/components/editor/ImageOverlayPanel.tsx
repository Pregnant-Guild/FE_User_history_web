"use client";

import type { ChangeEvent } from "react";
import type { MapImageOverlay } from "@/uhm/components/map/imageOverlay";

type Props = {
    overlay: MapImageOverlay | null;
    onPickImage: (file: File | null) => void;
    onPasteImage: () => void;
    keyboardEnabled: boolean;
    onKeyboardEnabledChange: (enabled: boolean) => void;
    onOpacityChange: (opacity: number) => void;
    onRemove: () => void;
};

export default function ImageOverlayPanel({
    overlay,
    onPickImage,
    onPasteImage,
    keyboardEnabled,
    onKeyboardEnabledChange,
    onOpacityChange,
    onRemove,
}: Props) {
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        onPickImage(file);
        event.target.value = "";
    };

    return (
        <section style={{ padding: 10, background: "#0b1220", borderRadius: 8, border: "1px solid #1f2937" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>Trace Image</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: "#94a3b8" }}>
                        Chuột phải kéo điểm vàng để di chuyển, điểm xanh để kéo dãn giữ ratio.
                        {keyboardEnabled ? " WASD di chuyển, Q/E phóng to/thu nhỏ." : ""}
                    </div>
                </div>
                {overlay ? (
                    <button type="button" onClick={onRemove} style={dangerButtonStyle}>
                        Remove
                    </button>
                ) : null}
            </div>

            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <label style={uploadButtonStyle}>
                    {overlay ? "Đổi ảnh" : "Thêm ảnh"}
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                    />
                </label>
                <button type="button" onClick={onPasteImage} style={uploadButtonStyle}>
                    Paste ảnh
                </button>
                <button
                    type="button"
                    onClick={() => onKeyboardEnabledChange(!keyboardEnabled)}
                    disabled={!overlay}
                    style={{
                        ...uploadButtonStyle,
                        opacity: overlay ? 1 : 0.5,
                        color: keyboardEnabled ? "#86efac" : "#93c5fd",
                        cursor: overlay ? "pointer" : "not-allowed",
                    }}
                    title="Bật/tắt điều khiển ảnh bằng WASD và Q/E"
                >
                    Keys: {keyboardEnabled ? "On" : "Off"}
                </button>
            </div>

            {overlay ? (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#cbd5e1", overflowWrap: "anywhere" }}>
                        {overlay.name}
                    </div>
                    <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#cbd5e1" }}>
                        <span>Opacity: {Math.round(overlay.opacity * 100)}%</span>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={overlay.opacity}
                            onChange={(event) => onOpacityChange(Number(event.target.value))}
                            style={{ width: "100%", accentColor: "#38bdf8" }}
                        />
                    </label>
                </div>
            ) : (
                <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                    Chưa có ảnh overlay.
                </div>
            )}
        </section>
    );
}

const uploadButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #334155",
    borderRadius: 6,
    background: "#111827",
    color: "#93c5fd",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    padding: "7px 10px",
} as const;

const dangerButtonStyle = {
    border: "1px solid #7f1d1d",
    borderRadius: 6,
    background: "#1f1111",
    color: "#fecaca",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    padding: "6px 8px",
} as const;
