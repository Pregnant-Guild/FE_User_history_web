import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import { getVectorTileTemplateUrl } from "@/uhm/api/tiles";
import {
    COUNTRY_FILL_COLOR_EXPRESSION,
    LINE_COLOR_BY_TYPE,
    PATH_RENDER_BY_TYPE,
    POLYGON_FILL_BY_TYPE,
    POLYGON_OPACITY_BY_TYPE,
    POLYGON_STROKE_BY_TYPE,
} from "@/uhm/lib/map/styles/style";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import { PATH_ARROW_ICON_ID, PATH_ARROW_SOURCE_ID } from "@/uhm/lib/map/constants";
import {
    addPointSymbolLayer,
    applyBackgroundLayerVisibility,
    buildTypeMatchExpression,
    ensurePathArrowIcon,
} from "./mapUtils";
import { BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { FeatureCollection } from "@/uhm/lib/editor/state/useEditorState";

export function getBaseMapStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
            base: {
                type: "vector",
                tiles: [getVectorTileTemplateUrl()],
                minzoom: 0,
                maxzoom: 6,
            },
        },
        layers: [
            {
                id: "background",
                type: "background",
                paint: {
                    "background-color": "#0b1220",
                },
            },
            {
                id: "graticules-line",
                type: "line",
                source: "base",
                "source-layer": "ne_10m_graticules_10",
                paint: {
                    "line-color": "#334155",
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0, 0.3,
                        4, 0.6,
                        6, 0.8,
                    ],
                    "line-opacity": 0.55,
                },
            },
            {
                id: "land",
                type: "fill",
                source: "base",
                "source-layer": "ne_10m_land",
                paint: {
                    "fill-color": "#1e293b",
                    "fill-opacity": 0.25,
                },
            },
            {
                id: "bg-countries-fill",
                type: "fill",
                source: "base",
                "source-layer": "ne_10m_admin_0_countries",
                paint: {
                    "fill-color": COUNTRY_FILL_COLOR_EXPRESSION,
                    "fill-opacity": 0.38,
                },
            },
            {
                id: "bg-country-borders-line",
                type: "line",
                source: "base",
                "source-layer": "ne_10m_admin_0_boundary_lines_land",
                paint: {
                    "line-color": "#cbd5e1",
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0, 0.2,
                        4, 0.5,
                        6, 1.1,
                    ],
                    "line-opacity": 0.85,
                },
            },
            {
                id: "country-labels",
                type: "symbol",
                source: "base",
                "source-layer": "country_labels",
                minzoom: 0,
                layout: {
                    "text-field": [
                        "coalesce",
                        ["get", "NAME_EN"],
                        ["get", "NAME"],
                        ["get", "ADMIN"],
                        ["get", "name"],
                        "",
                    ],
                    "text-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0, 15,
                        1, 16,
                        2, 17,
                        4, 19,
                        6, 23,
                    ],
                    "text-padding": 0,
                    "text-max-width": 10,
                    "text-allow-overlap": true,
                    "text-ignore-placement": true,
                    "symbol-placement": "point",
                },
                paint: {
                    "text-color": "#e2e8f0",
                    "text-halo-color": "#0b1220",
                    "text-halo-width": 1.2,
                    "text-halo-blur": 0.5,
                },
            },
            {
                id: "regions-line",
                type: "line",
                source: "base",
                "source-layer": "ne_10m_geography_regions_polys",
                paint: {
                    "line-color": "#475569",
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0, 0.2,
                        4, 0.6,
                        6, 1,
                    ],
                    "line-opacity": 0.6,
                },
            },
            {
                id: "lakes-fill",
                type: "fill",
                source: "base",
                "source-layer": "ne_10m_lakes",
                paint: {
                    "fill-color": "#1d4ed8",
                    "fill-opacity": 0.45,
                },
            },
            {
                id: "rivers-line",
                type: "line",
                source: "base",
                "source-layer": "ne_10m_rivers_lake_centerlines",
                paint: {
                    "line-color": "#38bdf8",
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0, 0.25,
                        4, 0.8,
                        6, 1.5,
                    ],
                    "line-opacity": 0.85,
                },
            },
            {
                id: "geolines-line",
                type: "line",
                source: "base",
                "source-layer": "ne_10m_geographic_lines",
                paint: {
                    "line-color": "#94a3b8",
                    "line-width": 1.2,
                    "line-opacity": 0.8,
                },
            },
        ],
    };
}

