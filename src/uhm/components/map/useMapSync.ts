import { useCallback, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { FeatureCollection } from "@/uhm/lib/editor/state/useEditorState";
import { BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import { FEATURE_STATE_SOURCE_IDS, PATH_ARROW_SOURCE_ID, POLYGON_LABEL_SOURCE_ID } from "@/uhm/lib/map/constants";
import {
    applyBackgroundLayerVisibility,
    buildPolygonLabelFeatureCollection,
    buildPathArrowFeatureCollection,
    decorateLineFeaturesWithLabels,
    decoratePointFeaturesWithLabels,
    filterDraftByBinding,
    filterDraftByGeometryVisibility,
    fitMapToFeatureCollection,
    setSelectedFeatureState,
    splitDraftFeatures,
    decorateFeaturesWithEntityColors,
} from "./mapUtils";
import { applyImageOverlay, type MapImageOverlay } from "./imageOverlay";

type UseMapSyncProps = {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    // Already-filtered FeatureCollection that should be written to MapLibre sources.
    // Timeline/replay filters must be applied before this hook receives it.
    renderDraft: FeatureCollection;
    // Lookup-only context for labels. It may contain geometries that are not rendered.
    // Never use it to decide which geometries appear on the map.
    labelContextDraft?: FeatureCollection;
    labelTimelineYear?: number | null;
    backgroundVisibility: BackgroundLayerVisibility;
    geometryVisibility?: Record<string, boolean>;
    selectedFeatureIds: (string | number)[];
    applyGeometryBindingFilter: boolean;
    fitToDraftBounds: boolean;
    fitBoundsKey?: string | number | null;
    focusFeatureCollection?: FeatureCollection | null;
    focusRequestKey?: string | number | null;
    focusPadding?: number | maplibregl.PaddingOptions;
    imageOverlay?: MapImageOverlay | null;
    allowGeometryEditing: boolean;
    editingEngineRef: React.MutableRefObject<{
        editingRef: React.MutableRefObject<{ id: string | number } | null>;
        clearEditing: () => void;
    } | null>;
    geolocationCenteredRef: React.MutableRefObject<boolean>;
    isPreviewMode?: boolean;
};

export function useMapSync({
    mapRef,
    renderDraft,
    labelContextDraft,
    labelTimelineYear,
    backgroundVisibility,
    geometryVisibility,
    selectedFeatureIds,
    applyGeometryBindingFilter,
    fitToDraftBounds,
    fitBoundsKey,
    focusFeatureCollection,
    focusRequestKey,
    focusPadding,
    imageOverlay,
    allowGeometryEditing,
    editingEngineRef,
    geolocationCenteredRef,
    isPreviewMode,
}: UseMapSyncProps) {
    const renderDraftRef = useRef<FeatureCollection>(renderDraft);
    const labelContextDraftRef = useRef<FeatureCollection | undefined>(labelContextDraft);
    const labelTimelineYearRef = useRef<number | null | undefined>(labelTimelineYear);
    const backgroundVisibilityRef = useRef<BackgroundLayerVisibility>(backgroundVisibility);
    const geometryVisibilityRef = useRef<Record<string, boolean> | undefined>(geometryVisibility);
    const selectedFeatureIdsRef = useRef<(string | number)[]>(selectedFeatureIds);
    const applyGeometryBindingFilterRef = useRef(applyGeometryBindingFilter);
    const fitToDraftBoundsRef = useRef(fitToDraftBounds);
    const imageOverlayRef = useRef<MapImageOverlay | null>(imageOverlay || null);
    const focusFeatureCollectionRef = useRef<FeatureCollection | null | undefined>(focusFeatureCollection);
    const focusPaddingRef = useRef<number | maplibregl.PaddingOptions | undefined>(focusPadding);
    const isPreviewModeRef = useRef(isPreviewMode);

    renderDraftRef.current = renderDraft;
    labelContextDraftRef.current = labelContextDraft;
    labelTimelineYearRef.current = labelTimelineYear;
    backgroundVisibilityRef.current = backgroundVisibility;
    geometryVisibilityRef.current = geometryVisibility;
    selectedFeatureIdsRef.current = selectedFeatureIds;
    applyGeometryBindingFilterRef.current = applyGeometryBindingFilter;
    fitToDraftBoundsRef.current = fitToDraftBounds;
    imageOverlayRef.current = imageOverlay || null;
    focusFeatureCollectionRef.current = focusFeatureCollection;
    focusPaddingRef.current = focusPadding;
    isPreviewModeRef.current = isPreviewMode;

    const fitBoundsAppliedRef = useRef(false);
    const lastCountriesStrRef = useRef("");
    const lastPlacesStrRef = useRef("");
    const lastPolygonLabelStrRef = useRef("");
    const lastPathArrowStrRef = useRef("");

    useEffect(() => {
        const map = mapRef.current;
        if (map) {
            (map as any)._renderDraftRef = renderDraftRef;
        }
    }, [mapRef]);

    useEffect(() => {
        fitBoundsAppliedRef.current = false;
    }, [fitBoundsKey]);

    const applyRenderDraftToMap = useCallback((
        renderFc: FeatureCollection,
        labelContextOverride?: FeatureCollection,
        selectedIdsOverride?: (string | number)[]
    ) => {
        const map = mapRef.current;
        if (!map) return;

        const countriesSource = map.getSource("countries") as maplibregl.GeoJSONSource | undefined;
        const placesSource = map.getSource("places") as maplibregl.GeoJSONSource | undefined;
        const polygonLabelSource = map.getSource(POLYGON_LABEL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

        if (!countriesSource || !placesSource || !polygonLabelSource) return;

        for (const sourceId of FEATURE_STATE_SOURCE_IDS) {
            if (map.getSource(sourceId)) {
                map.removeFeatureState({ source: sourceId });
            }
        }

        const labelContext = labelContextOverride || labelContextDraftRef.current || renderFc;
        const currentSelectedIds = selectedIdsOverride || selectedFeatureIdsRef.current;

        const bindingFilteredRenderDraft = applyGeometryBindingFilterRef.current
            ? filterDraftByBinding(renderFc, currentSelectedIds, null, isPreviewModeRef.current)
            : renderFc;
        const visibilityFilteredDraft = filterDraftByGeometryVisibility(bindingFilteredRenderDraft, geometryVisibilityRef.current);
        const mapSourceDraft = decorateFeaturesWithEntityColors(visibilityFilteredDraft);
        const labelTimelineYear = labelTimelineYearRef.current;
        const { polygons, points } = splitDraftFeatures(mapSourceDraft);
        const labeledGeometries = decorateLineFeaturesWithLabels(polygons, labelContext, labelTimelineYear);
        const labeledPoints = decoratePointFeaturesWithLabels(points, labelContext, labelTimelineYear);
        const polygonLabels = buildPolygonLabelFeatureCollection(polygons, labelContext, labelTimelineYear);
        const pathArrowShapes = buildPathArrowFeatureCollection(mapSourceDraft);

        const countriesStr = JSON.stringify(labeledGeometries);
        if (countriesStr !== lastCountriesStrRef.current) {
            countriesSource.setData(labeledGeometries);
            lastCountriesStrRef.current = countriesStr;
        }

        const placesStr = JSON.stringify(labeledPoints);
        if (placesStr !== lastPlacesStrRef.current) {
            placesSource.setData(labeledPoints);
            lastPlacesStrRef.current = placesStr;
        }

        const polygonLabelsStr = JSON.stringify(polygonLabels);
        if (polygonLabelsStr !== lastPolygonLabelStrRef.current) {
            polygonLabelSource.setData(polygonLabels);
            lastPolygonLabelStrRef.current = polygonLabelsStr;
        }

        const pathArrowSource = map.getSource(PATH_ARROW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (pathArrowSource) {
            const pathArrowStr = JSON.stringify(pathArrowShapes);
            if (pathArrowStr !== lastPathArrowStrRef.current) {
                pathArrowSource.setData(pathArrowShapes);
                lastPathArrowStrRef.current = pathArrowStr;
            }
        }

        currentSelectedIds.forEach((id) => {
            setSelectedFeatureState(map, id, true);
        });
        requestAnimationFrame(() => {
            if (mapRef.current !== map) return;
            currentSelectedIds.forEach((id) => {
                setSelectedFeatureState(map, id, true);
            });
        });
        if (fitToDraftBoundsRef.current && !fitBoundsAppliedRef.current) {
            fitBoundsAppliedRef.current = fitMapToFeatureCollection(map, mapSourceDraft);
        }
    }, [mapRef]);

    const tryCenterToUserLocation = useCallback(() => {
        if (geolocationCenteredRef.current) return;
        if (fitToDraftBoundsRef.current) return;
        if (typeof window === "undefined") return;

        // Nếu đã có tọa độ lưu từ phiên làm việc trước, không tự động dịch chuyển nữa
        try {
            if (window.localStorage.getItem("uhm:mapViewport")) {
                geolocationCenteredRef.current = true;
                return;
            }
        } catch {
            // ignore
        }

        if (!("geolocation" in navigator)) return;

        const map = mapRef.current;
        if (!map) return;

        geolocationCenteredRef.current = true;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (mapRef.current !== map) return;
                const { longitude, latitude } = pos.coords;
                if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

                const currentZoom = map.getZoom();
                const nextZoom = Number.isFinite(currentZoom) ? Math.max(currentZoom, 5) : 5;
                // Dùng jumpTo để teleport lập tức, loại bỏ hoạt ảnh trượt camera kéo dài
                map.jumpTo({ center: [longitude, latitude], zoom: nextZoom });
            },
            () => { },
            { enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 }
        );
    }, [mapRef, geolocationCenteredRef]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        applyBackgroundLayerVisibility(map, backgroundVisibility);
    }, [backgroundVisibility, mapRef]);



    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        applyImageOverlay(map, imageOverlay);
    }, [imageOverlay, mapRef]);

    useEffect(() => {
        applyRenderDraftToMap(renderDraft, labelContextDraft, selectedFeatureIds);
        const editingId = editingEngineRef.current?.editingRef?.current?.id;
        if (allowGeometryEditing && editingId !== undefined && editingId !== null) {
            const stillExists = renderDraft.features.some((f) => String(f.properties.id) === String(editingId));
            if (!stillExists) {
                editingEngineRef.current?.clearEditing();
            }
        }
    }, [
        allowGeometryEditing,
        renderDraft,
        labelContextDraft,
        labelTimelineYear,
        selectedFeatureIds,
        applyGeometryBindingFilter,
        geometryVisibility,
        applyRenderDraftToMap,
        editingEngineRef,
    ]);

    useEffect(() => {
        if (focusRequestKey === null || focusRequestKey === undefined) return;
        const map = mapRef.current;
        const target = focusFeatureCollectionRef.current;
        if (!target || !target.features.length) return;
        if (!map) return;

        let cancelled = false;
        let rafId: number | null = null;

        const focus = () => {
            if (cancelled || mapRef.current !== map || !map.isStyleLoaded()) return;
            fitMapToFeatureCollection(map, target, focusPaddingRef.current, {
                duration: 550,
                maxZoom: 10,
                pointZoom: 9,
            });
        };

        if (map.isStyleLoaded()) {
            rafId = requestAnimationFrame(focus);
        } else {
            map.once("idle", focus);
        }

        return () => {
            cancelled = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [focusRequestKey, mapRef]);

    return {
        applyRenderDraftToMap,
        tryCenterToUserLocation,
        applyImageOverlayToMap: () => {
            const map = mapRef.current;
            if (!map || !map.isStyleLoaded()) return;
            applyImageOverlay(map, imageOverlayRef.current);
        },
    };
}
