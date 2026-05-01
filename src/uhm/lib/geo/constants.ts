import type { FeatureCollection } from "@/uhm/types/geo";

export const WORLD_BBOX = {
    minLng: -180,
    minLat: -90,
    maxLng: 180,
    maxLat: 90,
} as const;

export const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