export function setupMapLayers(
    map: maplibregl.Map,
    backgroundVisibility: BackgroundLayerVisibility,
    highlightFeatures: FeatureCollection | null,
    applyHighlightToMap: (fc: FeatureCollection) => void
) {
    applyBackgroundLayerVisibility(map, backgroundVisibility);
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

    map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "countries",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#22c55e",
                [
                    "==",
                    ["coalesce", ["get", "entity_id"], ""],
                    "",
                ],
                "#ef4444",
                buildTypeMatchExpression(POLYGON_FILL_BY_TYPE, "#f59e0b"),
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                0.6,
                buildTypeMatchExpression(POLYGON_OPACITY_BY_TYPE, 0.5),
            ],
        },
    });

    map.addLayer({
        id: "countries-line",
        type: "line",
        source: "countries",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#14532d",
                buildTypeMatchExpression(POLYGON_STROKE_BY_TYPE, "#fbbf24"),
            ],
            "line-width": 2,
        },
    });

    map.addLayer({
        id: "routes-line",
        type: "line",
        source: "countries",
        filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            ["!=", buildTypeMatchExpression(PATH_RENDER_BY_TYPE, false), true],
        ],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""],
                "#ef4444",
                buildTypeMatchExpression(LINE_COLOR_BY_TYPE, "#38bdf8"),
            ],
            "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1, 2.2,
                4, 3.2,
                6, 4.2,
            ],
            "line-opacity": 0.9,
        },
    });

    map.addLayer({
        id: "routes-path-arrow-fill",
        type: "fill",
        source: PATH_ARROW_SOURCE_ID,
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""],
                "#ef4444",
                buildTypeMatchExpression(LINE_COLOR_BY_TYPE, "#38bdf8"),
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                0.92,
                0.82,
            ],
        },
    });

    map.addLayer({
        id: "routes-path-arrow-line",
        type: "line",
        source: PATH_ARROW_SOURCE_ID,
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#14532d",
                "#0f172a",
            ],
            "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1, 0.45,
                4, 0.8,
                6, 1.2,
            ],
            "line-opacity": 0.9,
        },
    });

    map.addLayer({
        id: "routes-path-hit",
        type: "line",
        source: "countries",
        filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            buildTypeMatchExpression(PATH_RENDER_BY_TYPE, false),
        ],
        paint: {
            "line-color": "#ffffff",
            "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1, 12,
                4, 18,
                6, 24,
            ],
            "line-opacity": 0,
        },
    });

    map.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
    });

    // editing overlays
    map.addSource("edit-shape", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });
    map.addSource("edit-handles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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

    map.addLayer({
        id: "places-circle",
        type: "circle",
        source: "places",
        paint: {
            "circle-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#22c55e",
                "#ef4444",
            ],
            "circle-radius": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                8,
                4,
            ],
            "circle-stroke-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#14532d",
                "#ffffff",
            ],
            "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                3,
                1,
            ],
            "circle-opacity": 0.9,
        },
    });

    map.addLayer({
        id: "places-selected-halo",
        type: "circle",
        source: "places",
        paint: {
            "circle-color": "#22c55e",
            "circle-radius": 13,
            "circle-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                0.28,
                0,
            ],
            "circle-stroke-color": "#14532d",
            "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                2,
                0,
            ],
        },
    });

    map.addSource("entity-focus", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
    });

    map.addLayer({
        id: "entity-focus-fill",
        type: "fill",
        source: "entity-focus",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
            "fill-color": "#fde047",
            "fill-opacity": 0.2,
        },
    });

    map.addLayer({
        id: "entity-focus-line",
        type: "line",
        source: "entity-focus",
        paint: {
            "line-color": "#f59e0b",
            "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1, 2.4,
                4, 4,
                6, 5.5,
            ],
            "line-opacity": 0.98,
        },
    });

    map.addLayer({
        id: "entity-focus-points",
        type: "circle",
        source: "entity-focus",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
            "circle-color": "#f8fafc",
            "circle-radius": 8,
            "circle-stroke-color": "#f59e0b",
            "circle-stroke-width": 3,
            "circle-opacity": 1,
        },
    });

    addPointSymbolLayer(map);
    applyHighlightToMap(highlightFeatures || EMPTY_FEATURE_COLLECTION);
}
