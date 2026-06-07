"use client";

import { type CSSProperties, useEffect, useRef, forwardRef, useImperativeHandle, memo } from "react";
import { Feature, FeatureCollection, Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

import { useMapInstance } from "./map/useMapInstance";
import { setupMapLayers } from "./map/useMapLayers";
import { useMapInteraction } from "./map/useMapInteraction";
import { useMapSync } from "./map/useMapSync";
import { bindImageOverlayInteractions, type MapImageOverlay } from "./map/imageOverlay";
import { useMapHoverPopup, type MapHoverPopupContent } from "./map/useMapHoverPopup";

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
    onAddFeatureToProject?: (feature: FeatureCollection["features"][number]) => void;
    onDeleteFeature?: (id: string | number | (string | number)[]) => void;
    onHideFeature?: (id: string | number) => void;
    onUpdateFeature?: (id: string | number, geometry: Geometry) => void;
    allowGeometryEditing?: boolean;
    applyGeometryBindingFilter?: boolean;
    height?: CSSProperties["height"];
    fitToDraftBounds?: boolean;
    fitBoundsKey?: string | number | null;
    onFeatureClick?: ((payload: MapFeaturePayload | null) => void) | undefined;
    hoverPopupEnabled?: boolean;
    getHoverPopupContent?: (feature: Feature) => MapHoverPopupContent | null;
    onHoverFeatureChange?: (feature: Feature | null) => void;
    allowFeatureSelection?: boolean;
    focusFeatureCollection?: FeatureCollection | null;
    focusRequestKey?: string | number | null;
    focusPadding?: number | import("maplibre-gl").PaddingOptions;
    imageOverlay?: MapImageOverlay | null;
    onImageOverlayChange?: (overlay: MapImageOverlay) => void;
    onBindGeometries?: (targetId: string | number, sourceIds: (string | number)[]) => void;
    localFeatureIds?: (string | number)[];
    showViewportControls?: boolean;
    isPreviewMode?: boolean;
    onEnterPreview?: () => void;
    onExitPreview?: () => void;
    onPlayPreviewReplay?: () => void;
    viewMode?: "local" | "global";
    onViewModeChange?: (mode: "local" | "global") => void;
    onLoad?: () => void;
};

