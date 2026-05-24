import maplibregl from "maplibre-gl";

export const COUNTRY_COLOR_KEY_EXPRESSION: maplibregl.ExpressionSpecification = [
    "coalesce",
    ["get", "MAPCOLOR7"],
    ["get", "MAPCOLOR9"],
    ["get", "scalerank"],
    0,
];

export const COUNTRY_FILL_COLOR_EXPRESSION: maplibregl.ExpressionSpecification = [
    "match",
    COUNTRY_COLOR_KEY_EXPRESSION,
    1, "#ef4444",
    2, "#f97316",
    3, "#f59e0b",
    4, "#22c55e",
    5, "#06b6d4",
    6, "#3b82f6",
    7, "#8b5cf6",
    8, "#a855f7",
    9, "#d946ef",
    10, "#14b8a6",
    "#64748b",
];

export const POLYGON_FILL_BY_TYPE: Record<string, string> = {
    country: "#2563eb",
    state: "#0ea5e9",
    battle: "#f43f5e",
    rebellion_zone: "#7c3aed",
};

export const POLYGON_STROKE_BY_TYPE: Record<string, string> = {
    country: "#1e3a8a",
    state: "#0c4a6e",
    battle: "#9f1239",
    rebellion_zone: "#4c1d95",
};

export const POLYGON_OPACITY_BY_TYPE: Record<string, number> = {
    battle: 0.34,
    rebellion_zone: 0.32,
};

export const LINE_COLOR_BY_TYPE: Record<string, string> = {
    defense_line: "#f97316",
    military_route: "#ef4444",
    retreat_route: "#94a3b8",
    migration_route: "#0ea5e9",
    trade_route: "#eab308",
};

export const PATH_RENDER_BY_TYPE: Record<string, boolean> = {
    military_route: true,
    retreat_route: true,
    migration_route: true,
    trade_route: true,
};

