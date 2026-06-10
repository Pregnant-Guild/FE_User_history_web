import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection } from "@/uhm/lib/editor/state/useEditorState";
import { FEATURE_STATE_SOURCE_IDS } from "@/uhm/lib/map/constants";

export type MapHoverPopupContent = {
    key?: string;
    rows: Array<{
        title: string;
        titleTone?: "danger" | "default";
        isGroupHeader?: boolean;
        description?: string | null;
        titleTimeRange?: string | null;
        titleTimeRangeTone?: "success" | "muted";
        separatorBefore?: boolean;
        quote?: string | null;
        quoteTone?: "danger" | "default";
        onClick?: () => void;
    }>;
};

type UseMapHoverPopupProps = {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    enabled: boolean;
    renderDraftRef: React.MutableRefObject<FeatureCollection>;
    getContentRef: React.MutableRefObject<((feature: Feature) => MapHoverPopupContent | null) | undefined>;
    onHoverFeatureChangeRef?: React.MutableRefObject<((feature: Feature | null) => void) | undefined>;
};

export function useMapHoverPopup({
    mapRef,
    enabled,
    renderDraftRef,
    getContentRef,
    onHoverFeatureChangeRef,
}: UseMapHoverPopupProps) {
    const enabledRef = useRef(enabled);

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !enabled) return;

        // Disable hover popup if the device has no hover capability (mobile/tablet)
        const hasHoverSupport = window.matchMedia("(hover: hover)").matches;
        if (!hasHoverSupport) return;

        const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: "uhm-map-hover-popup",
        });

        let hoveredKey: string | null = null;
        let frameId: number | null = null;
        let pendingEvent: maplibregl.MapMouseEvent | null = null;
        let lastMapMouseEvent: maplibregl.MapMouseEvent | null = null;
        let currentContent: MapHoverPopupContent | null = null;
        let selectedRowIndex = 0;
        let selectionVisible = false;
        let selectionDirection: "next" | "prev" | null = null;
        let lastSelectedRowClick: (() => void) | null = null;
        let lastSelectedRowAt = 0;
        let hoverLayerIds = getHoverLayerIds(map);
        let activeFeatureId: string | null = null;
        let featureLookupDraft: FeatureCollection | null = null;
        let featureById = new Map<string, Feature>();

        const refreshHoverLayerIds = () => {
            hoverLayerIds = getHoverLayerIds(map);
        };

        const getSourceFeatureById = (id: string) => {
            const draft = renderDraftRef.current;
            if (draft !== featureLookupDraft) {
                featureLookupDraft = draft;
                featureById = new Map(draft.features.map((item) => [String(item.properties.id), item]));
            }
            return featureById.get(id) || null;
        };

        const removePopup = () => {
            hoveredKey = null;
            currentContent = null;
            selectedRowIndex = 0;
            selectionVisible = false;
            if (activeFeatureId !== null) {
                activeFeatureId = null;
                onHoverFeatureChangeRef?.current?.(null);
            }
            popup.remove();
        };

        const getCurrentRows = () => getSelectableRows(currentContent);

        const syncSelectedRow = () => {
            const rows = getCurrentRows();
            if (!rows.length) return;
            selectedRowIndex = wrapIndex(selectedRowIndex, rows.length);
            lastSelectedRowClick = rows[selectedRowIndex]?.onClick || null;
            lastSelectedRowAt = Date.now();
            updatePopupRowSelection(popup, selectedRowIndex, selectionVisible, selectionDirection);
        };

        const cyclePopupRow = (direction: "next" | "prev") => {
            const rows = getCurrentRows();
            if (!rows.length) return;
            const currentIndex = wrapIndex(selectedRowIndex, rows.length);
            const nextIndex = direction === "prev"
                ? Math.max(0, currentIndex - 1)
                : Math.min(rows.length - 1, currentIndex + 1);
            selectionDirection = direction;
            if (nextIndex === currentIndex) {
                selectedRowIndex = currentIndex;
                syncSelectedRow();
                return;
            }
            selectedRowIndex = nextIndex;
            syncSelectedRow();
        };

        const onWheel = (event: WheelEvent) => {
            if (!event.shiftKey) return;
            if (isEditableEventTarget(event.target)) return;

            const rows = getCurrentRows();
            if (!rows.length) return;

            const target = event.target instanceof HTMLElement ? event.target : null;
            const insidePopup = Boolean(target?.closest(".uhm-map-hover-popup"));
            const insideMap = target ? map.getContainer().contains(target) : false;
            if (!insidePopup && !insideMap) return;

            const direction = event.deltaY > 0 ? "next" : event.deltaY < 0 ? "prev" : null;
            if (!direction) return;

            event.preventDefault();
            event.stopPropagation();
            selectionVisible = true;
            cyclePopupRow(direction);
        };

        const onCommitPopupRow = () => {
            const rows = getCurrentRows();
            const selectedRowClick = rows.length
                ? rows[wrapIndex(selectedRowIndex, rows.length)]?.onClick
                : (Date.now() - lastSelectedRowAt < 1200 ? lastSelectedRowClick : null);
            selectedRowClick?.();
            if (rows.length || selectedRowClick) {
                removePopup();
            }
        };

        const requestPopupUpdateFromLastMouseEvent = () => {
            if (!lastMapMouseEvent || !enabledRef.current) return;
            pendingEvent = lastMapMouseEvent;
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(updatePopup);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Shift") {
                if (event.repeat) return;
                if (isEditableEventTarget(event.target)) return;
                selectionVisible = true;
                updatePopupRowSelection(popup, selectedRowIndex, selectionVisible, selectionDirection);
                requestPopupUpdateFromLastMouseEvent();
                return;
            }

            if (event.key !== "Enter") return;
            if (isEditableEventTarget(event.target)) return;
            if (!getCurrentRows().length) return;

            event.preventDefault();
            event.stopPropagation();
            onCommitPopupRow();
        };

        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key !== "Shift") return;
            if (isEditableEventTarget(event.target)) return;

            if (!getCurrentRows().length && lastMapMouseEvent) {
                if (frameId !== null) {
                    window.cancelAnimationFrame(frameId);
                    frameId = null;
                }
                pendingEvent = pendingEvent || lastMapMouseEvent;
                updatePopup();
            }

            event.preventDefault();
            event.stopPropagation();
            onCommitPopupRow();
        };

        const updatePopup = () => {
            frameId = null;
            const event = pendingEvent;
            pendingEvent = null;

            if (!event || !enabledRef.current) {
                removePopup();
                return;
            }

            if (!hoverLayerIds.length) {
                removePopup();
                return;
            }

            let features: maplibregl.MapGeoJSONFeature[];
            try {
                features = map.queryRenderedFeatures(event.point, { layers: hoverLayerIds }) as maplibregl.MapGeoJSONFeature[];
            } catch {
                refreshHoverLayerIds();
                removePopup();
                return;
            }
            if (!features.length) {
                removePopup();
                return;
            }

            const renderedFeature = pickPreferredFeature(features);
            const rawId = renderedFeature.id ?? renderedFeature.properties?.id;
            if (rawId === undefined || rawId === null) {
                removePopup();
                return;
            }

            const id = String(rawId);
            const sourceFeature = getSourceFeatureById(id);
            if (!sourceFeature) {
                removePopup();
                return;
            }
            if (id !== activeFeatureId) {
                activeFeatureId = id;
                onHoverFeatureChangeRef?.current?.(sourceFeature);
            }

            const content = getContentRef.current?.(sourceFeature) || null;
            if (!content?.rows?.some((row) => row.title.trim())) {
                removePopup();
                return;
            }

            const contentKey = buildContentKey(id, content);
            const contentChanged = contentKey !== hoveredKey;
            const shouldStylePopup = contentChanged || !popup.isOpen();
            if (contentKey !== hoveredKey) {
                hoveredKey = contentKey;
                currentContent = content;
                selectedRowIndex = 0;
                if (!selectionVisible) {
                    selectionVisible = Boolean(event.originalEvent?.shiftKey);
                }
                popup.setDOMContent(buildPopupNode(content, selectedRowIndex, selectionVisible));
            }

            popup.setLngLat(event.lngLat);
            if (!popup.isOpen()) {
                popup.addTo(map);
            }
            if (shouldStylePopup) {
                stylePopupChrome(popup);
            }
            if (contentChanged) {
                syncSelectedRow();
            }
        };

        const onMouseMove = (event: maplibregl.MapMouseEvent) => {
            lastMapMouseEvent = event;
            pendingEvent = event;
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(updatePopup);
        };

        const onMouseOut = () => {
            lastMapMouseEvent = null;
            pendingEvent = null;
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
                frameId = null;
            }
            removePopup();
        };

        map.on("mousemove", onMouseMove);
        map.on("mouseout", onMouseOut);
        map.on("dragstart", removePopup);
        map.on("zoomstart", removePopup);
        map.on("styledata", refreshHoverLayerIds);
        window.addEventListener("wheel", onWheel, { passive: false, capture: true });
        window.addEventListener("keydown", onKeyDown, { capture: true });
        window.addEventListener("keyup", onKeyUp, { capture: true });

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            map.off("mousemove", onMouseMove);
            map.off("mouseout", onMouseOut);
            map.off("dragstart", removePopup);
            map.off("zoomstart", removePopup);
            map.off("styledata", refreshHoverLayerIds);
            window.removeEventListener("wheel", onWheel, { capture: true });
            window.removeEventListener("keydown", onKeyDown, { capture: true });
            window.removeEventListener("keyup", onKeyUp, { capture: true });
            popup.remove();
        };
    }, [enabled, getContentRef, mapRef, onHoverFeatureChangeRef, renderDraftRef]);
}

