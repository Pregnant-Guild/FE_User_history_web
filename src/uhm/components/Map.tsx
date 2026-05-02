"use client";

import { type CSSProperties, useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getRasterTileTemplateUrl, getVectorTileTemplateUrl } from "@/uhm/api/tiles";
import { initDrawing } from "@/uhm/lib/engine/drawingEngine";
import { initSelect } from "@/uhm/lib/engine/selectingEngine";
import { initPoint } from "@/uhm/lib/engine/pointEngine";
import { initLine } from "@/uhm/lib/engine/lineEngine";
import { initPath } from "@/uhm/lib/engine/pathEngine";
import { initCircle } from "@/uhm/lib/engine/circleEngine";
import { createEditingEngine } from "@/uhm/lib/engine/editingEngine";
import { Feature, FeatureCollection, Geometry } from "@/uhm/lib/useEditorState";
import { BACKGROUND_LAYER_OPTIONS, BackgroundLayerVisibility } from "@/uhm/lib/backgroundLayers";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/geo/constants";
import {
    DEFAULT_POINT_ICON_ID,
    FEATURE_STATE_SOURCE_IDS,
    MAP_MAX_ZOOM,
    MAP_MIN_ZOOM,
    PATH_ARROW_ICON_ID,
    PATH_ARROW_SOURCE_ID,
    POINT_ICON_URL,
    RASTER_BASE_INSERT_BEFORE_LAYER_ID,
    RASTER_BASE_LAYER_ID,
    RASTER_BASE_SOURCE_ID,
} from "@/uhm/lib/map/constants";
import {
    COUNTRY_FILL_COLOR_EXPRESSION,
    LINE_COLOR_BY_TYPE,
    PATH_RENDER_BY_TYPE,
    POLYGON_FILL_BY_TYPE,
    POLYGON_OPACITY_BY_TYPE,
    POLYGON_STROKE_BY_TYPE,
} from "@/uhm/lib/map/style";

type MapProps = {
    mode: EditorMode;
    draft: FeatureCollection;
    backgroundVisibility: BackgroundLayerVisibility;
    selectedFeatureId: string | number | null;
    onSelectFeatureId: (id: string | number | null) => void;
    onCreateFeature?: (feature: FeatureCollection["features"][number]) => void;
    onDeleteFeature?: (id: string | number) => void;
    onUpdateFeature?: (id: string | number, geometry: Geometry) => void;
    allowGeometryEditing?: boolean;
    respectBindingFilter?: boolean;
    height?: CSSProperties["height"];
    fitToDraftBounds?: boolean;
    fitBoundsKey?: string | number | null;
};

type EngineBinding = {
    cleanup: () => void;
    cancel?: () => void;
    clearSelection?: () => void;
};

