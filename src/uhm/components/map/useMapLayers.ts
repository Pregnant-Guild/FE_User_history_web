import maplibregl from "maplibre-gl";
import { GOONG_GLYPHS_PROXY_URL } from "@/uhm/api/config";
import { getGoongBackgroundOverlayBundle } from "@/uhm/api/tiles";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import { PATH_ARROW_ICON_ID, PATH_ARROW_SOURCE_ID, POLYGON_LABEL_SOURCE_ID } from "@/uhm/lib/map/constants";
import { ensurePointGeotypeIcons, getAllGeotypeLabelLayers, getAllGeotypeLayers } from "@/uhm/lib/map/styles/geotypeLayers";
import {
    applyBackgroundLayerVisibility,
    ensurePathArrowIcon,
} from "./mapUtils";
import { BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { FeatureCollection } from "@/uhm/lib/editor/state/useEditorState";

export function getBaseMapStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        glyphs: GOONG_GLYPHS_PROXY_URL,
        sources: {},
        layers: [
            {
                id: "background",
                type: "background",
                paint: {
                    "background-color": "#0b1220",
                },
            },
        ],
    };
}

export function setupMapLayers(
    map: maplibregl.Map,
    backgroundVisibility: BackgroundLayerVisibility
) {
    applyBackgroundLayerVisibility(map, backgroundVisibility);
    void replaceBackgroundLayersWithGoong(map, backgroundVisibility).catch((error) => {
        console.error("Failed to load proxied background overlay bundle.", error);
    });
    const hasPathArrowIcon = ensurePathArrowIcon(map);

    // preview (drawing)
    map.addSource("draw-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
        id: "draw-preview-fill",
        type: "fill",
        source: "draw-preview",
        paint: {
            "fill-color": "#22c55e",
            "fill-opacity": 0.4,
        },
    });

    map.addLayer({
        id: "draw-preview-line",
        type: "line",
        source: "draw-preview",
        paint: {
            "line-color": "#16a34a",
            "line-width": 2,
        },
    });

    map.addSource("draw-circle-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
        id: "draw-circle-preview-fill",
        type: "fill",
        source: "draw-circle-preview",
        paint: {
            "fill-color": "#0ea5e9",
            "fill-opacity": 0.25,
        },
    });

    map.addLayer({
        id: "draw-circle-preview-line",
        type: "line",
        source: "draw-circle-preview",
        paint: {
            "line-color": "#0284c7",
            "line-width": 2,
            "line-opacity": 0.95,
        },
    });

    map.addSource("draw-line-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
        id: "draw-line-preview-line",
        type: "line",
        source: "draw-line-preview",
        paint: {
            "line-color": "#38bdf8",
            "line-width": 3,
            "line-opacity": 0.9,
            "line-dasharray": [1.2, 0.9],
        },
    });

    map.addSource("draw-path-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
        id: "draw-path-preview-line",
        type: "line",
        source: "draw-path-preview",
        paint: {
            "line-color": "#38bdf8",
            "line-width": 3,
            "line-opacity": 0.9,
            "line-dasharray": [1.2, 0.9],
        },
    });

    if (hasPathArrowIcon) {
        map.addLayer({
            id: "draw-path-preview-arrows",
            type: "symbol",
            source: "draw-path-preview",
            layout: {
                "symbol-placement": "line",
                "symbol-spacing": 56,
                "icon-image": PATH_ARROW_ICON_ID,
                "icon-size": 0.45,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
            },
        });
    }

    // data
    map.addSource("countries", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
    });

    map.addSource(PATH_ARROW_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        promoteId: "id",
    });

    map.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
    });

    map.addSource(POLYGON_LABEL_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        promoteId: "id",
    });

    ensurePointGeotypeIcons(map);

    const geotypeLayers = getAllGeotypeLayers("countries", PATH_ARROW_SOURCE_ID, "places");
    for (const layer of geotypeLayers) {
        map.addLayer(layer);
    }

    const geotypeLabelLayers = getAllGeotypeLabelLayers(POLYGON_LABEL_SOURCE_ID, "countries");
    for (const layer of geotypeLabelLayers) {
        map.addLayer(layer);
    }

    // editing overlays
    map.addSource("edit-shape", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });
    map.addSource("edit-handles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    // Glowing halo under the edit shape line
    map.addLayer({
        id: "edit-shape-glow",
        type: "line",
        source: "edit-shape",
        paint: {
            "line-color": "#38bdf8",
            "line-width": 8,
            "line-opacity": 0.35,
            "line-blur": 1.5,
        },
    });

    map.addLayer({
        id: "edit-shape-line",
        type: "line",
        source: "edit-shape",
        paint: {
            "line-color": "#38bdf8",
            "line-width": 3,
        },
    });

    // Glowing halo under the edit handles
    map.addLayer({
        id: "edit-handles-glow",
        type: "circle",
        source: "edit-handles",
        paint: {
            "circle-color": "#f97316",
            "circle-radius": 22,
            "circle-opacity": 0.35,
            "circle-blur": 0.85,
        },
    });

    map.addLayer({
        id: "edit-handles-circle",
        type: "circle",
        source: "edit-handles",
        paint: {
            "circle-color": "#f97316",
            "circle-radius": 12,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 3,
        },
    });

}

async function replaceBackgroundLayersWithGoong(
    map: maplibregl.Map,
    backgroundVisibility: BackgroundLayerVisibility
) {
    const bundle = await getGoongBackgroundOverlayBundle();
    if (!bundle || map.getLayer("goong-country-labels-0")) {
        return;
    }

    for (const [sourceId, source] of Object.entries(bundle.sources)) {
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, source);
        }
    }

    const insertBeforeId = map.getLayer("draw-preview-fill")
        ? "draw-preview-fill"
        : undefined;
    for (const layer of bundle.layers) {
        if (map.getLayer(layer.id)) continue;
        map.addLayer(layer, insertBeforeId);
    }

    applyBackgroundLayerVisibility(map, backgroundVisibility);
}
