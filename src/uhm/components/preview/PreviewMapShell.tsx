"use client";

import type { CSSProperties, ReactNode } from "react";
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
}: Props) {
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

                <aside
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: 18,
                        transform: "translateY(-50%)",
                        zIndex: 16,
                        pointerEvents: "auto",
                    }}
                >
                    <ReplayPreviewLayerPanel
                        backgroundVisibility={backgroundVisibility}
                        geometryVisibility={geometryVisibility}
                        onToggleBackground={onToggleBackground}
                        onToggleGeometry={onToggleGeometry}
                    />
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