const Map = memo(forwardRef<MapHandle, MapProps>(function Map({
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
    onAddFeatureToProject,
    onDeleteFeature,
    onHideFeature,
    onUpdateFeature,
    allowGeometryEditing = true,
    applyGeometryBindingFilter = true,
    height = "100vh",
    fitToDraftBounds = false,
    fitBoundsKey = null,
    onFeatureClick,
    hoverPopupEnabled = false,
    getHoverPopupContent,
    onHoverFeatureChange,
    allowFeatureSelection = true,
    focusFeatureCollection = null,
    focusRequestKey = null,
    focusPadding,
    imageOverlay = null,
    onImageOverlayChange,
    onBindGeometries,
    localFeatureIds,
    showViewportControls = true,
    isPreviewMode = false,
    onEnterPreview,
    onExitPreview,
    onPlayPreviewReplay,
    viewMode = "local",
    onViewModeChange,
    onLoad,
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
    const getHoverPopupContentRef = useRef<MapProps["getHoverPopupContent"]>(getHoverPopupContent);
    const onHoverFeatureChangeRef = useRef<MapProps["onHoverFeatureChange"]>(onHoverFeatureChange);
    // Ref callback create mới nhất khi drawing engine tạo feature.
    const onCreateRef = useRef<MapProps["onCreateFeature"]>(onCreateFeature);
    // Ref callback add geometry global vào project mới nhất cho context menu select.
    const onAddFeatureToProjectRef = useRef<MapProps["onAddFeatureToProject"]>(onAddFeatureToProject);
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
    // Ref danh sách geometry thuộc local project để context menu phân biệt global-only feature.
    const localFeatureIdsRef = useRef<MapProps["localFeatureIds"]>(localFeatureIds);

    modeRef.current = mode;
    renderDraftRef.current = renderDraft;
    onSelectFeatureIdsRef.current = onSelectFeatureIds;
    onSetModeRef.current = onSetMode;
    onFeatureClickRef.current = onFeatureClick;
    getHoverPopupContentRef.current = getHoverPopupContent;
    onHoverFeatureChangeRef.current = onHoverFeatureChange;
    onCreateRef.current = onCreateFeature;
    onAddFeatureToProjectRef.current = onAddFeatureToProject;
    onDeleteRef.current = onDeleteFeature;
    onHideRef.current = onHideFeature;
    onUpdateRef.current = onUpdateFeature;
    imageOverlayRef.current = imageOverlay;
    onImageOverlayChangeRef.current = onImageOverlayChange;
    onBindGeometriesRef.current = onBindGeometries;
    localFeatureIdsRef.current = localFeatureIds;

    useEffect(() => {
        // Dynamically import MapLibre CSS to prevent it from blocking initial layout bundle CSS load.
        import("maplibre-gl/dist/maplibre-gl.css");
    }, []);

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
        localFeatureIdsRef,
        onAddFeatureToProjectRef,
        allowFeatureSelection,
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
        isPreviewMode: isPreviewMode || mode === "preview" || mode === "replay" || mode === "replay_preview",
    });

    useMapHoverPopup({
        mapRef,
        enabled: hoverPopupEnabled,
        renderDraftRef,
        getContentRef: getHoverPopupContentRef,
        onHoverFeatureChangeRef,
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

    useEffect(() => {
        if (isMapLoaded && onLoad) {
            onLoad();
        }
    }, [isMapLoaded, onLoad]);

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
            <div 
                ref={containerRef} 
                style={{ 
                    width: "100%", 
                    height: "100%", 
                    position: "relative", 
                    zIndex: 1, 
                    backgroundColor: "transparent" 
                }} 
            />

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
                            width: "fit-content",
                            maxWidth: "95%",
                            margin: "0 auto",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            background: "linear-gradient(135deg, rgba(30, 30, 30, 0.72) 0%, rgba(20, 20, 20, 0.85) 100%)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "50px",
                            padding: "8px 16px",
                            color: "#f8fafc",
                            boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.05)",
                            backdropFilter: "blur(8px)",
                            WebkitBackdropFilter: "blur(8px)",
                            pointerEvents: "auto",
                        }}
                    >
                        <style dangerouslySetInnerHTML={{ __html: `
                            .premium-zoom-btn {
                                width: 28px;
                                height: 28px;
                                border-radius: 8px;
                                border: 1px solid rgba(255, 255, 255, 0.15);
                                background: rgba(255, 255, 255, 0.08);
                                color: #ffffff;
                                font-size: 16px;
                                font-weight: 600;
                                cursor: pointer;
                                display: grid;
                                place-items: center;
                                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                                user-select: none;
                            }
                            .premium-zoom-btn:hover {
                                border-color: rgba(255, 255, 255, 0.3);
                                background: rgba(255, 255, 255, 0.15);
                            }
                            .premium-zoom-btn:active {
                                background: rgba(16, 185, 129, 0.25);
                                border-color: #10b981;
                            }
                            .premium-zoom-slider {
                                -webkit-appearance: none;
                                appearance: none;
                                flex: 1;
                                min-width: 80px;
                                height: 24px;
                                background: transparent;
                                cursor: pointer;
                                outline: none;
                            }
                            @media (max-width: 768px) {
                                .premium-zoom-slider {
                                    display: none !important;
                                }
                            }
                            .premium-zoom-slider::-webkit-slider-runnable-track {
                                width: 100%;
                                height: 6px;
                                background: rgba(255, 255, 255, 0.15);
                                border-radius: 999px;
                                border: 1px solid rgba(255, 255, 255, 0.05);
                                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
                                transition: all 0.2s;
                            }
                            .premium-zoom-slider:hover::-webkit-slider-runnable-track {
                                background: rgba(255, 255, 255, 0.25);
                                border-color: rgba(255, 255, 255, 0.1);
                            }
                            .premium-zoom-slider::-webkit-slider-thumb {
                                -webkit-appearance: none;
                                appearance: none;
                                margin-top: -6px;
                                height: 18px;
                                width: 18px;
                                border-radius: 50%;
                                background: radial-gradient(circle at 30% 30%, #34d399 0%, #059669 100%);
                                border: 1.5px solid #ffffff;
                                box-shadow: 0 0 10px rgba(16, 185, 129, 0.4), 0 3px 6px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.4);
                                cursor: pointer;
                                transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease;
                            }
                            .premium-zoom-slider:hover::-webkit-slider-thumb {
                                transform: scale(1.2);
                                box-shadow: 0 0 15px rgba(16, 185, 129, 0.6), 0 5px 10px rgba(0, 0, 0, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.5);
                            }
                            .premium-toggle-track {
                                width: 38px;
                                height: 20px;
                                border-radius: 999px;
                                border: 1px solid rgba(255, 255, 255, 0.2);
                                background: rgba(255, 255, 255, 0.1);
                                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
                                position: relative;
                                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                                flex: 0 0 auto;
                            }
                            .premium-toggle-track.active {
                                background: rgba(52, 211, 153, 0.35);
                                border-color: rgba(16, 185, 129, 0.6);
                                box-shadow: 0 0 8px rgba(16, 185, 129, 0.35), inset 0 1px 2px rgba(0, 0, 0, 0.2);
                            }
                            .premium-toggle-thumb {
                                position: absolute;
                                top: 1.5px;
                                left: 2px;
                                width: 15px;
                                height: 15px;
                                border-radius: 50%;
                                background: #94a3b8;
                                border: 1px solid rgba(255, 255, 255, 0.2);
                                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
                                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                            }
                            .premium-toggle-track.active .premium-toggle-thumb {
                                left: 19px;
                                background: #34d399;
                                box-shadow: 0 0 10px rgba(52, 211, 153, 0.6), 0 2px 4px rgba(0, 0, 0, 0.25);
                            }
                        `}} />
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
                                padding: "0 2px",
                                userSelect: "none",
                                cursor: "pointer",
                                flexShrink: 0,
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={isGlobeProjection}
                                onChange={(e) => setIsGlobeProjection(e.target.checked)}
                                aria-label="Toggle globe projection"
                                style={{ display: "none" }}
                            />
                            <div className={`premium-toggle-track ${isGlobeProjection ? "active" : ""}`}>
                                <span className="premium-toggle-thumb" />
                            </div>
                            <span
                                style={{
                                    fontSize: "12px",
                                    color: isGlobeProjection ? "#ffffff" : "#94a3b8",
                                    fontWeight: 700,
                                    minWidth: "40px",
                                    transition: "color 0.25s ease",
                                }}
                                className="hidden sm:block"
                            >
                                {isGlobeProjection ? "Globe" : "Flat"}
                            </span>
                        </label>

                        {onViewModeChange ? (
                            <div style={{ display: "flex", background: "rgba(255, 255, 255, 0.08)", borderRadius: "999px", padding: "2px", border: "1px solid rgba(255, 255, 255, 0.15)", gap: "2px", flexShrink: 0 }}>
                                <button
                                    type="button"
                                    onClick={() => onViewModeChange("local")}
                                    style={{
                                        padding: "4px 10px",
                                        borderRadius: "999px",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        background: viewMode === "local" ? "#2563eb" : "transparent",
                                        color: viewMode === "local" ? "white" : "#94a3b8",
                                        border: "none",
                                        cursor: "pointer",
                                        transition: "background 150ms, color 150ms",
                                    }}
                                >
                                    LOCAL
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onViewModeChange("global")}
                                    style={{
                                        padding: "4px 10px",
                                        borderRadius: "999px",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        background: viewMode === "global" ? "#2563eb" : "transparent",
                                        color: viewMode === "global" ? "white" : "#94a3b8",
                                        border: "none",
                                        cursor: "pointer",
                                        transition: "background 150ms, color 150ms",
                                    }}
                                >
                                    GLOBAL
                                </button>
                            </div>
                        ) : null}

                        {onEnterPreview || onExitPreview ? (
                            <button
                                type="button"
                                onClick={isPreviewMode ? onExitPreview : onEnterPreview}
                                className="premium-zoom-btn"
                                style={{
                                    width: "auto",
                                    minWidth: "76px",
                                    padding: "0 12px",
                                    background: isPreviewMode ? "rgba(51, 65, 85, 0.6)" : "rgba(16, 185, 129, 0.25)",
                                    borderColor: isPreviewMode ? "rgba(255,255,255,0.15)" : "#10b981",
                                    color: isPreviewMode ? "#ffffff" : "#34d399",
                                    flexShrink: 0,
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
                                className="premium-zoom-btn"
                                style={{
                                    width: "auto",
                                    minWidth: "64px",
                                    padding: "0 12px",
                                    display: "inline-flex",
                                    gap: "7px",
                                    background: "rgba(56, 189, 248, 0.15)",
                                    borderColor: "rgba(56, 189, 248, 0.4)",
                                    color: "#38bdf8",
                                    fontSize: "13px",
                                    flexShrink: 0,
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

                        <div className="hidden sm:flex items-center gap-[10px] flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => handleZoomByStep(-0.8)}
                                className="premium-zoom-btn"
                                style={{ flexShrink: 0 }}
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
                                className="premium-zoom-slider"
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
                                aria-label="Map zoom"
                            />

                            <button
                                type="button"
                                onClick={() => handleZoomByStep(0.8)}
                                className="premium-zoom-btn"
                                style={{ flexShrink: 0 }}
                                aria-label="Zoom in"
                            >
                                +
                            </button>

                            <div
                                style={{
                                    minWidth: "48px",
                                    textAlign: "right",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    color: "#94a3b8",
                                    fontVariantNumeric: "tabular-nums",
                                    flexShrink: 0,
                                }}
                            >
                                {zoomLevel.toFixed(1)}x
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}));

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