function getHoverLayerIds(map: maplibregl.Map): string[] {
    const style = map.getStyle();
    if (!style?.layers) return [];

    return style.layers
        .filter((layer) =>
            "source" in layer &&
            typeof layer.source === "string" &&
            FEATURE_STATE_SOURCE_IDS.includes(layer.source as (typeof FEATURE_STATE_SOURCE_IDS)[number])
        )
        .map((layer) => layer.id);
}

function pickPreferredFeature(features: maplibregl.MapGeoJSONFeature[]) {
    let best = features[0];
    let bestPriority = featureSelectPriority(best);
    for (let index = 1; index < features.length; index += 1) {
        const candidate = features[index];
        const priority = featureSelectPriority(candidate);
        if (priority > bestPriority) {
            best = candidate;
            bestPriority = priority;
        }
    }
    return best;
}

function featureSelectPriority(feature: maplibregl.MapGeoJSONFeature) {
    const layerId = typeof feature.layer?.id === "string" ? feature.layer.id : "";
    const geometryType = feature.geometry?.type;
    const source = typeof feature.source === "string" ? feature.source : "";

    if (layerId.endsWith("-hit")) return 400;
    if (source === "path-arrow-shapes") return 300;
    if (geometryType === "LineString" || geometryType === "MultiLineString") return 200;
    if (geometryType === "Point" || geometryType === "MultiPoint") return 100;
    return 0;
}

