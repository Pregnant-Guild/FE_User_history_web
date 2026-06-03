"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import Map, { type MapFeaturePayload } from "@/uhm/components/Map";
import ReplayPreviewLayerPanel from "@/uhm/components/editor/ReplayPreviewLayerPanel";
import PublicWikiSidebar from "@/uhm/components/wiki/PublicWikiSidebar";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import type { MapHoverPopupContent } from "@/uhm/components/map/useMapHoverPopup";
import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";
import type { BackgroundLayerId, BackgroundLayerVisibility } from "@/uhm/lib/map/styles/backgroundLayers";
import type { FeatureCollection } from "@/uhm/types/geo";
import type { Feature } from "@/uhm/lib/editor/state/useEditorState";

type Props = {
    renderDraft: FeatureCollection;
    labelContextDraft: FeatureCollection;
    labelTimelineYear?: number | null;
    selectedFeatureIds: (string | number)[];
    onSelectFeatureIds: (ids: (string | number)[]) => void;
    backgroundVisibility: BackgroundLayerVisibility;
    geometryVisibility: Record<string, boolean>;
    onToggleBackground: (id: BackgroundLayerId) => void;
    onToggleGeometry: (typeKey: string) => void;
    timelineYear: number;
    onTimelineYearChange: (year: number) => void;
    timelineTimeRange?: number;
    onTimelineTimeRangeChange?: (range: number) => void;
    timelineFilterEnabled?: boolean;
    onTimelineFilterEnabledChange?: (enabled: boolean) => void;
    isTimelineLoading: boolean;
    timelineDisabled?: boolean;
    timelineStatusText?: string | null;
    timelineStyle?: CSSProperties;
    onFeatureClick?: (payload: MapFeaturePayload | null) => void;
    hoverPopupEnabled?: boolean;
    getHoverPopupContent?: (feature: Feature) => MapHoverPopupContent | null;
    activeEntity?: Entity | null;
    activeWiki?: Wiki | null;
    isWikiLoading?: boolean;
    wikiError?: string | null;
    onCloseWikiSidebar?: () => void;
    onWikiLinkRequest?: (request: { slug: string; rect: DOMRect }) => void;
    sidebarWidth?: number;
    onSidebarWidthChange?: (width: number) => void;
    maxSidebarDragWidth?: number;
    onPlayPreviewReplay?: () => void;
    mapHandleRef?: React.RefObject<import("@/uhm/components/Map").MapHandle | null>;
    overlay?: ReactNode;
    children?: ReactNode;
    onLoad?: () => void;
};

