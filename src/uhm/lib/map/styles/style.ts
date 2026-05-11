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
    empire: "#f59e0b",
    kingdom: "#d97706",
    war: "#dc2626",
    battle: "#f43f5e",
    civilization: "#14b8a6",
    rebellion_zone: "#7c3aed",
};

export const POLYGON_STROKE_BY_TYPE: Record<string, string> = {
    country: "#1e3a8a",
    state: "#0c4a6e",
    empire: "#7c2d12",
    kingdom: "#9a3412",
    war: "#7f1d1d",
    battle: "#9f1239",
    civilization: "#134e4a",
    rebellion_zone: "#4c1d95",
};

export const POLYGON_OPACITY_BY_TYPE: Record<string, number> = {
    war: 0.3,
    battle: 0.34,
    civilization: 0.38,
    rebellion_zone: 0.32,
};

export const LINE_COLOR_BY_TYPE: Record<string, string> = {
    defense_line: "#f97316",
    attack_route: "#ef4444",
    retreat_route: "#94a3b8",
    invasion_route: "#b91c1c",
    migration_route: "#0ea5e9",
    refugee_route: "#06b6d4",
    trade_route: "#eab308",
    shipping_route: "#2563eb",
};

export const PATH_RENDER_BY_TYPE: Record<string, boolean> = {
    attack_route: true,
    retreat_route: true,
    invasion_route: true,
    migration_route: true,
    refugee_route: true,
    trade_route: true,
    shipping_route: true,
};

