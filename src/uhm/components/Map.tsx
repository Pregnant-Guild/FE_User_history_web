"use client";

import { type CSSProperties, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import { Feature, FeatureCollection, Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

import { useMapInstance } from "./map/useMapInstance";
import { setupMapLayers } from "./map/useMapLayers";
import { useMapInteraction } from "./map/useMapInteraction";
import { useMapSync } from "./map/useMapSync";

export type MapHoverPayload = {
    featureId: string | number;
    feature: Feature | null;
    point: { x: number; y: number };
    lngLat: { lng: number; lat: number };
};

export type MapHandle = {
    getViewState: () => {
        center: { lng: number; lat: number };
        zoom: number;
        pitch: number;
        bearing: number;
        projection: string;
    } | null;
    getMap: () => import("maplibre-gl").Map | null;
};

type MapProps = {
    mode: EditorMode;
    draft: FeatureCollection;
    backgroundVisibility: BackgroundLayerVisibility;
    geometryVisibility?: Record<string, boolean>;
    selectedFeatureIds: (string | number)[];
    onSelectFeatureIds: (ids: (string | number)[]) => void;
    onSetMode?: (mode: EditorMode, featureId?: string | number) => void;
    labelContextDraft?: FeatureCollection;
    onCreateFeature?: (feature: FeatureCollection["features"][number]) => void;
    onDeleteFeature?: (id: string | number) => void;
    onUpdateFeature?: (id: string | number, geometry: Geometry) => void;
    allowGeometryEditing?: boolean;
    respectBindingFilter?: boolean;
    height?: CSSProperties["height"];
    fitToDraftBounds?: boolean;
    fitBoundsKey?: string | number | null;
    onHoverFeatureChange?: ((payload: MapHoverPayload | null) => void) | undefined;
    highlightFeatures?: FeatureCollection | null;
    focusFeatureCollection?: FeatureCollection | null;
    focusRequestKey?: string | number | null;
    focusPadding?: number | import("maplibre-gl").PaddingOptions;
};

const Map = forwardRef<MapHandle, MapProps>(function Map({
    mode,
    onSetMode,
    draft,
    backgroundVisibility,
    geometryVisibility,
    selectedFeatureIds,
    onSelectFeatureIds,
    labelContextDraft,
    onCreateFeature,
    onDeleteFeature,
    onUpdateFeature,
    allowGeometryEditing = true,
    respectBindingFilter = true,
    height = "100vh",
    fitToDraftBounds = false,
    fitBoundsKey = null,
    onHoverFeatureChange,
    highlightFeatures = null,
    focusFeatureCollection = null,
    focusRequestKey = null,
    focusPadding,
}, ref) {
    const modeRef = useRef<MapProps["mode"]>(mode);
    const draftRef = useRef<FeatureCollection>(draft);
    const onSelectFeatureIdsRef = useRef(onSelectFeatureIds);
    const onSetModeRef = useRef(onSetMode);
    const onHoverFeatureChangeRef = useRef<MapProps["onHoverFeatureChange"]>(onHoverFeatureChange);
    const onCreateRef = useRef<MapProps["onCreateFeature"]>(onCreateFeature);
    const onDeleteRef = useRef<MapProps["onDeleteFeature"]>(onDeleteFeature);
    const onUpdateRef = useRef<MapProps["onUpdateFeature"]>(onUpdateFeature);

    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { draftRef.current = draft; }, [draft]);
    useEffect(() => { onSelectFeatureIdsRef.current = onSelectFeatureIds; }, [onSelectFeatureIds]);
    useEffect(() => { onSetModeRef.current = onSetMode; }, [onSetMode]);
    useEffect(() => { onHoverFeatureChangeRef.current = onHoverFeatureChange; }, [onHoverFeatureChange]);
    useEffect(() => { onCreateRef.current = onCreateFeature; }, [onCreateFeature]);
    useEffect(() => { onDeleteRef.current = onDeleteFeature; }, [onDeleteFeature]);
    useEffect(() => { onUpdateRef.current = onUpdateFeature; }, [onUpdateFeature]);

    const {
        mapRef,
        containerRef,
        fatalInitError,
        zoomLevel,
        zoomBounds,
        isGlobeProjection,
        setIsGlobeProjection,
        isMapLoaded,
        geolocationCenteredRef,
        handleZoomByStep,
        handleZoomSliderChange,
        getViewState,
    } = useMapInstance();

    useImperativeHandle(ref, () => ({
        getViewState,
        getMap: () => mapRef.current,
    }), [getViewState, mapRef]);

    const {
        editingEngineRef,
        setupMapInteractions,
        cleanupMapInteractions,
    } = useMapInteraction({
        mapRef,
        mode,
        modeRef,
        draftRef,
        allowGeometryEditing,
        selectedFeatureIds,
        onSelectFeatureIdsRef,
        onSetModeRef,
        onCreateRef,
        onDeleteRef,
        onUpdateRef,
        onHoverFeatureChangeRef,
    });

    const {
        applyDraftToMap,
        applyHighlightToMap,
        tryCenterToUserLocation,
    } = useMapSync({
        mapRef,
        draft,
        labelContextDraft,
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
    });

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapLoaded) return;

        setupMapLayers(map, backgroundVisibility, highlightFeatures, applyHighlightToMap);
        setupMapInteractions(map);
        applyDraftToMap(draftRef.current);
        tryCenterToUserLocation();

        return () => {
            cleanupMapInteractions();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMapLoaded]);

    useEffect(() => {
        const map = mapRef.current;
        if (map && isMapLoaded) {
            // Trigger resize after a short delay to allow layout to settle
            setTimeout(() => map.resize(), 100);
        }
    }, [mode, isMapLoaded, mapRef]);

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
                        maxWidth: "650px",
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
                    <label
                        title={
                            isGlobeProjection
                                ? "Dang o che do hinh cau (globe)"
                                : "Dang o che do trai phang (flat)"
                        }
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "0 6px",
                            userSelect: "none",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={isGlobeProjection}
                            onChange={(e) => setIsGlobeProjection(e.target.checked)}
                            aria-label="Toggle globe projection"
                            style={{ display: "none" }}
                        />
                        <span
                            aria-hidden="true"
                            style={{
                                position: "relative",
                                width: "42px",
                                height: "22px",
                                borderRadius: "999px",
                                border: "1px solid rgba(148, 163, 184, 0.45)",
                                background: isGlobeProjection
                                    ? "rgba(56, 189, 248, 0.30)"
                                    : "rgba(148, 163, 184, 0.18)",
                                boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.35)",
                                transition: "background 160ms ease",
                            }}
                        >
                            <span
                                style={{
                                    position: "absolute",
                                    top: "2px",
                                    left: isGlobeProjection ? "22px" : "2px",
                                    width: "18px",
                                    height: "18px",
                                    borderRadius: "999px",
                                    background: isGlobeProjection ? "#38bdf8" : "#e2e8f0",
                                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.35)",
                                    transition: "left 160ms ease, background 160ms ease",
                                }}
                            />
                        </span>
                        <span
                            style={{
                                fontSize: "12px",
                                color: isGlobeProjection ? "#7dd3fc" : "#cbd5e1",
                                fontWeight: 700,
                                minWidth: "40px",
                            }}
                        >
                            {isGlobeProjection ? "Globe" : "Flat"}
                        </span>
                    </label>

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
});

export default Map;

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