export default function PreviewMapShell({
    renderDraft,
    labelContextDraft,
    labelTimelineYear,
    selectedFeatureIds,
    onSelectFeatureIds,
    backgroundVisibility,
    geometryVisibility,
    onToggleBackground,
    onToggleGeometry,
    timelineYear,
    onTimelineYearChange,
    timelineTimeRange,
    onTimelineTimeRangeChange,
    timelineFilterEnabled,
    onTimelineFilterEnabledChange,
    isTimelineLoading,
    timelineDisabled = false,
    timelineStatusText = null,
    timelineStyle,
    onFeatureClick,
    hoverPopupEnabled = false,
    getHoverPopupContent,
    activeEntity = null,
    activeWiki = null,
    isWikiLoading = false,
    wikiError = null,
    onCloseWikiSidebar,
    onWikiLinkRequest,
    sidebarWidth,
    onSidebarWidthChange,
    maxSidebarDragWidth,
    onPlayPreviewReplay,
    mapHandleRef,
    overlay,
    children,
    onLoad,
}: Props) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const menuOptionStyle: CSSProperties = {
        width: 46,
        height: 46,
        backgroundColor: "#1e293b",
        color: "#cbd5e1",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
        backdropFilter: "blur(6px)",
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-gray-950 text-gray-100">
            <div className="relative min-h-screen">
                <Map
                    ref={mapHandleRef}
                    mode="preview"
                    renderDraft={renderDraft}
                    labelContextDraft={labelContextDraft}
                    labelTimelineYear={labelTimelineYear}
                    selectedFeatureIds={selectedFeatureIds}
                    onSelectFeatureIds={onSelectFeatureIds}
                    backgroundVisibility={backgroundVisibility}
                    geometryVisibility={geometryVisibility}
                    allowGeometryEditing={false}
                    allowFeatureSelection
                    applyGeometryBindingFilter
                    isPreviewMode
                    onFeatureClick={onFeatureClick}
                    hoverPopupEnabled={hoverPopupEnabled}
                    getHoverPopupContent={getHoverPopupContent}
                    onPlayPreviewReplay={onPlayPreviewReplay}
                    onLoad={onLoad}
                />

                <TimelineBar
                    year={timelineYear}
                    onYearChange={onTimelineYearChange}
                    timeRange={timelineTimeRange}
                    onTimeRangeChange={onTimelineTimeRangeChange}
                    isLoading={isTimelineLoading}
                    disabled={timelineDisabled}
                    statusText={timelineStatusText}
                    filterEnabled={timelineFilterEnabled}
                    onFilterEnabledChange={onTimelineFilterEnabledChange}
                    style={timelineStyle}
                />

                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes slideDown {
                        from {
                            opacity: 0;
                            transform: translateY(-8px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                `}} />

                <aside
                    style={{
                        position: "absolute",
                        top: 10,
                        bottom: 20,
                        left: 18,
                        zIndex: 18,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        width: 58,
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            alignItems: "center",
                            pointerEvents: "auto",
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            title={isMenuOpen ? "Đóng cài đặt" : "Tham gia hệ thống / Trợ giúp"}
                            aria-label="Cài đặt"
                            style={{
                                width: 46,
                                height: 46,
                                backgroundColor: "#1e293b",
                                color: "#f8fafc",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                backdropFilter: "blur(8px)",
                                flexShrink: 0,
                            }}
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>

                        {isMenuOpen && (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    alignItems: "center",
                                    animation: "slideDown 0.2s ease-out",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => { window.location.href = "/user"; }}
                                    title="Quản trị & Chỉnh sửa (Edit)"
                                    style={menuOptionStyle}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { window.location.href = "/faq"; }}
                                    title="Hỏi đáp & Hướng dẫn (FAQ)"
                                    style={menuOptionStyle}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { window.location.href = "/about-us"; }}
                                    title="Về chúng tôi (About Us)"
                                    style={menuOptionStyle}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>

                    <div
                        style={{
                            flexGrow: 1,
                            flexShrink: 1,
                            minHeight: 0,
                            display: "flex",
                            flexDirection: "column",
                            pointerEvents: "auto",
                        }}
                    >
                        <ReplayPreviewLayerPanel
                            backgroundVisibility={backgroundVisibility}
                            geometryVisibility={geometryVisibility}
                            onToggleBackground={onToggleBackground}
                            onToggleGeometry={onToggleGeometry}
                        />
                    </div>
                </aside>
                
                {overlay}

                {activeEntity ? (
                    <aside className="absolute bottom-4 right-4 top-4 z-20 max-w-[calc(100vw-2rem)]">
                        <PublicWikiSidebar
                            entity={activeEntity}
                            wiki={activeWiki}
                            isLoading={isWikiLoading}
                            error={wikiError}
                            onClose={onCloseWikiSidebar || (() => {})}
                            onWikiLinkRequest={onWikiLinkRequest || (() => {})}
                            sidebarWidth={sidebarWidth}
                            onSidebarWidthChange={onSidebarWidthChange}
                            maxDragWidth={maxSidebarDragWidth}
                            compactHeader
                        />
                    </aside>
                ) : null}

                {children}
            </div>
        </div>
    );
}
