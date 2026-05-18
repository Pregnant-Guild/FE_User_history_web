export const BACKGROUND_LAYER_OPTIONS = [
    { id: "raster-base-layer", label: "Raster" },
    { id: "bg-country-borders-line", label: "Country Borders" },
    { id: "bg-province-borders-line", label: "Province Borders" },
    { id: "bg-district-borders-line", label: "District Borders" },
    { id: "country-labels", label: "Country Labels" },
    { id: "rivers-line", label: "Rivers" },
] as const;

export type BackgroundLayerId = (typeof BACKGROUND_LAYER_OPTIONS)[number]["id"];
export type BackgroundLayerVisibility = Record<BackgroundLayerId, boolean>;

export const DEFAULT_BACKGROUND_LAYER_VISIBILITY: BackgroundLayerVisibility = {
    "raster-base-layer": true,
    "bg-country-borders-line": true,
    "bg-province-borders-line": false,
    "bg-district-borders-line": false,
    "country-labels": true,
    "rivers-line": true,
};

export const HIDDEN_BACKGROUND_LAYER_VISIBILITY: BackgroundLayerVisibility = {
    "raster-base-layer": false,
    "bg-country-borders-line": false,
    "bg-province-borders-line": false,
    "bg-district-borders-line": false,
    "country-labels": false,
    "rivers-line": false,
};
