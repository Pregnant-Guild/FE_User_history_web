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
import { bindImageOverlayInteractions, type MapImageOverlay } from "./map/imageOverlay";

export type MapFeaturePayload = {
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
    setGlobeProjection: (isGlobe: boolean) => void;
};

type MapProps = {
    mode: EditorMode;
    // FeatureCollection that should actually be rendered/interacted with on the map.
    // Callers should apply timeline/replay filters before passing it here.
    renderDraft: FeatureCollection;
    backgroundVisibility: BackgroundLayerVisibility;
    geometryVisibility?: Record<string, boolean>;
    selectedFeatureIds: (string | number)[];
    onSelectFeatureIds: (ids: (string | number)[]) => void;
    onSetMode?: (mode: EditorMode, featureId?: string | number) => void;
    // Label lookup context only. It may include non-rendered geometries for entity label resolution.
    labelContextDraft?: FeatureCollection;
    labelTimelineYear?: number | null;
    onCreateFeature?: (feature: FeatureCollection["features"][number]) => void;
    onDeleteFeature?: (id: string | number | (string | number)[]) => void;
    onHideFeature?: (id: string | number) => void;
    onUpdateFeature?: (id: string | number, geometry: Geometry) => void;
    allowGeometryEditing?: boolean;
    applyGeometryBindingFilter?: boolean;
    height?: CSSProperties["height"];
    fitToDraftBounds?: boolean;
    fitBoundsKey?: string | number | null;
    onFeatureClick?: ((payload: MapFeaturePayload | null) => void) | undefined;
    focusFeatureCollection?: FeatureCollection | null;
    focusRequestKey?: string | number | null;
    focusPadding?: number | import("maplibre-gl").PaddingOptions;
    imageOverlay?: MapImageOverlay | null;
    onImageOverlayChange?: (overlay: MapImageOverlay) => void;
    onBindGeometries?: (targetId: string | number, sourceIds: (string | number)[]) => void;
    showViewportControls?: boolean;
    isPreviewMode?: boolean;
    onEnterPreview?: () => void;
    onExitPreview?: () => void;
    onPlayPreviewReplay?: () => void;
};

