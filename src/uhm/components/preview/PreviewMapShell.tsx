"use client";
import Image from "next/image";

import { type CSSProperties, type ReactNode, useState, useEffect } from "react";
import { apiGetCurrentUser } from "@/service/auth";
import ChatbotWidget from "@/uhm/components/ui/ChatbotWidget";
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
    onHoverFeatureChange?: (feature: Feature | null) => void;
    activeEntity?: Entity | null;
    activeWiki?: Wiki | null;
    isWikiLoading?: boolean;
    wikiError?: string | null;
    onCloseWikiSidebar?: () => void;
    onWikiLinkRequest?: (request: { slug: string; rect: DOMRect }) => void;
    onWikiLinkEntitySelectionRequest?: (request: { slug: string; rect: DOMRect }) => void;
    sidebarWidth?: number;
    onSidebarWidthChange?: (width: number) => void;
    maxSidebarDragWidth?: number;
    onPlayPreviewReplay?: () => void;
    mapHandleRef?: React.RefObject<import("@/uhm/components/Map").MapHandle | null>;
    overlay?: ReactNode;
    children?: ReactNode;
    onLoad?: () => void;
    instantLoad?: boolean;
    onToggleInstantLoad?: (val: boolean) => void;
    isLayerPanelVisible?: boolean;
    onLayerPanelVisibleChange?: (visible: boolean) => void;
    sidebarHeight?: number;
    onSidebarHeightChange?: (height: number) => void;
    showViewportControls?: boolean;
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
    onHoverFeatureChange,
    activeEntity = null,
    activeWiki = null,
    isWikiLoading = false,
    wikiError = null,
    onCloseWikiSidebar,
    onWikiLinkRequest,
    onWikiLinkEntitySelectionRequest,
    sidebarWidth,
    onSidebarWidthChange,
    maxSidebarDragWidth,
    onPlayPreviewReplay,
    mapHandleRef,
    overlay,
    children,
    onLoad,
    instantLoad = true,
    onToggleInstantLoad,
    isLayerPanelVisible: propsLayerPanelVisible,
    onLayerPanelVisibleChange,
    sidebarHeight,
    onSidebarHeightChange,
    showViewportControls = true,
}: Props) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [localLayerPanelVisible, setLocalLayerPanelVisible] = useState(true);
    const isLayerPanelVisible = propsLayerPanelVisible ?? localLayerPanelVisible;
    const setIsLayerPanelVisible = onLayerPanelVisibleChange ?? setLocalLayerPanelVisible;
    const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

    useEffect(() => {
        const checkDevice = () => setIsMobileOrTablet(window.innerWidth < 1024);
        checkDevice();
        window.addEventListener("resize", checkDevice);
        return () => window.removeEventListener("resize", checkDevice);
    }, []);

    useEffect(() => {
        const fetchUserAvatar = async () => {
            try {
                const userData = await apiGetCurrentUser({ skipRefresh: true });
                const nextAvatarUrl = getCurrentUserAvatarUrl(userData);
                if (nextAvatarUrl) setAvatarUrl(nextAvatarUrl);
            } catch {
                // Guest preview does not need an authenticated profile.
            }
        };
        fetchUserAvatar();
    }, []);

    const hasWikiSidebar = Boolean(activeEntity || activeWiki || isWikiLoading || wikiError);

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
        <div className="relative overflow-hidden bg-gray-950 text-gray-100" style={{ minHeight: "100svh", height: "100svh" }}>
            <div className="relative" style={{ minHeight: "100svh", height: "100svh" }}>
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
                    hoverPopupEnabled={hoverPopupEnabled && !isMobileOrTablet}
                    getHoverPopupContent={getHoverPopupContent}
                    onHoverFeatureChange={onHoverFeatureChange}
                    onPlayPreviewReplay={onPlayPreviewReplay}
                    onLoad={onLoad}
                    showViewportControls={showViewportControls && !isMobileOrTablet}
                    height="100svh"
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
                    onPlayReplay={onPlayPreviewReplay}
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
                        bottom: (hasWikiSidebar && isMobileOrTablet) ? `${(sidebarHeight || 400) + 20}px` : 20,
                        left: 18,
                        zIndex: 18,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        width: 58,
                        pointerEvents: "none",
                        transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                backdropFilter: "blur(8px)",
                                flexShrink: 0,
                                overflow: "hidden",
                                padding: 0,
                            }}
                        >
                            {avatarUrl ? (
                                <Image
                                    src={avatarUrl}
                                    alt="Cài đặt"
                                    width={46}
                                    height={46}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                    }}
                                />
                            ) : (
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#cbd5e1"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ transition: "color 0.2s ease" }}
                                >
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            )}
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
                                    onClick={() => {
                                        if (isMobileOrTablet) {
                                            alert("Tính năng quản trị và chỉnh sửa chỉ hỗ trợ trên máy tính.");
                                        } else {
                                            window.location.href = "/user";
                                        }
                                    }}
                                    title={isMobileOrTablet ? "Tính năng này chỉ hoạt động trên máy tính" : "Quản trị và chỉnh sửa"}
                                    style={{
                                        ...menuOptionStyle,
                                        opacity: isMobileOrTablet ? 0.5 : 1,
                                        cursor: isMobileOrTablet ? "not-allowed" : "pointer",
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => onToggleInstantLoad?.(!instantLoad)}
                                    title="Bật lên để load nhanh hơn"
                                    style={{
                                        ...menuOptionStyle,
                                        color: instantLoad ? "#fbbf24" : "#cbd5e1",
                                        border: instantLoad ? "1px solid rgba(251, 191, 36, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                                        boxShadow: instantLoad ? "0 0 12px rgba(251, 191, 36, 0.25)" : "0 2px 8px rgba(0, 0, 0, 0.12)",
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill={instantLoad ? "#fbbf24" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent("toggle-chatbot"));
                                    }}
                                    title="Trợ lý AI Lịch sử (Chatbot)"
                                    style={menuOptionStyle}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { window.location.href = "/faq"; }}
                                    title="Hỏi đáp và hướng dẫn"
                                    style={menuOptionStyle}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { window.location.href = "/about-us"; }}
                                    title="Về chúng tôi"
                                    style={menuOptionStyle}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                </button>

                                {!isLayerPanelVisible && (
                                    <button
                                        type="button"
                                        onClick={() => setIsLayerPanelVisible(true)}
                                        title="Hiện bảng lớp bản đồ"
                                        style={{
                                            ...menuOptionStyle,
                                            color: "#10b981",
                                            border: "1px solid rgba(16, 185, 129, 0.3)",
                                            boxShadow: "0 2px 8px rgba(16, 185, 129, 0.15)",
                                        }}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {isLayerPanelVisible && (
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
                                onHide={() => setIsLayerPanelVisible(false)}
                            />
                        </div>
                    )}
                </aside>


                
                {overlay}

                {hasWikiSidebar ? (
                    <aside
                        className={isMobileOrTablet ? "uhm-public-wiki-sidebar" : "uhm-public-wiki-sidebar absolute bottom-4 right-4 top-4 left-auto z-20 max-w-[calc(100vw-2rem)]"}
                        style={isMobileOrTablet ? {
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            top: "auto",
                            height: `${sidebarHeight || 400}px`,
                            maxHeight: "90vh",
                            width: "100%",
                            maxWidth: "100%",
                            zIndex: 20,
                            // Do not transition height during drag resizing for butter smoothness
                        } : {
                            width: `min(${sidebarWidth || 420}px, calc(100vw - 2rem))`,
                        }}
                    >
                        <PublicWikiSidebar
                            entity={activeEntity}
                            wiki={activeWiki}
                            isLoading={isWikiLoading}
                            error={wikiError}
                            onClose={onCloseWikiSidebar || (() => {})}
                            onWikiLinkRequest={onWikiLinkRequest || (() => {})}
                            onWikiLinkEntitySelectionRequest={onWikiLinkEntitySelectionRequest}
                            sidebarWidth={sidebarWidth}
                            onSidebarWidthChange={onSidebarWidthChange}
                            maxDragWidth={maxSidebarDragWidth}
                            compactHeader
                            sidebarHeight={sidebarHeight}
                            onSidebarHeightChange={onSidebarHeightChange}
                        />
                    </aside>
                ) : null}

                <ChatbotWidget hideFloatingButton />
                {children}
            </div>
        </div>
    );
}

function getCurrentUserAvatarUrl(value: unknown): string | null {
    if (!value || typeof value !== "object") return null;
    const data = (value as { data?: unknown }).data;
    if (!data || typeof data !== "object") return null;
    const profile = (data as { profile?: unknown }).profile;
    if (!profile || typeof profile !== "object") return null;
    const avatarUrl = (profile as { avatar_url?: unknown }).avatar_url;
    return typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl : null;
}
