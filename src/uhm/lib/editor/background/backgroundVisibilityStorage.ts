import {
    BACKGROUND_LAYER_OPTIONS,
    BackgroundLayerVisibility,
    DEFAULT_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/backgroundLayers";

const BACKGROUND_LAYER_VISIBILITY_STORAGE_KEY = "uhm.backgroundLayerVisibility.v1";

export function loadBackgroundLayerVisibilityFromStorage(): BackgroundLayerVisibility {
    if (typeof window === "undefined") {
        return { ...DEFAULT_BACKGROUND_LAYER_VISIBILITY };
    }

    try {
        const raw = window.localStorage.getItem(BACKGROUND_LAYER_VISIBILITY_STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_BACKGROUND_LAYER_VISIBILITY };
        }

        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeBackgroundLayerVisibility(parsed);
        return normalized || { ...DEFAULT_BACKGROUND_LAYER_VISIBILITY };
    } catch (err) {
        console.warn("Load background layer visibility from storage failed", err);
        return { ...DEFAULT_BACKGROUND_LAYER_VISIBILITY };
    }
}

export function persistBackgroundLayerVisibility(visibility: BackgroundLayerVisibility) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            BACKGROUND_LAYER_VISIBILITY_STORAGE_KEY,
            JSON.stringify(visibility)
        );
    } catch (err) {
        console.warn("Persist background layer visibility failed", err);
    }
}

function normalizeBackgroundLayerVisibility(raw: unknown): BackgroundLayerVisibility | null {
    if (!raw || typeof raw !== "object") return null;

    const source = raw as Record<string, unknown>;
    const next: BackgroundLayerVisibility = {
        ...DEFAULT_BACKGROUND_LAYER_VISIBILITY,
    };

    for (const layer of BACKGROUND_LAYER_OPTIONS) {
        const value = source[layer.id];
        if (typeof value === "boolean") {
            next[layer.id] = value;
        }
    }

    return next;
}

