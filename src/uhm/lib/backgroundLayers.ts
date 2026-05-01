export const BACKGROUND_LAYER_OPTIONS = [
    { id: "raster-base-layer", label: "Raster" },
    { id: "graticules-line", label: "Graticules" },
    { id: "land", label: "Land" },
    { id: "bg-countries-fill", label: "Countries" },
    { id: "bg-country-borders-line", label: "Country Borders" },
    { id: "regions-line", label: "Regions" },
    { id: "lakes-fill", label: "Lakes" },
    { id: "rivers-line", label: "Rivers" },
    { id: "geolines-line", label: "Geolines" },
] as const;

export type BackgroundLayerId = (typeof BACKGROUND_LAYER_OPTIONS)[number]["id"];
export type BackgroundLayerVisibility = Record<BackgroundLayerId, boolean>;

// Tạo map visibility mặc định cho toàn bộ background layers.
function buildBackgroundLayerVisibility(value: boolean): BackgroundLayerVisibility {
    return BACKGROUND_LAYER_OPTIONS.reduce((acc, option) => {
        acc[option.id] = value;
        return acc;
    }, {} as BackgroundLayerVisibility);
}

export const DEFAULT_BACKGROUND_LAYER_VISIBILITY =
    buildBackgroundLayerVisibility(true);

export const HIDDEN_BACKGROUND_LAYER_VISIBILITY =
    buildBackgroundLayerVisibility(false);
