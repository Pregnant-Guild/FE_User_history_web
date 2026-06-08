"use client";

import type { BackgroundLayerId } from "@/uhm/lib/map/styles/backgroundLayers";
import { BACKGROUND_LAYER_OPTIONS } from "@/uhm/lib/map/styles/backgroundLayers";

type Props = {
    backgroundVisibility: Record<string, boolean>;
    geometryVisibility: Record<string, boolean>;
    onToggleBackground: (id: BackgroundLayerId) => void;
    onToggleGeometry: (typeKey: string) => void;
    onHide?: () => void;
};

// Map each layer ID/geometry type to a premium inline SVG icon
const LAYER_ICONS: Record<string, React.ReactNode> = {
    // Background layers
    "raster-base-layer": (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    ),
    "bg-country-borders-line": (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 6h18M3 18h18" strokeDasharray="2 2" />
            <rect x="2" y="2" width="20" height="20" rx="4" />
        </svg>
    ),
    "bg-province-borders-line": (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeDasharray="3 3" />
            <rect x="2" y="2" width="20" height="20" rx="3" />
        </svg>
    ),
    "bg-district-borders-line": (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v18M12 3v18M18 3v18M3 6h18M3 12h18M3 18h18" strokeDasharray="1 3" />
            <rect x="2" y="2" width="20" height="20" rx="2" />
        </svg>
    ),
    "country-labels": (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
    ),
    "rivers-line": (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12c3-3 6-3 9 0s6 3 9 0" />
            <path d="M3 16c3-3 6-3 9 0s6 3 9 0" opacity="0.6" />
        </svg>
    ),

    // Polygon Geometries
    country: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
        </svg>
    ),
    state: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 4 20 9 20 15 12 20 4 15 4 9" />
        </svg>
    ),
    faction: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
        </svg>
    ),
    rebellion_zone: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
    ),

    // Line Geometries
    defense_line: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M12 2v9M8 5v3M16 5v3" />
        </svg>
    ),
    military_route: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 17.5L3 6M17.5 14.5L6 3" />
            <path d="M12 12l9 9M18 15h3v3" />
        </svg>
    ),
    retreat_route: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
    ),
    migration_route: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    trade_route: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12" />
        </svg>
    ),

    // Point Geometries
    battle: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 17.5L3 6M17.5 14.5L6 3" />
            <path d="M8.5 19.5L19.5 8.5" />
        </svg>
    ),
    person_event: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    ),
    temple: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7h20L12 2zM4 7v10h16V7H4zm2 10v4h2v-4H6zm10 0v4h2v-4h-2z" />
        </svg>
    ),
    capital: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="12 7 13.9 10.8 18.1 11.4 15.1 14.4 15.8 18.6 12 16.6 8.2 18.6 8.9 14.4 5.9 11.4 10.1 10.8" fill="currentColor" />
        </svg>
    ),
    city: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <line x1="9" y1="22" x2="9" y2="16" />
            <line x1="15" y1="22" x2="15" y2="16" />
            <line x1="9" y1="16" x2="15" y2="16" />
            <path d="M8 6h2M14 6h2M8 10h2M14 10h2" strokeWidth="1.5" />
        </svg>
    ),
    fortification: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22V8l3-3h10l3 3v14H4z" />
            <path d="M9 22v-6h6v6H9z" />
            <path d="M8 8h8M12 5v3" />
        </svg>
    ),
    ruin: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="20" x2="6" y2="4" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="3" y1="4" x2="9" y2="4" />
            <line x1="15" y1="4" x2="21" y2="4" />
            <line x1="3" y1="20" x2="21" y2="20" />
            <line x1="6" y1="12" x2="18" y2="12" strokeDasharray="3 3" />
        </svg>
    ),
    port: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3" />
            <line x1="12" y1="22" x2="12" y2="8" />
            <path d="M5 12h14M12 12c-4 0-6 4-6 6a6 6 0 0 0 12 0c0-2-2-6-6-6z" />
        </svg>
    ),
};