function buildPopupNode(content: MapHoverPopupContent, selectedRowIndex: number, selectionVisible: boolean): HTMLElement {
    ensureHoverPopupScrollbarStyle();

    const root = document.createElement("div");
    root.className = "uhm-map-hover-popup-body";
    root.dataset.hoverPopupScrollRoot = "true";
    root.style.width = "320px";
    root.style.maxWidth = "calc(100vw - 2rem)";
    root.style.maxHeight = "300px";
    root.style.overflowY = "auto";
    root.style.padding = "12px";
    root.style.border = "1px solid rgba(255, 255, 255, 0.10)";
    root.style.borderRadius = "0px";
    root.style.background = "rgba(2, 6, 23, 0.95)";
    root.style.boxShadow = "0 18px 36px rgba(0, 0, 0, 0.35)";
    root.style.backdropFilter = "blur(8px)";
    root.style.color = "#e2e8f0";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gap = "5px";
    root.appendChild(grid);

    const rows = normalizeRows(content);
    let selectableRowIndex = 0;
    rows.forEach((row) => {
        const titleText = row.title.trim();

        if (row.separatorBefore) {
            const separator = document.createElement("div");
            separator.style.height = "1px";
            separator.style.margin = "2px 0";
            separator.style.background = "rgba(255, 255, 255, 0.16)";
            separator.style.pointerEvents = "none";
            grid.appendChild(separator);
        }

        const isGroupHeader = Boolean(row.isGroupHeader);
        const rowSelectionIndex = isGroupHeader ? null : selectableRowIndex++;
        const card: HTMLButtonElement | HTMLDivElement = row.onClick
            ? document.createElement("button")
            : document.createElement("div");
        if (row.onClick) {
            (card as HTMLButtonElement).type = "button";
            card.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                row.onClick?.();
            };
        }
        card.style.width = isGroupHeader ? "100%" : "calc(100% - 18px)";
        card.style.marginLeft = isGroupHeader ? "0" : "18px";
        card.style.border = isGroupHeader ? "0" : "1px solid transparent";
        card.style.borderRadius = "0px";
        card.style.background = "transparent";
        card.style.padding = isGroupHeader ? "8px 2px 3px" : "7px 9px";
        card.style.textAlign = "left";
        card.style.font = "inherit";
        card.style.cursor = row.onClick ? "pointer" : "default";
        card.style.display = "block";
        card.style.outline = "none";
        card.style.appearance = "none";
        card.style.webkitAppearance = "none";
        card.style.transition = "border-color 140ms ease, background 140ms ease";
        if (rowSelectionIndex !== null) {
            card.dataset.hoverPopupRowIndex = String(rowSelectionIndex);
        }
        if (isGroupHeader) {
            card.dataset.hoverPopupGroupHeader = "true";
        }
        if (row.onClick) {
            card.onmouseenter = () => {
                if (card.dataset.hoverPopupSelected === "true") return;
                card.style.borderColor = "transparent";
                card.style.background = "rgba(14, 165, 233, 0.08)";
            };
            card.onmouseleave = () => {
                if (card.dataset.hoverPopupSelected === "true") {
                    applyPopupRowStyle(card, true);
                    return;
                }
                card.style.borderColor = "transparent";
                card.style.background = "transparent";
            };
        }

        const title = document.createElement("div");
        title.style.fontSize = isGroupHeader ? "14px" : "13px";
        title.style.fontWeight = isGroupHeader ? "800" : "650";
        title.style.lineHeight = isGroupHeader ? "20px" : "18px";
        title.style.color = row.titleTone === "danger" ? "#f87171" : (isGroupHeader ? "#ffffff" : "#e5edf7");
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        title.style.whiteSpace = "nowrap";
        const descriptionText = row.description?.trim();
        if (row.titleTimeRange?.trim()) {
            const nameSpan = document.createElement("span");
            nameSpan.textContent = titleText;
            title.appendChild(nameSpan);

            const rangeSpan = document.createElement("span");
            rangeSpan.textContent = ` (${row.titleTimeRange.trim()})`;
            rangeSpan.style.color = row.titleTimeRangeTone === "success" ? "#34d399" : "#94a3b8";
            rangeSpan.style.fontWeight = "700";
            title.appendChild(rangeSpan);
        } else {
            title.textContent = titleText;
        }
        card.appendChild(title);

        if (isGroupHeader && descriptionText) {
            const descriptionWrap = document.createElement("div");
            descriptionWrap.className = "uhm-map-hover-popup-description-marquee";
            descriptionWrap.title = descriptionText;

            const descriptionSpan = document.createElement("span");
            descriptionSpan.textContent = descriptionText;
            descriptionWrap.appendChild(descriptionSpan);
            card.appendChild(descriptionWrap);
        }

        const quoteText = row.quote?.trim();
        if (quoteText) {
            const quote = document.createElement("div");
            quote.textContent = quoteText;
            quote.style.marginTop = "5px";
            quote.style.paddingLeft = "8px";
            quote.style.paddingRight = "4px";
            quote.style.borderLeft = `2px solid ${row.quoteTone === "danger" ? "rgba(248, 113, 113, 0.58)" : "rgba(56, 189, 248, 0.34)"}`;
            quote.style.fontSize = "13px";
            quote.style.fontStyle = "italic";
            quote.style.lineHeight = "18px";
            quote.style.color = row.quoteTone === "danger" ? "#f87171" : "#b8c4d4";
            quote.style.display = "-webkit-box";
            quote.style.webkitLineClamp = "4";
            quote.style.webkitBoxOrient = "vertical";
            quote.style.overflow = "hidden";
            quote.style.whiteSpace = "normal";
            card.appendChild(quote);
        }

        grid.appendChild(card);
    });

    updatePopupNodeRowSelection(root, selectedRowIndex, selectionVisible, null);

    return root;
}