export default function Map({
    mode,
    draft,
    backgroundVisibility,
    selectedFeatureId,
    onSelectFeatureId,
    onCreateFeature,
    onDeleteFeature,
    onUpdateFeature,
    allowGeometryEditing = true,
    respectBindingFilter = true,
    height = "100vh",
    fitToDraftBounds = false,
    fitBoundsKey = null,
}: MapProps) {
    // DOM container của map (dùng ref để tránh collision khi render nhiều map).
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Nếu init map fail (throw trong onLoad), show overlay thay vì crash âm thầm.
    const [fatalInitError, setFatalInitError] = useState<string | null>(null);

    // Mirror các flags props để tránh phải re-create map khi props thay đổi.
    const fitToDraftBoundsRef = useRef(fitToDraftBounds);
    const respectBindingFilterRef = useRef(respectBindingFilter);

    // Instance maplibre (được tạo 1 lần khi component mount).
    const mapRef = useRef<maplibregl.Map | null>(null);
    // Mirror của props mode để event handlers/engines đọc giá trị mới nhất (tránh stale closure).
    const modeRef = useRef<MapProps["mode"]>(mode);
    // Mirror của draft để engines đọc dữ liệu mới nhất trong callbacks.
    const draftRef = useRef<FeatureCollection>(draft);
    // Mirror của backgroundVisibility để sync visibility khi map đã load.
    const backgroundVisibilityRef = useRef<BackgroundLayerVisibility>(backgroundVisibility);
    // Mirror của selectedFeatureId để filter/select trên map (không phụ thuộc re-render).
    const selectedFeatureIdRef = useRef<string | number | null>(selectedFeatureId);
    // Mirror của callback onSelectFeatureId.
    const onSelectFeatureIdRef = useRef(onSelectFeatureId);
    // Mirror của callback onCreateFeature.
    const onCreateRef = useRef<MapProps["onCreateFeature"]>(onCreateFeature);
    // Mirror của callback onDeleteFeature.
    const onDeleteRef = useRef<MapProps["onDeleteFeature"]>(onDeleteFeature);
    // Mirror của callback onUpdateFeature.
    const onUpdateRef = useRef<MapProps["onUpdateFeature"]>(onUpdateFeature);
    // Zoom hiện tại để render UI zoom control.
    const [zoomLevel, setZoomLevel] = useState(2);
    // Min/max zoom dùng cho slider và clamp thao tác zoom.
    const [zoomBounds, setZoomBounds] = useState({ min: MAP_MIN_ZOOM, max: MAP_MAX_ZOOM });

    // Engine chỉnh sửa polygon (kéo đỉnh/insert đỉnh), chỉ khởi tạo 1 lần.
    const editingEngineRef = useRef<ReturnType<typeof createEditingEngine> | null>(null);
    // Đánh dấu đã fitBounds cho fitBoundsKey hiện tại (tránh fit lặp).
    const fitBoundsAppliedRef = useRef(false);
    // Danh sách cleanup fns để dọn listeners/engines khi unmount map.
    const mapCleanupFnsRef = useRef<Array<() => void>>([]);
    // Các engine bindings theo mode để gọi cancel/cleanup khi đổi mode.
    const engineBindingsRef = useRef<Partial<Record<MapProps["mode"], EngineBinding>>>({});
    // Lưu mode trước đó để cancel engine đúng lúc khi switch mode.
    const previousModeRef = useRef<MapProps["mode"]>(mode);

    useEffect(() => {
        fitToDraftBoundsRef.current = fitToDraftBounds;
    }, [fitToDraftBounds]);

    useEffect(() => {
        respectBindingFilterRef.current = respectBindingFilter;
    }, [respectBindingFilter]);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        const previousMode = previousModeRef.current;
        if (previousMode !== mode) {
            engineBindingsRef.current[previousMode]?.cancel?.();
            previousModeRef.current = mode;
        }

        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        if (mode !== "draw") {
            (map.getSource("draw-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        if (mode !== "add-line") {
            (map.getSource("draw-line-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        if (mode !== "add-path") {
            (map.getSource("draw-path-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        if (mode !== "add-circle") {
            (map.getSource("draw-circle-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
    }, [mode]);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        selectedFeatureIdRef.current = selectedFeatureId;
    }, [selectedFeatureId]);

    useEffect(() => {
        if (mode !== "select" || selectedFeatureId === null) {
            editingEngineRef.current?.clearEditing();
        }
    }, [mode, selectedFeatureId]);

    useEffect(() => {
        fitBoundsAppliedRef.current = false;
    }, [fitBoundsKey]);

    useEffect(() => {
        onSelectFeatureIdRef.current = onSelectFeatureId;
    }, [onSelectFeatureId]);

    useEffect(() => {
        backgroundVisibilityRef.current = backgroundVisibility;
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        applyBackgroundLayerVisibility(map, backgroundVisibility);
    }, [backgroundVisibility]);

    useEffect(() => {
        onCreateRef.current = onCreateFeature;
    }, [onCreateFeature]);

    useEffect(() => {
        onDeleteRef.current = onDeleteFeature;
    }, [onDeleteFeature]);

    useEffect(() => {
        onUpdateRef.current = onUpdateFeature;
    }, [onUpdateFeature]);

    useEffect(() => {
        if (!editingEngineRef.current) {
            editingEngineRef.current = createEditingEngine({
                mapRef,
                onUpdate: (id, geometry) => onUpdateRef.current?.(id, geometry),
            });
        }
    }, []);

    /**
     * Push given draft into map sources (idempotent).
     * Always clear feature-state to avoid stale selection overlays after undo/replace.
     */
    const applyDraftToMap = useCallback((fc: FeatureCollection) => {
        const map = mapRef.current;
        if (!map) return;

        const countriesSource = map.getSource("countries") as maplibregl.GeoJSONSource | undefined;
        const placesSource = map.getSource("places") as maplibregl.GeoJSONSource | undefined;

        if (!countriesSource || !placesSource) return;

        // clear all feature-state (selection) to prevent ghost layers after undo
        for (const sourceId of FEATURE_STATE_SOURCE_IDS) {
            if (map.getSource(sourceId)) {
                map.removeFeatureState({ source: sourceId });
            }
        }

        const visibleDraft = respectBindingFilterRef.current
            ? filterDraftByBinding(fc, selectedFeatureIdRef.current)
            : fc;
        const { polygons, points } = splitDraftFeatures(visibleDraft);
        const pathArrowShapes = buildPathArrowFeatureCollection(visibleDraft);

        countriesSource.setData(polygons);
        placesSource.setData(points);
        (map.getSource(PATH_ARROW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)
            ?.setData(pathArrowShapes);

        const selectedId = selectedFeatureIdRef.current;
        setSelectedFeatureState(map, selectedId, true);
        requestAnimationFrame(() => {
            if (mapRef.current !== map) return;
            setSelectedFeatureState(map, selectedId, true);
        });
        if (fitToDraftBoundsRef.current && !fitBoundsAppliedRef.current) {
            fitBoundsAppliedRef.current = fitMapToFeatureCollection(map, visibleDraft);
        }
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

            const map = new maplibregl.Map({
                container,
                attributionControl: false,
                minZoom: MAP_MIN_ZOOM,
                maxZoom: MAP_MAX_ZOOM,
                style: {
                    version: 8,
                    // Needed for symbol/text layers (country labels).
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
	                            // A dedicated label-point layer (1 point per country) to avoid per-tile duplicates.
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
	                                // Prefer showing labels earlier (even if it means some collisions).
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
            },
            center: [0, 20],
            zoom: 2,
        });

        mapRef.current = map;

        map.on("load", async () => {
            try {
                const syncZoomLevel = () => {
                    setZoomLevel(roundZoom(map.getZoom()));
                };

                applyBackgroundLayerVisibility(map, backgroundVisibilityRef.current);
                const hasPathArrowIcon = ensurePathArrowIcon(map);
                setZoomBounds({ min: MAP_MIN_ZOOM, max: MAP_MAX_ZOOM });
                syncZoomLevel();
                map.on("zoom", syncZoomLevel);

                // preview (drawing)
                map.addSource("draw-preview", {
                    type: "geojson",
                    data: {
                        type: "FeatureCollection",
                        features: [],
                    },
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
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
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
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
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
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
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

            // data thật
            map.addSource("countries", {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
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
                        "#22c55e", // selected
                        [
                            "==",
                            ["coalesce", ["get", "entity_id"], ""],
                            "",
                        ],
                        "#ef4444", // no entity
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
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
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

            // fallback layer so points are still visible even if icon cannot be loaded
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

            addPointSymbolLayer(map);

            // init drawing
            const drawingEngine = initDrawing(
                map,
                () => modeRef.current,
                (geometry: Geometry) => {
                    const id = buildClientFeatureId();
                    onCreateRef.current?.({
                        type: "Feature",
                        properties: {
                            id,
                            type: null,
                            geometry_preset: "polygon",
                            entity_id: null,
                            entity_ids: [],
                            entity_name: null,
                            entity_type_id: null,
                            binding: [],
                        },
                        geometry,
                    });
                }
            );

            const selectEngine = initSelect(
                map,
                () => modeRef.current,
                allowGeometryEditing
                    ? (id: string | number) => {
                        // ensure edit overlays are cleared when a feature gets removed
                        editingEngineRef.current?.clearEditing();
                        onSelectFeatureIdRef.current?.(null);
                        onDeleteRef.current?.(id);
                    }
                    : undefined,
                allowGeometryEditing
                    ? (feature) => editingEngineRef.current?.beginEditing(feature)
                    : undefined,
                (id) => onSelectFeatureIdRef.current?.(id)
            );

            const cleanupPoint = initPoint(
                map,
                () => modeRef.current,
                (geometry: Geometry) => {
                    const id = buildClientFeatureId();
                    onCreateRef.current?.({
                        type: "Feature",
                        properties: {
                            id,
                            type: null,
                            geometry_preset: "point",
                            entity_id: null,
                            entity_ids: [],
                            entity_name: null,
                            entity_type_id: null,
                            binding: [],
                        },
                        geometry,
                    });
                }
            );

            const lineEngine = initLine(
                map,
                () => modeRef.current,
                (geometry: Geometry) => {
                    const id = buildClientFeatureId();
                    onCreateRef.current?.({
                        type: "Feature",
                        properties: {
                            id,
                            type: "defense_line",
                            geometry_preset: "line",
                            entity_id: null,
                            entity_ids: [],
                            entity_name: null,
                            entity_type_id: null,
                            binding: [],
                        },
                        geometry,
                    });
                }
            );

            const pathEngine = initPath(
                map,
                () => modeRef.current,
                (geometry: Geometry) => {
                    const id = buildClientFeatureId();
                    onCreateRef.current?.({
                        type: "Feature",
                        properties: {
                            id,
                            type: "attack_route",
                            geometry_preset: "line",
                            entity_id: null,
                            entity_ids: [],
                            entity_name: null,
                            entity_type_id: null,
                            binding: [],
                        },
                        geometry,
                    });
                }
            );

            const circleEngine = initCircle(
                map,
                () => modeRef.current,
                (geometry: Geometry) => {
                    const id = buildClientFeatureId();
                    onCreateRef.current?.({
                        type: "Feature",
                        properties: {
                            id,
                            type: null,
                            geometry_preset: "circle-area",
                            entity_id: null,
                            entity_ids: [],
                            entity_name: null,
                            entity_type_id: null,
                            binding: [],
                        },
                        geometry,
                    });
                }
            );

            engineBindingsRef.current = {
                draw: drawingEngine,
                select: selectEngine,
                "add-line": lineEngine,
                "add-path": pathEngine,
                "add-circle": circleEngine,
            };

            mapCleanupFnsRef.current = [
                circleEngine.cleanup,
                pathEngine.cleanup,
                lineEngine.cleanup,
                cleanupPoint,
                selectEngine.cleanup,
                drawingEngine.cleanup,
                () => map.off("zoom", syncZoomLevel),
            ];

            // after everything mounted, push current draft to sources
            applyDraftToMap(draftRef.current);

            if (allowGeometryEditing) {
                editingEngineRef.current?.bindEditEvents(map);
            }
            } catch (err) {
                console.error("Map initialization failed", err);
                setFatalInitError(err instanceof Error ? err.message : "Map initialization failed.");
            }
        });

        return () => {
            for (const cleanupFn of mapCleanupFnsRef.current) {
                cleanupFn();
            }
            mapCleanupFnsRef.current = [];
            engineBindingsRef.current = {};
            if (mapRef.current === map) {
                mapRef.current = null;
            }
            map.remove();
        };
    }, [allowGeometryEditing, applyDraftToMap]);

    const handleZoomByStep = (delta: number) => {
        const map = mapRef.current;
        if (!map) return;
        const next = clampNumber(zoomLevel + delta, zoomBounds.min, zoomBounds.max);
        map.easeTo({ zoom: next, duration: 120 });
    };

    const handleZoomSliderChange = (nextRaw: number) => {
        const map = mapRef.current;
        if (!map || !Number.isFinite(nextRaw)) return;
        const next = clampNumber(nextRaw, zoomBounds.min, zoomBounds.max);
        map.easeTo({ zoom: next, duration: 80 });
    };

    // sync draft -> map sources and drop edit overlays if feature vanished
    useEffect(() => {
        applyDraftToMap(draft);
        const editingId = editingEngineRef.current?.editingRef.current?.id;
        if (allowGeometryEditing && editingId !== undefined && editingId !== null) {
            const stillExists = draft.features.some((f) => f.properties.id === editingId);
            if (!stillExists) {
                editingEngineRef.current?.clearEditing();
            }
        }
    }, [allowGeometryEditing, draft, selectedFeatureId, applyDraftToMap]);

    return (
        <div style={{ width: "100%", height, position: "relative" }}>
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

            {fatalInitError ? (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 50,
                        display: "grid",
                        placeItems: "center",
                        padding: "24px",
                        background: "rgba(2, 6, 23, 0.78)",
                        color: "#e2e8f0",
                    }}
                >
                    <div
                        style={{
                            maxWidth: "680px",
                            border: "1px solid rgba(148, 163, 184, 0.3)",
                            borderRadius: "12px",
                            background: "rgba(15, 23, 42, 0.92)",
                            padding: "14px 16px",
                        }}
                    >
                        <div style={{ fontWeight: 800, marginBottom: "6px" }}>
                            Map khong khoi tao duoc
                        </div>
                        <div style={{ color: "#cbd5e1", fontSize: "13px" }}>
                            {fatalInitError}
                        </div>
                    </div>
                </div>
            ) : null}

            <div
                style={{
                    position: "absolute",
                    top: "10px",
                    left: "16px",
                    right: "16px",
                    zIndex: 12,
                    pointerEvents: "none",
                }}
            >
                <div
                    style={{
                        maxWidth: "520px",
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        background: "rgba(15, 23, 42, 0.88)",
                        border: "1px solid rgba(148, 163, 184, 0.38)",
                        borderRadius: "999px",
                        padding: "8px 12px",
                        color: "#e2e8f0",
                        backdropFilter: "blur(3px)",
                        pointerEvents: "auto",
                    }}
                >
                    <button
                        type="button"
                        onClick={() => handleZoomByStep(-0.8)}
                        style={zoomButtonStyle}
                        aria-label="Zoom out"
                    >
                        -
                    </button>

                    <input
                        type="range"
                        min={zoomBounds.min}
                        max={zoomBounds.max}
                        step={0.1}
                        value={zoomLevel}
                        onChange={(event) => handleZoomSliderChange(Number(event.target.value))}
                        style={{
                            flex: 1,
                            accentColor: "#38bdf8",
                            cursor: "pointer",
                        }}
                        aria-label="Map zoom"
                    />

                    <button
                        type="button"
                        onClick={() => handleZoomByStep(0.8)}
                        style={zoomButtonStyle}
                        aria-label="Zoom in"
                    >
                        +
                    </button>

                    <div
                        style={{
                            minWidth: "56px",
                            textAlign: "right",
                            fontSize: "12px",
                            color: "#cbd5e1",
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        {zoomLevel.toFixed(1)}x
                    </div>
                </div>
            </div>
        </div>
    );
}

function applyBackgroundLayerVisibility(
    map: maplibregl.Map,
    visibility: BackgroundLayerVisibility
) {
    syncRasterBaseVisibility(map, visibility[RASTER_BASE_LAYER_ID]);

    for (const layer of BACKGROUND_LAYER_OPTIONS) {
        if (layer.id === RASTER_BASE_LAYER_ID) continue;
        if (!map.getLayer(layer.id)) continue;
        map.setLayoutProperty(
            layer.id,
            "visibility",
            visibility[layer.id] ? "visible" : "none"
        );
    }
}

function syncRasterBaseVisibility(map: maplibregl.Map, shouldShow: boolean) {
    if (shouldShow) {
        ensureRasterBaseLayer(map);
        return;
    }

    removeRasterBaseLayer(map);
}

function ensureRasterBaseLayer(map: maplibregl.Map) {
    if (!map.getSource(RASTER_BASE_SOURCE_ID)) {
        map.addSource(RASTER_BASE_SOURCE_ID, createRasterBaseSource());
    }

    if (!map.getLayer(RASTER_BASE_LAYER_ID)) {
        const beforeId = map.getLayer(RASTER_BASE_INSERT_BEFORE_LAYER_ID)
            ? RASTER_BASE_INSERT_BEFORE_LAYER_ID
            : undefined;
        map.addLayer(createRasterBaseLayer(), beforeId);
    }

    map.setLayoutProperty(RASTER_BASE_LAYER_ID, "visibility", "visible");
}

function removeRasterBaseLayer(map: maplibregl.Map) {
    if (map.getLayer(RASTER_BASE_LAYER_ID)) {
        map.removeLayer(RASTER_BASE_LAYER_ID);
    }

    if (map.getSource(RASTER_BASE_SOURCE_ID)) {
        map.removeSource(RASTER_BASE_SOURCE_ID);
    }
}

function createRasterBaseSource() {
    return {
        type: "raster" as const,
        tiles: [getRasterTileTemplateUrl()],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 6,
    };
}

function createRasterBaseLayer() {
    return {
        id: RASTER_BASE_LAYER_ID,
        type: "raster" as const,
        source: RASTER_BASE_SOURCE_ID,
        paint: {
            "raster-opacity": 0.92,
            "raster-resampling": "linear" as const,
        },
    };
}

function filterDraftByBinding(
    fc: FeatureCollection,
    selectedFeatureId: string | number | null
): FeatureCollection {
    const selectedId = selectedFeatureId !== null ? String(selectedFeatureId) : null;
    if (selectedId === null) {
        return {
            ...fc,
            features: fc.features.filter((feature) => !normalizeBindingIds(feature.properties.binding).length),
        };
    }

    return {
        ...fc,
        features: fc.features.filter((feature) => {
            const featureId = String(feature.properties.id);
            if (featureId === selectedId) return true;
            const bindingIds = normalizeBindingIds(feature.properties.binding);
            if (!bindingIds.length) return true;
            return bindingIds.includes(selectedId);
        }),
    };
}

function normalizeBindingIds(rawBinding: unknown): string[] {
    if (!Array.isArray(rawBinding)) return [];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawId of rawBinding) {
        if (typeof rawId !== "string" && typeof rawId !== "number") continue;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }
    return deduped;
}

function splitDraftFeatures(fc: FeatureCollection) {
    const polygons = {
        type: "FeatureCollection",
        features: fc.features.filter((f) =>
            f.geometry.type !== "Point" && f.geometry.type !== "MultiPoint"
        ),
    } as FeatureCollection;

    const points = {
        type: "FeatureCollection",
        features: fc.features.filter((f) =>
            f.geometry.type === "Point" || f.geometry.type === "MultiPoint"
        ),
    } as FeatureCollection;

    return { polygons, points };
}

function setSelectedFeatureState(
    map: maplibregl.Map,
    id: string | number | null,
    selected: boolean
) {
    if (id === null) return;
    for (const sourceId of FEATURE_STATE_SOURCE_IDS) {
        if (!map.getSource(sourceId)) continue;
        map.setFeatureState({ source: sourceId, id }, { selected });
    }
}

function fitMapToFeatureCollection(map: maplibregl.Map, fc: FeatureCollection): boolean {
    const bbox = getFeatureCollectionBBox(fc);
    if (!bbox) return false;

    const lngSpan = Math.abs(bbox.maxLng - bbox.minLng);
    const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
    if (lngSpan < 0.000001 && latSpan < 0.000001) {
        map.easeTo({
            center: [bbox.minLng, bbox.minLat],
            zoom: 6,
            duration: 0,
        });
        return true;
    }

    map.fitBounds(
        [
            [bbox.minLng, bbox.minLat],
            [bbox.maxLng, bbox.maxLat],
        ],
        {
            padding: 58,
            maxZoom: 7,
            duration: 0,
        }
    );
    return true;
}

function getFeatureCollectionBBox(
    fc: FeatureCollection
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
    const points = fc.features.flatMap((feature) => collectCoordinatePairs(feature.geometry.coordinates));
    if (!points.length) return null;

    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    for (const [lng, lat] of points) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    }

    return { minLng, minLat, maxLng, maxLat };
}

function collectCoordinatePairs(value: unknown): Array<[number, number]> {
    if (!Array.isArray(value)) return [];
    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
    ) {
        return [[value[0], value[1]]];
    }
    return value.flatMap((item) => collectCoordinatePairs(item));
}

function buildPathArrowFeatureCollection(fc: FeatureCollection): FeatureCollection {
    const features = fc.features
        .map((feature) => {
            if (!isPathFeature(feature) || feature.geometry.type !== "LineString") return null;
            const geometry = buildPathArrowGeometry(feature.geometry.coordinates);
            if (!geometry) return null;
            return {
                type: "Feature" as const,
                properties: { ...feature.properties },
                geometry,
            };
        })
        .filter((feature): feature is Feature => feature !== null);

    return {
        type: "FeatureCollection",
        features,
    };
}

function isPathFeature(feature: Feature): boolean {
    const featureType = getFeatureSemanticType(feature);
    return Boolean(featureType && PATH_RENDER_BY_TYPE[featureType]);
}

function getFeatureSemanticType(feature: Feature): string | null {
    const value = feature.properties.type || feature.properties.entity_type_id || null;
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase();
    return normalized.length ? normalized : null;
}

function buildPathArrowGeometry(coords: [number, number][]): Geometry | null {
    const sourceCoords = removeDuplicatePathCoords(coords);
    if (sourceCoords.length < 2) return null;

    const origin = sourceCoords[0];
    const originLatRad = toRadians(origin[1]);
    const cosOriginLat = Math.max(Math.cos(originLatRad), 0.000001);
    const projected = sourceCoords.map((coord) => projectLngLat(coord, origin, cosOriginLat));
    const measured = buildMeasuredPath(projected);
    const totalLength = measured[measured.length - 1]?.distance || 0;
    if (totalLength <= 0) return null;

    const headLength = clampNumber(totalLength * 0.24, totalLength * 0.12, totalLength * 0.45);
    const bodyEndDistance = Math.max(totalLength - headLength, totalLength * 0.35);
    const bodyPoints = measured
        .filter((point) => point.distance < bodyEndDistance)
        .map(({ x, y, distance }) => ({ x, y, distance }));
    bodyPoints.push(pointAtDistance(measured, bodyEndDistance));

    if (bodyPoints.length < 2) return null;

    const tailWidth = clampNumber(totalLength * 0.018, 25000, 140000);
    const shoulderWidth = clampNumber(totalLength * 0.055, 60000, 420000);
    const headWidth = shoulderWidth * 1.65;

    const leftBody: ProjectedPoint[] = [];
    const rightBody: ProjectedPoint[] = [];

    for (let i = 0; i < bodyPoints.length; i += 1) {
        const point = bodyPoints[i];
        const normal = normalAt(bodyPoints, i);
        const progress = bodyEndDistance > 0
            ? Math.pow(clampNumber(point.distance / bodyEndDistance, 0, 1), 0.9)
            : 0;
        const width = tailWidth + (shoulderWidth - tailWidth) * progress;
        const half = width / 2;
        leftBody.push({
            x: point.x + normal.x * half,
            y: point.y + normal.y * half,
        });
        rightBody.push({
            x: point.x - normal.x * half,
            y: point.y - normal.y * half,
        });
    }

    const base = bodyPoints[bodyPoints.length - 1];
    const tip = pointAtDistance(measured, totalLength);
    const headNormal = normalFromSegment(base, tip) || normalAt(bodyPoints, bodyPoints.length - 1);
    const headHalf = headWidth / 2;
    const headBaseLeft = {
        x: base.x + headNormal.x * headHalf,
        y: base.y + headNormal.y * headHalf,
    };
    const headBaseRight = {
        x: base.x - headNormal.x * headHalf,
        y: base.y - headNormal.y * headHalf,
    };

    const ring = [
        ...leftBody,
        headBaseLeft,
        { x: tip.x, y: tip.y },
        headBaseRight,
        ...rightBody.reverse(),
        leftBody[0],
    ].map((point) => unprojectLngLat(point, origin, cosOriginLat));

    if (ring.length < 4) return null;
    return {
        type: "Polygon",
        coordinates: [ring],
    };
}

type ProjectedPoint = {
    x: number;
    y: number;
};

type MeasuredPoint = ProjectedPoint & {
    distance: number;
};

function removeDuplicatePathCoords(coords: [number, number][]): [number, number][] {
    const result: [number, number][] = [];
    for (const coord of coords) {
        const last = result[result.length - 1];
        if (last && last[0] === coord[0] && last[1] === coord[1]) continue;
        result.push(coord);
    }
    return result;
}

function projectLngLat(
    coord: [number, number],
    origin: [number, number],
    cosOriginLat: number
): ProjectedPoint {
    const earthRadiusMeters = 6371008.8;
    return {
        x: toRadians(coord[0] - origin[0]) * earthRadiusMeters * cosOriginLat,
        y: toRadians(coord[1] - origin[1]) * earthRadiusMeters,
    };
}

function unprojectLngLat(
    point: ProjectedPoint,
    origin: [number, number],
    cosOriginLat: number
): [number, number] {
    const earthRadiusMeters = 6371008.8;
    return [
        origin[0] + toDegrees(point.x / (earthRadiusMeters * cosOriginLat)),
        origin[1] + toDegrees(point.y / earthRadiusMeters),
    ];
}

function buildMeasuredPath(points: ProjectedPoint[]): MeasuredPoint[] {
    let distance = 0;
    return points.map((point, index) => {
        if (index > 0) {
            distance += distanceProjected(points[index - 1], point);
        }
        return {
            ...point,
            distance,
        };
    });
}

function pointAtDistance(points: MeasuredPoint[], targetDistance: number): MeasuredPoint {
    if (targetDistance <= 0) return points[0];
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const next = points[i];
        if (targetDistance > next.distance) continue;
        const segmentLength = next.distance - prev.distance;
        const t = segmentLength > 0 ? (targetDistance - prev.distance) / segmentLength : 0;
        return {
            x: prev.x + (next.x - prev.x) * t,
            y: prev.y + (next.y - prev.y) * t,
            distance: targetDistance,
        };
    }
    return points[points.length - 1];
}

function normalAt(points: ProjectedPoint[], index: number): ProjectedPoint {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    return normalFromSegment(prev, next) || { x: 0, y: 1 };
}

function normalFromSegment(a: ProjectedPoint, b: ProjectedPoint): ProjectedPoint | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) return null;
    return {
        x: -dy / length,
        y: dx / length,
    };
}

function distanceProjected(a: ProjectedPoint, b: ProjectedPoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
    return (value * 180) / Math.PI;
}

function ensurePathArrowIcon(map: maplibregl.Map): boolean {
    if (map.hasImage(PATH_ARROW_ICON_ID)) return true;
    const imageData = createPathArrowImageData();
    if (!imageData) return false;
    map.addImage(PATH_ARROW_ICON_ID, imageData, { pixelRatio: 2 });
    return true;
}

function createPathArrowImageData(): ImageData | null {
    const size = 56;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(8, 16);
    ctx.lineTo(28, 16);
    ctx.lineTo(28, 10);
    ctx.lineTo(46, 28);
    ctx.lineTo(28, 46);
    ctx.lineTo(28, 40);
    ctx.lineTo(8, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

function addPointSymbolLayer(map: maplibregl.Map) {
    void ensurePointAssetIcon(map).then((hasPointIcon) => {
        try {
            if (!hasPointIcon || !map.getSource("places") || map.getLayer("places-symbol")) return;

            map.addLayer({
                id: "places-symbol",
                type: "symbol",
                source: "places",
                layout: {
                    "icon-image": DEFAULT_POINT_ICON_ID,
                    "icon-size": 0.06,
                    "icon-anchor": "center",
                    "icon-allow-overlap": true,
                },
            });

            if (map.getLayer("places-circle")) {
                map.setLayoutProperty("places-circle", "visibility", "none");
            }
        } catch (err) {
            // Map might have been removed while icon was loading.
            console.warn("Add point symbol layer skipped", err);
        }
    });
}

async function ensurePointAssetIcon(map: maplibregl.Map): Promise<boolean> {
    if (map.hasImage(DEFAULT_POINT_ICON_ID)) return true;

    try {
        const image = await map.loadImage(POINT_ICON_URL);
        if (!map.hasImage(DEFAULT_POINT_ICON_ID)) {
            map.addImage(DEFAULT_POINT_ICON_ID, image.data);
        }
        return true;
    } catch (error) {
        console.error(`Failed to load point icon asset: ${POINT_ICON_URL}`, error);
        return false;
    }
}

function buildTypeMatchExpression(
    valueByType: Record<string, string | number | boolean>,
    fallback: string | number | boolean
): maplibregl.ExpressionSpecification {
    const expression: unknown[] = ["match", getFeatureTypeExpression()];

    for (const [typeId, value] of Object.entries(valueByType)) {
        expression.push(typeId, value);
    }

    expression.push(fallback);
    return expression as maplibregl.ExpressionSpecification;
}

function getFeatureTypeExpression(): maplibregl.ExpressionSpecification {
    return [
        "coalesce",
        ["get", "type"],
        ["get", "entity_type_id"],
        "",
    ] as maplibregl.ExpressionSpecification;
}

function roundZoom(value: number): number {
    return Math.round(value * 10) / 10;
}

function buildClientFeatureId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback đảm bảo tránh collision khi user tạo nhiều feature trong cùng 1ms.
    return `feature-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

const zoomButtonStyle: React.CSSProperties = {
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f8fafc",
    fontSize: "18px",
    lineHeight: "1",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
};