const Map = forwardRef<MapHandle, MapProps>(function Map({
    mode,
    onSetMode,
    renderDraft,
    backgroundVisibility,
    geometryVisibility,
    selectedFeatureIds,
    onSelectFeatureIds,
    labelContextDraft,
    labelTimelineYear,
    onCreateFeature,
    onDeleteFeature,
    onHideFeature,
    onUpdateFeature,
    allowGeometryEditing = true,
    applyGeometryBindingFilter = true,
    height = "100vh",
    fitToDraftBounds = false,
    fitBoundsKey = null,
    onFeatureClick,
    focusFeatureCollection = null,
    focusRequestKey = null,
    focusPadding,
    imageOverlay = null,
    onImageOverlayChange,
    onBindGeometries,
    showViewportControls = true,
    isPreviewMode = false,
    onEnterPreview,
    onExitPreview,
    onPlayPreviewReplay,
}, ref) {
    // Ref giữ mode mới nhất cho MapLibre handlers được register một lần.
    const modeRef = useRef<MapProps["mode"]>(mode);
    // Ref giữ render draft mới nhất để map engines đọc không bị stale closure.
    const renderDraftRef = useRef<FeatureCollection>(renderDraft);
    // Ref callback select feature mới nhất cho event click trên map.
    const onSelectFeatureIdsRef = useRef(onSelectFeatureIds);
    // Ref callback đổi mode mới nhất, dùng khi map interaction chuyển sang replay/select.
    const onSetModeRef = useRef(onSetMode);
    // Ref callback click feature mới nhất cho tooltip/panel ngoài map.
    const onFeatureClickRef = useRef<MapProps["onFeatureClick"]>(onFeatureClick);
    // Ref callback create mới nhất khi drawing engine tạo feature.
    const onCreateRef = useRef<MapProps["onCreateFeature"]>(onCreateFeature);
    // Ref callback delete mới nhất khi editing engine xóa feature.
    const onDeleteRef = useRef<MapProps["onDeleteFeature"]>(onDeleteFeature);
    // Ref callback hide local mới nhất khi context menu select ẩn feature khỏi map.
    const onHideRef = useRef<MapProps["onHideFeature"]>(onHideFeature);
    // Ref callback update mới nhất khi editing engine đổi geometry.
    const onUpdateRef = useRef<MapProps["onUpdateFeature"]>(onUpdateFeature);
    // Ref giữ overlay mới nhất cho right-drag controls.
    const imageOverlayRef = useRef<MapImageOverlay | null>(imageOverlay);
    // Ref callback update overlay mới nhất để interaction không stale.
    const onImageOverlayChangeRef = useRef<MapProps["onImageOverlayChange"]>(onImageOverlayChange);
    // Ref callback bind geometry mới nhất để interaction không stale.
    const onBindGeometriesRef = useRef<MapProps["onBindGeometries"]>(onBindGeometries);
 
    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { renderDraftRef.current = renderDraft; }, [renderDraft]);
    useEffect(() => { onSelectFeatureIdsRef.current = onSelectFeatureIds; }, [onSelectFeatureIds]);
    useEffect(() => { onSetModeRef.current = onSetMode; }, [onSetMode]);
    useEffect(() => { onFeatureClickRef.current = onFeatureClick; }, [onFeatureClick]);
    useEffect(() => { onCreateRef.current = onCreateFeature; }, [onCreateFeature]);
    useEffect(() => { onDeleteRef.current = onDeleteFeature; }, [onDeleteFeature]);
    useEffect(() => { onHideRef.current = onHideFeature; }, [onHideFeature]);
    useEffect(() => { onUpdateRef.current = onUpdateFeature; }, [onUpdateFeature]);
    useEffect(() => { imageOverlayRef.current = imageOverlay; }, [imageOverlay]);
    useEffect(() => { onImageOverlayChangeRef.current = onImageOverlayChange; }, [onImageOverlayChange]);
    useEffect(() => { onBindGeometriesRef.current = onBindGeometries; }, [onBindGeometries]);

    // Hook sở hữu lifecycle MapLibre instance và các control camera/projection.
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
        beginZoomSliderDrag,
        endZoomSliderDrag,
        getViewState,
    } = useMapInstance();

    // Public API cho parent đọc map instance/view state mà không expose implementation nội bộ.
    useImperativeHandle(ref, () => ({
        getViewState,
        getMap: () => mapRef.current,
        setGlobeProjection: (isGlobe: boolean) => {
            setIsGlobeProjection(isGlobe);
        },
    }), [getViewState, mapRef, setIsGlobeProjection]);

    // Hook gắn/dọn các interaction vẽ, chọn, sửa geometry.
    const {
        editingEngineRef,
        setupMapInteractions,
        cleanupMapInteractions,
    } = useMapInteraction({
        mapRef,
        mode,
        modeRef,
        renderDraftRef,
        allowGeometryEditing,
        selectedFeatureIds,
        onSelectFeatureIdsRef,
        onSetModeRef,
        onCreateRef,
        onDeleteRef,
        onHideRef,
        onUpdateRef,
        onFeatureClickRef,
        onBindGeometriesRef,
    });

    // Hook đồng bộ draft/layer/filter/highlight từ React state xuống MapLibre source/layer.
    const {
        applyRenderDraftToMap,
        applyImageOverlayToMap,
        tryCenterToUserLocation,
    } = useMapSync({
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
    });

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapLoaded) return;

        setupMapLayers(map, backgroundVisibility);
        applyImageOverlayToMap();
        setupMapInteractions(map);
        applyRenderDraftToMap(renderDraftRef.current);
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

    const hasImageOverlay = Boolean(imageOverlay);
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapLoaded || !hasImageOverlay) return;
        return bindImageOverlayInteractions(
            map,
            () => imageOverlayRef.current,
            (nextOverlay) => onImageOverlayChangeRef.current?.(nextOverlay)
        );
    }, [hasImageOverlay, isMapLoaded, mapRef]);

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

            {showViewportControls ? (
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

	                    {onEnterPreview || onExitPreview ? (
	                        <button
	                            type="button"
	                            onClick={isPreviewMode ? onExitPreview : onEnterPreview}
	                            style={{
	                                ...zoomButtonStyle,
	                                width: "auto",
	                                minWidth: "76px",
	                                padding: "0 12px",
	                                background: isPreviewMode ? "#334155" : "#166534",
	                                fontWeight: 800,
	                            }}
	                            aria-label={isPreviewMode ? "Exit preview" : "Enter preview"}
	                            title={isPreviewMode ? "Thoat preview" : "Xem nhu nguoi dung"}
	                        >
	                            {isPreviewMode ? "Editor" : "Preview"}
	                        </button>
	                    ) : null}

	                    {onPlayPreviewReplay ? (
	                        <button
	                            type="button"
	                            onClick={onPlayPreviewReplay}
	                            style={{
	                                ...zoomButtonStyle,
	                                width: "auto",
	                                minWidth: "64px",
	                                padding: "0 12px",
	                                display: "inline-flex",
	                                alignItems: "center",
	                                justifyContent: "center",
	                                gap: "7px",
	                                background: "#2563eb",
	                                fontSize: "13px",
	                                fontWeight: 800,
	                            }}
	                            aria-label="Play selected replay"
	                            title="Play replay của geometry đang chọn"
	                        >
	                            <span
	                                aria-hidden="true"
	                                style={{
	                                    width: 0,
	                                    height: 0,
	                                    borderTop: "5px solid transparent",
	                                    borderBottom: "5px solid transparent",
	                                    borderLeft: "8px solid currentColor",
	                                }}
	                            />
	                            Play
	                        </button>
	                    ) : null}

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
                        onPointerDown={(event) => {
                            event.stopPropagation();
                            try {
                                event.currentTarget.setPointerCapture(event.pointerId);
                            } catch {
                                // Browser may reject capture for non-primary pointers; drag lock still works.
                            }
                            beginZoomSliderDrag();
                        }}
                        onPointerUp={(event) => {
                            event.stopPropagation();
                            try {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                            } catch {
                                // Ignore if capture was already released.
                            }
                            endZoomSliderDrag();
                        }}
                        onPointerCancel={endZoomSliderDrag}
                        onBlur={endZoomSliderDrag}
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
            ) : null}
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