function buildContentKey(featureId: string, content: MapHoverPopupContent): string {
    if (content.key) return `${featureId}:${content.key}`;
    return `${featureId}:${content.rows
        .map((row) => [
            row.separatorBefore ? "sep" : "",
            row.isGroupHeader ? "group" : "",
            row.title,
            row.titleTone || "",
            row.description || "",
            row.titleTimeRange || "",
            row.titleTimeRangeTone || "",
            row.quote || "",
        ].join(":"))
        .join("|")}`;
}

function ensureHoverPopupScrollbarStyle() {
    const styleId = "uhm-map-hover-popup-scrollbar-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
        .uhm-map-hover-popup-body {
            scrollbar-width: thin;
            scrollbar-color: rgba(56, 189, 248, 0.58) rgba(15, 23, 42, 0.72);
        }

        .uhm-map-hover-popup-body::-webkit-scrollbar {
            width: 10px;
        }

        .uhm-map-hover-popup-body::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.72);
            border-left: 1px solid rgba(255, 255, 255, 0.08);
        }

        .uhm-map-hover-popup-body::-webkit-scrollbar-thumb {
            min-height: 36px;
            border: 2px solid rgba(2, 6, 23, 0.95);
            border-radius: 999px;
            background: linear-gradient(180deg, rgba(56, 189, 248, 0.86), rgba(14, 165, 233, 0.58));
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
        }

        .uhm-map-hover-popup-body::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, rgba(125, 211, 252, 0.96), rgba(56, 189, 248, 0.72));
        }

        .uhm-map-hover-popup-body button,
        .uhm-map-hover-popup-body button:focus,
        .uhm-map-hover-popup-body button:focus-visible {
            outline: none !important;
            box-shadow: none;
        }

        .uhm-map-hover-popup-description-marquee {
            display: block;
            width: 100%;
            margin-top: 2px;
            overflow: hidden;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 500;
            line-height: 16px;
            white-space: nowrap;
        }

        .uhm-map-hover-popup-description-marquee > span {
            display: inline-block;
            min-width: 100%;
            transform: translateX(0);
        }

        .uhm-map-hover-popup-description-marquee:hover > span {
            animation: uhm-hover-popup-marquee 8s linear infinite alternate;
        }

        @keyframes uhm-hover-popup-marquee {
            from { transform: translateX(0); }
            to { transform: translateX(calc(-100% + 100px)); }
        }
    `;
    document.head.appendChild(style);
}

function isEditableEventTarget(target: EventTarget | null): boolean {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

function normalizeRows(content: MapHoverPopupContent | null): MapHoverPopupContent["rows"] {
    return (content?.rows || []).filter((row) => row.title.trim());
}

function getSelectableRows(content: MapHoverPopupContent | null): MapHoverPopupContent["rows"] {
    return normalizeRows(content).filter((row) => !row.isGroupHeader);
}

function wrapIndex(index: number, length: number): number {
    if (length <= 0) return 0;
    return ((index % length) + length) % length;
}

function updatePopupRowSelection(
    popup: maplibregl.Popup,
    selectedRowIndex: number,
    selectionVisible: boolean,
    selectionDirection: "next" | "prev" | null
) {
    updatePopupNodeRowSelection(popup.getElement() || null, selectedRowIndex, selectionVisible, selectionDirection);
}

function updatePopupNodeRowSelection(
    root: HTMLElement | null,
    selectedRowIndex: number,
    selectionVisible: boolean,
    selectionDirection: "next" | "prev" | null
) {
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-hover-popup-row-index]"));
    let selectedCard: HTMLElement | null = null;
    for (const card of cards) {
        const rowIndex = Number(card.dataset.hoverPopupRowIndex);
        const selected = selectionVisible && rowIndex === selectedRowIndex;
        card.dataset.hoverPopupSelected = selected ? "true" : "false";
        applyPopupRowStyle(card, selected);
        if (selected) {
            selectedCard = card;
        }
    }
    if (selectedCard) {
        ensurePopupRowVisible(selectedCard, selectionDirection);
        window.requestAnimationFrame(() => ensurePopupRowVisible(selectedCard, selectionDirection));
    }
}

function applyPopupRowStyle(card: HTMLElement, selected: boolean) {
    card.style.borderColor = "transparent";
    card.style.background = selected ? "rgba(14, 165, 233, 0.11)" : "transparent";
    card.style.boxShadow = selected ? "inset 2px 0 0 rgba(56, 189, 248, 0.95)" : "none";
}

function ensurePopupRowVisible(card: HTMLElement, direction: "next" | "prev" | null) {
    const scrollRoot = card.closest<HTMLElement>("[data-hover-popup-scroll-root='true']");
    if (!scrollRoot) return;

    const padding = 8;
    const groupHeader = direction === "prev" ? findPreviousGroupHeader(card) : null;
    const cardTop = card.offsetTop;
    const cardBottom = cardTop + card.offsetHeight;
    const targetTop = groupHeader?.offsetTop ?? cardTop;
    const visibleTop = scrollRoot.scrollTop + padding;
    const visibleBottom = scrollRoot.scrollTop + scrollRoot.clientHeight - padding;

    if (targetTop < visibleTop) {
        scrollRoot.scrollTop = Math.max(0, targetTop - padding);
        return;
    }

    if (cardBottom > visibleBottom) {
        scrollRoot.scrollTop = cardBottom - scrollRoot.clientHeight + padding;
    }
}

function findPreviousGroupHeader(card: HTMLElement): HTMLElement | null {
    let current = card.previousElementSibling;
    while (current) {
        if (current instanceof HTMLElement && current.dataset.hoverPopupGroupHeader === "true") {
            return current;
        }
        current = current.previousElementSibling;
    }
    return null;
}

function stylePopupChrome(popup: maplibregl.Popup) {
    const element = popup.getElement();
    const content = element.querySelector(".maplibregl-popup-content") as HTMLElement | null;
    if (content) {
        content.style.padding = "0";
        content.style.borderRadius = "0px";
        content.style.background = "transparent";
        content.style.boxShadow = "none";
    }

    for (const tip of Array.from(element.querySelectorAll(".maplibregl-popup-tip")) as HTMLElement[]) {
        tip.style.display = "none";
    }
}
