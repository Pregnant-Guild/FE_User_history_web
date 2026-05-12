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
    decoratePointFeaturesWithLabels,
    filterDraftByBinding,
    filterDraftByGeometryVisibility,
    fitMapToFeatureCollection,
    setSelectedFeatureState,
    splitDraftFeatures,
} from "./mapUtils";

type UseMapSyncProps = {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    draft: FeatureCollection;
    backgroundVisibility: BackgroundLayerVisibility;
    geometryVisibility?: Record<string, boolean>;
    selectedFeatureIds: (string | number)[];
    respectBindingFilter: boolean;
    fitToDraftBounds: boolean;
    fitBoundsKey?: string | number | null;
    highlightFeatures?: FeatureCollection | null;
    focusFeatureCollection?: FeatureCollection | null;
    focusRequestKey?: string | number | null;
    focusPadding?: number | maplibregl.PaddingOptions;
    allowGeometryEditing: boolean;
    editingEngineRef: React.MutableRefObject<{
        editingRef: React.MutableRefObject<{ id: string | number } | null>;
        clearEditing: () => void;
    } | null>;
    geolocationCenteredRef: React.MutableRefObject<boolean>;
};

export function useMapSync({
    mapRef,
    draft,
    backgroundVisibility,
    geometryVisibility,
    selectedFeatureIds,
    respectBindingFilter,
    fitToDraftBounds,
    fitBoundsKey,
    highlightFeatures,
    focusFeatureCollection,
    focusRequestKey,
    focusPadding,
    allowGeometryEditing,
    editingEngineRef,
    geolocationCenteredRef,
}: UseMapSyncProps) {
    const draftRef = useRef<FeatureCollection>(draft);
    const backgroundVisibilityRef = useRef<BackgroundLayerVisibility>(backgroundVisibility);
    const geometryVisibilityRef = useRef<Record<string, boolean> | undefined>(geometryVisibility);
    const selectedFeatureIdsRef = useRef<(string | number)[]>(selectedFeatureIds);
    const respectBindingFilterRef = useRef(respectBindingFilter);
    const fitToDraftBoundsRef = useRef(fitToDraftBounds);
    const highlightFeaturesRef = useRef<FeatureCollection | null>(highlightFeatures || null);
    const focusFeatureCollectionRef = useRef<FeatureCollection | null>(focusFeatureCollection || null);
    const focusRequestKeyRef = useRef<string | number | null>(focusRequestKey || null);
    const focusPaddingRef = useRef<number | maplibregl.PaddingOptions | undefined>(focusPadding);

    const fitBoundsAppliedRef = useRef(false);

    useEffect(() => { draftRef.current = draft; }, [draft]);
    useEffect(() => { backgroundVisibilityRef.current = backgroundVisibility; }, [backgroundVisibility]);
    useEffect(() => { geometryVisibilityRef.current = geometryVisibility; }, [geometryVisibility]);
    useEffect(() => { selectedFeatureIdsRef.current = selectedFeatureIds; }, [selectedFeatureIds]);
    useEffect(() => { respectBindingFilterRef.current = respectBindingFilter; }, [respectBindingFilter]);
    useEffect(() => { fitToDraftBoundsRef.current = fitToDraftBounds; }, [fitToDraftBounds]);
    useEffect(() => { highlightFeaturesRef.current = highlightFeatures || null; }, [highlightFeatures]);
    useEffect(() => { focusFeatureCollectionRef.current = focusFeatureCollection || null; }, [focusFeatureCollection]);
    useEffect(() => { focusRequestKeyRef.current = focusRequestKey || null; }, [focusRequestKey]);
    useEffect(() => { focusPaddingRef.current = focusPadding; }, [focusPadding]);

    useEffect(() => {
        fitBoundsAppliedRef.current = false;
    }, [fitBoundsKey]);

    const applyDraftToMap = useCallback((fc: FeatureCollection) => {
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

        const visibleDraftRaw = respectBindingFilterRef.current
            ? filterDraftByBinding(fc, selectedFeatureIdsRef.current, highlightFeaturesRef.current)
            : fc;
        const visibleDraft = filterDraftByGeometryVisibility(visibleDraftRaw, geometryVisibilityRef.current);
        const { polygons, points } = splitDraftFeatures(visibleDraft);
        const labeledPoints = decoratePointFeaturesWithLabels(points);
        const polygonLabels = buildPolygonLabelFeatureCollection(polygons);
        const pathArrowShapes = buildPathArrowFeatureCollection(visibleDraft);

        countriesSource.setData(polygons);
        placesSource.setData(labeledPoints);
        polygonLabelSource.setData(polygonLabels);
        (map.getSource(PATH_ARROW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(pathArrowShapes);

        const currentSelectedIds = selectedFeatureIdsRef.current;
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
            fitBoundsAppliedRef.current = fitMapToFeatureCollection(map, visibleDraft);
        }
    }, [mapRef]);

    const applyHighlightToMap = useCallback((fc: FeatureCollection) => {
        const map = mapRef.current;
        if (!map) return;

        const source = map.getSource("entity-focus") as maplibregl.GeoJSONSource | undefined;
        if (!source) return;
        source.setData(fc);
    }, [mapRef]);

    const tryCenterToUserLocation = useCallback(() => {
        if (geolocationCenteredRef.current) return;
        if (fitToDraftBoundsRef.current) return;
        if (typeof window === "undefined") return;
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
                map.easeTo({ center: [longitude, latitude], zoom: nextZoom, duration: 900 });
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
        const source = map.getSource("entity-focus") as maplibregl.GeoJSONSource | undefined;
        source?.setData(highlightFeatures || EMPTY_FEATURE_COLLECTION);
    }, [highlightFeatures, mapRef]);

    useEffect(() => {
        applyDraftToMap(draft);
        const editingId = editingEngineRef.current?.editingRef?.current?.id;
        if (allowGeometryEditing && editingId !== undefined && editingId !== null) {
            const stillExists = draft.features.some((f) => f.properties.id === editingId);
            if (!stillExists) {
                editingEngineRef.current?.clearEditing();
            }
        }
    }, [allowGeometryEditing, draft, selectedFeatureIds, applyDraftToMap, editingEngineRef]);

    useEffect(() => {
        if (focusRequestKey === null || focusRequestKey === undefined) return;
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        const target = focusFeatureCollectionRef.current;
        if (!target || !target.features.length) return;
        fitMapToFeatureCollection(map, target, focusPaddingRef.current);
    }, [focusRequestKey, mapRef]);

    return {
        applyDraftToMap,
        applyHighlightToMap,
        tryCenterToUserLocation,
    };
}
