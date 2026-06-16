"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MapHandle } from "@/uhm/components/Map";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from "@/uhm/lib/map/constants";

export function PublicMapZoomPanel({
    mapHandleRef,
    onPlayPreviewReplay,
    onResumePreviewReplay,
    onStopPreviewReplay,
}: {
    mapHandleRef: RefObject<MapHandle | null>;
    onPlayPreviewReplay?: () => void;
    onResumePreviewReplay?: () => void;
    onStopPreviewReplay?: () => void;
}) {
    const [zoomLevel, setZoomLevel] = useState(2);
    const [isGlobeProjection, setIsGlobeProjection] = useState(false);
    const isDraggingRef = useRef(false);

    useEffect(() => {
        let disposed = false;
        let cleanup: (() => void) | null = null;
        let retryTimer: number | null = null;

        const bind = () => {
            if (disposed) return;
            const map = mapHandleRef.current?.getMap();
            if (!map) {
                retryTimer = window.setTimeout(bind, 120);
                return;
            }

            const syncProjection = () => {
                const projection = mapHandleRef.current?.getViewState()?.projection;
                setIsGlobeProjection(projection === "globe");
            };

            const syncZoom = () => {
                if (isDraggingRef.current) return;
                setZoomLevel(roundPanelZoom(map.getZoom()));
            };

            syncZoom();
            syncProjection();
            map.on("zoom", syncZoom);
            map.on("zoomend", syncZoom);
            map.on("styledata", syncProjection);
            cleanup = () => {
                map.off("zoom", syncZoom);
                map.off("zoomend", syncZoom);
                map.off("styledata", syncProjection);
            };
        };

        bind();
        return () => {
            disposed = true;
            if (retryTimer) window.clearTimeout(retryTimer);
            cleanup?.();
        };
    }, [mapHandleRef]);

    const toggleProjection = () => {
        const next = !isGlobeProjection;
        setIsGlobeProjection(next);
        mapHandleRef.current?.setGlobeProjection(next);
    };

    const zoomByStep = (delta: number) => {
        const map = mapHandleRef.current?.getMap();
        if (!map) return;
        const next = clampZoom(zoomLevel + delta);
        setZoomLevel(next);
        map.easeTo({ zoom: next, duration: 120 });
    };

    const handleSliderChange = (nextRaw: number) => {
        const map = mapHandleRef.current?.getMap();
        if (!map || !Number.isFinite(nextRaw)) return;
        const next = clampZoom(nextRaw);
        setZoomLevel(next);
        map.jumpTo({ zoom: next });
    };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexShrink: 0,
                minWidth: 0,
                background: "linear-gradient(135deg, rgba(30, 30, 30, 0.72) 0%, rgba(20, 20, 20, 0.85) 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 50,
                padding: "8px 14px",
                color: "#f8fafc",
                boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.05)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                pointerEvents: "auto",
            }}
        >
            <style jsx>{`
                .uhm-public-zoom-btn {
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
                    flex: 0 0 auto;
                }
                .uhm-public-zoom-btn:hover {
                    border-color: rgba(255, 255, 255, 0.3);
                    background: rgba(255, 255, 255, 0.15);
                }
                .uhm-public-zoom-btn:active {
                    background: rgba(16, 185, 129, 0.25);
                    border-color: #10b981;
                }
                .uhm-public-zoom-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    width: clamp(72px, 12vw, 132px);
                    height: 24px;
                    background: transparent;
                    cursor: pointer;
                    outline: none;
                    flex: 1 1 72px;
                    min-width: 0;
                }
                .uhm-public-zoom-slider::-webkit-slider-runnable-track {
                    width: 100%;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 999px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.2s;
                }
                .uhm-public-zoom-slider:hover::-webkit-slider-runnable-track {
                    background: rgba(255, 255, 255, 0.25);
                    border-color: rgba(255, 255, 255, 0.1);
                }
                .uhm-public-zoom-slider::-webkit-slider-thumb {
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
                .uhm-public-zoom-slider:hover::-webkit-slider-thumb {
                    transform: scale(1.2);
                    box-shadow: 0 0 15px rgba(16, 185, 129, 0.6), 0 5px 10px rgba(0, 0, 0, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.5);
                }
                .uhm-public-projection-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    border: 0;
                    background: transparent;
                    color: #94a3b8;
                    cursor: pointer;
                    padding: 0 2px 0 0;
                    user-select: none;
                    flex: 0 0 auto;
                }
                .uhm-public-projection-track {
                    width: 36px;
                    height: 20px;
                    border-radius: 999px;
                    background: rgba(148, 163, 184, 0.18);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
                    position: relative;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .uhm-public-projection-track.active {
                    background: rgba(52, 211, 153, 0.35);
                    border-color: rgba(16, 185, 129, 0.6);
                    box-shadow: 0 0 8px rgba(16, 185, 129, 0.35), inset 0 1px 2px rgba(0, 0, 0, 0.2);
                }
                .uhm-public-projection-thumb {
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
                .uhm-public-projection-track.active .uhm-public-projection-thumb {
                    left: 19px;
                    background: #34d399;
                    box-shadow: 0 0 10px rgba(52, 211, 153, 0.6), 0 2px 4px rgba(0, 0, 0, 0.25);
                }
                .uhm-public-projection-label {
                    font-size: 12px;
                    color: #94a3b8;
                    font-weight: 700;
                    min-width: 40px;
                    text-align: left;
                    transition: color 0.25s ease;
                }
                .uhm-public-projection-label.active {
                    color: #ffffff;
                }
                .uhm-public-play-btn {
                    width: auto;
                    min-width: 64px;
                    height: 28px;
                    padding: 0 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    background: rgba(56, 189, 248, 0.15);
                    color: #38bdf8;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                    flex: 0 0 auto;
                }
                .uhm-public-play-btn:hover {
                    border-color: rgba(56, 189, 248, 0.65);
                    background: rgba(56, 189, 248, 0.24);
                    color: #7dd3fc;
                }
                .uhm-public-play-btn.stop {
                    border-color: rgba(248, 113, 113, 0.45);
                    background: rgba(127, 29, 29, 0.45);
                    color: #fecaca;
                }
                .uhm-public-play-btn.stop:hover {
                    border-color: rgba(248, 113, 113, 0.75);
                    background: rgba(153, 27, 27, 0.62);
                    color: #ffffff;
                }
                .uhm-public-play-btn.resume {
                    border-color: rgba(34, 197, 94, 0.45);
                    background: rgba(22, 101, 52, 0.45);
                    color: #bbf7d0;
                }
                .uhm-public-play-btn.resume:hover {
                    border-color: rgba(34, 197, 94, 0.75);
                    background: rgba(22, 163, 74, 0.5);
                    color: #ffffff;
                }
                .uhm-public-play-icon {
                    width: 0;
                    height: 0;
                    border-top: 5px solid transparent;
                    border-bottom: 5px solid transparent;
                    border-left: 8px solid currentColor;
                }
                .uhm-public-stop-icon {
                    width: 9px;
                    height: 9px;
                    border-radius: 2px;
                    background: currentColor;
                }
            `}</style>
            <button
                type="button"
                onClick={toggleProjection}
                className="uhm-public-projection-toggle"
                aria-label="Chuyển chế độ hiển thị hình cầu"
                title={isGlobeProjection ? "Đang ở chế độ hình cầu" : "Đang ở chế độ bản đồ phẳng"}
            >
                <span className={`uhm-public-projection-track ${isGlobeProjection ? "active" : ""}`}>
                    <span className="uhm-public-projection-thumb" />
                </span>
                <span className={`uhm-public-projection-label ${isGlobeProjection ? "active" : ""}`}>
                    {isGlobeProjection ? "Cầu" : "Phẳng"}
                </span>
            </button>
            {onPlayPreviewReplay ? (
                <button
                    type="button"
                    onClick={onPlayPreviewReplay}
                    className="uhm-public-play-btn"
                    aria-label="Phát diễn biến đã chọn"
                    title="Phát diễn biến của hình đang chọn"
                >
                    <span aria-hidden="true" className="uhm-public-play-icon" />
                    Phát
                </button>
            ) : null}
            {onResumePreviewReplay ? (
                <button
                    type="button"
                    onClick={onResumePreviewReplay}
                    className="uhm-public-play-btn resume"
                    aria-label="Tiếp tục diễn biến đã chọn"
                    title="Tiếp tục diễn biến đang tạm dừng"
                >
                    <span aria-hidden="true" className="uhm-public-play-icon" />
                    Tiếp tục
                </button>
            ) : null}
            {onStopPreviewReplay ? (
                <button
                    type="button"
                    onClick={onStopPreviewReplay}
                    className="uhm-public-play-btn stop"
                    aria-label="Dừng diễn biến đã chọn"
                    title="Dừng diễn biến đang phát"
                >
                    <span aria-hidden="true" className="uhm-public-stop-icon" />
                    Dừng
                </button>
            ) : null}
            <button
                type="button"
                onClick={() => zoomByStep(-0.8)}
                className="uhm-public-zoom-btn"
                aria-label="Thu nhỏ bản đồ"
            >
                -
            </button>
            <input
                type="range"
                min={MAP_MIN_ZOOM}
                max={MAP_MAX_ZOOM}
                step={0.1}
                value={zoomLevel}
                className="uhm-public-zoom-slider"
                onPointerDown={() => {
                    isDraggingRef.current = true;
                }}
                onPointerUp={() => {
                    isDraggingRef.current = false;
                    const map = mapHandleRef.current?.getMap();
                    if (map) setZoomLevel(roundPanelZoom(map.getZoom()));
                }}
                onPointerCancel={() => {
                    isDraggingRef.current = false;
                }}
                onBlur={() => {
                    isDraggingRef.current = false;
                }}
                onChange={(event) => handleSliderChange(Number(event.target.value))}
                aria-label="Mức thu phóng bản đồ"
            />
            <button
                type="button"
                onClick={() => zoomByStep(0.8)}
                className="uhm-public-zoom-btn"
                aria-label="Phóng to bản đồ"
            >
                +
            </button>
            <div
                style={{
                    minWidth: 48,
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#94a3b8",
                    fontVariantNumeric: "tabular-nums",
                    flex: "0 0 auto",
                }}
            >
                {zoomLevel.toFixed(1)}x
            </div>
        </div>
    );
}

function clampZoom(value: number): number {
    if (!Number.isFinite(value)) return MAP_MIN_ZOOM;
    return Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, value));
}

function roundPanelZoom(value: number): number {
    if (!Number.isFinite(value)) return MAP_MIN_ZOOM;
    return Math.round(value * 10) / 10;
}