export default function ReplayPreviewLayerPanel({
    backgroundVisibility,
    geometryVisibility,
    onToggleBackground,
    onToggleGeometry,
    onHide,
}: Props) {
    // Categorize geometry types for logical grouping
    const polygonKeys = ["country", "state", "faction", "rebellion_zone"];
    const lineKeys = ["defense_line", "military_route", "retreat_route", "migration_route", "trade_route"];
    const pointKeys = ["battle", "person_event", "temple", "capital", "city", "fortification", "ruin", "port"];

    const getButtonStyles = (isActive: boolean, activeColor: string): React.CSSProperties => ({
        border: "none",
        background: isActive ? `rgba(${activeColor}, 0.18)` : "rgba(30, 41, 59, 0.4)",
        color: isActive ? `rgb(${activeColor})` : "#64748b",
        width: 36,
        height: 36,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: isActive ? `inset 0 0 0 1px rgba(${activeColor}, 0.3), 0 0 12px rgba(${activeColor}, 0.2)` : "inset 0 0 0 1px rgba(148, 163, 184, 0.1)",
        outline: "none",
    });

    const renderStyles = () => (
        <style dangerouslySetInnerHTML={{ __html: `
            .replay-preview-layer-panel-scroll::-webkit-scrollbar {
                display: none;
            }
            .replay-preview-layer-panel-scroll {
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
        `}} />
    );

    return (
        <div
            className="replay-preview-layer-panel"
            style={{
                display: "flex",
                flexDirection: "column",
                background: "linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8))",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                borderRadius: 20,
                padding: "14px 10px",
                width: 58,
                boxSizing: "border-box",
                alignItems: "center",
                boxShadow: "0 20px 48px rgba(2, 6, 23, 0.45)",
                backdropFilter: "blur(12px)",
                maxHeight: "100%",
                overflowX: "hidden",
                overflowY: "hidden",
            }}
        >
            {renderStyles()}

            <div
                className="replay-preview-layer-panel-scroll"
                style={{
                    flexGrow: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    width: "100%",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                {/* Background layers */}
                <div style={groupHeaderStyle}>Bản đồ</div>
                <div style={gridStyle}>
                    {BACKGROUND_LAYER_OPTIONS.map((layer) => {
                        const active = Boolean(backgroundVisibility[layer.id]);
                        return (
                            <button
                                key={layer.id}
                                type="button"
                                title={layer.label}
                                onClick={() => onToggleBackground(layer.id)}
                                style={getButtonStyles(active, "56, 189, 248")} // sky-400
                            >
                                {LAYER_ICONS[layer.id] || "?"}
                            </button>
                        );
                    })}
                </div>

                <div style={dividerStyle} />

                {/* Territories / Polygons */}
                <div style={groupHeaderStyle}>Khu vực</div>
                <div style={gridStyle}>
                    {polygonKeys.map((typeKey) => {
                        const active = geometryVisibility[typeKey] !== false;
                        const label = getGeometryTypeLabel(typeKey);
                        return (
                            <button
                                key={typeKey}
                                type="button"
                                title={label}
                                onClick={() => onToggleGeometry(typeKey)}
                                style={getButtonStyles(active, "249, 115, 22")} // orange-500
                            >
                                {LAYER_ICONS[typeKey] || "?"}
                            </button>
                        );
                    })}
                </div>

                <div style={dividerStyle} />

                {/* Routes / Lines */}
                <div style={groupHeaderStyle}>Tuyến</div>
                <div style={gridStyle}>
                    {lineKeys.map((typeKey) => {
                        const active = geometryVisibility[typeKey] !== false;
                        const label = getGeometryTypeLabel(typeKey);
                        return (
                            <button
                                key={typeKey}
                                type="button"
                                title={label}
                                onClick={() => onToggleGeometry(typeKey)}
                                style={getButtonStyles(active, "192, 132, 252")} // purple-400
                            >
                                {LAYER_ICONS[typeKey] || "?"}
                            </button>
                        );
                    })}
                </div>

                <div style={dividerStyle} />

                {/* Places & Events / Points */}
                <div style={groupHeaderStyle}>Điểm</div>
                <div style={gridStyle}>
                    {pointKeys.map((typeKey) => {
                        const active = geometryVisibility[typeKey] !== false;
                        const label = getGeometryTypeLabel(typeKey);
                        return (
                            <button
                                key={typeKey}
                                type="button"
                                title={label}
                                onClick={() => onToggleGeometry(typeKey)}
                                style={getButtonStyles(active, "245, 158, 11")} // amber-500
                            >
                                {LAYER_ICONS[typeKey] || "?"}
                            </button>
                        );
                    })}
                </div>
            </div>

            {onHide && (
                <div
                    style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        marginTop: 6,
                        flexShrink: 0,
                    }}
                >
                    <div style={dividerStyle} />
                    <button
                        type="button"
                        title="Ẩn bảng lớp bản đồ"
                        onClick={onHide}
                        style={getButtonStyles(true, "239, 68, 68")}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

const groupHeaderStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 900,
    color: "#94a3b8",
    letterSpacing: 1,
    textTransform: "uppercase",
    width: "100%",
    textAlign: "center",
    marginBottom: 4,
};

const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    width: "100%",
};

const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "rgba(148, 163, 184, 0.15)",
    width: "80%",
    margin: "6px 0",
};

function getGeometryTypeLabel(typeKey: string): string {
    const labels: Record<string, string> = {
        country: "Quốc gia",
        state: "Nhà nước / vùng",
        faction: "Phe phái",
        rebellion_zone: "Vùng nổi dậy",
        defense_line: "Tuyến phòng thủ",
        military_route: "Đường hành quân",
        retreat_route: "Đường rút lui",
        migration_route: "Đường di cư",
        trade_route: "Tuyến thương mại",
        battle: "Trận đánh",
        person_event: "Nhân vật / sự kiện",
        temple: "Đền miếu",
        capital: "Kinh đô",
        city: "Thành phố",
        fortification: "Công sự",
        ruin: "Di tích",
        port: "Cảng",
    };
    return labels[typeKey] || typeKey.replaceAll("_", " ");
}
