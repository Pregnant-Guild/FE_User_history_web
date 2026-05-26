import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection } from "@/uhm/lib/editor/state/useEditorState";
import { FEATURE_STATE_SOURCE_IDS } from "@/uhm/lib/map/constants";

export type MapHoverPopupContent = {
    rows: Array<{
        title: string;
        quote?: string | null;
    }>;
};

type UseMapHoverPopupProps = {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    enabled: boolean;
    renderDraftRef: React.MutableRefObject<FeatureCollection>;
    getContentRef: React.MutableRefObject<((feature: Feature) => MapHoverPopupContent | null) | undefined>;
};

export function useMapHoverPopup({
    mapRef,
    enabled,
    renderDraftRef,
    getContentRef,
}: UseMapHoverPopupProps) {
    const enabledRef = useRef(enabled);

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: "uhm-map-hover-popup",
        });

        let hoveredId: string | null = null;
        let frameId: number | null = null;
        let pendingEvent: maplibregl.MapMouseEvent | null = null;

        const removePopup = () => {
            hoveredId = null;
            popup.remove();
        };

        const updatePopup = () => {
            frameId = null;
            const event = pendingEvent;
            pendingEvent = null;

            if (!event || !enabledRef.current) {
                removePopup();
                return;
            }

            const layerIds = getHoverLayerIds(map);
            if (!layerIds.length) {
                removePopup();
                return;
            }

            const features = map.queryRenderedFeatures(event.point, { layers: layerIds }) as maplibregl.MapGeoJSONFeature[];
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
            const sourceFeature = renderDraftRef.current.features.find((item) => String(item.properties.id) === id);
            if (!sourceFeature) {
                removePopup();
                return;
            }

            const content = getContentRef.current?.(sourceFeature) || null;
            if (!content?.rows?.some((row) => row.title.trim())) {
                removePopup();
                return;
            }

            if (id !== hoveredId) {
                hoveredId = id;
                popup.setDOMContent(buildPopupNode(content));
            }

            popup.setLngLat(event.lngLat).addTo(map);
            stylePopupChrome(popup);
        };

        const onMouseMove = (event: maplibregl.MapMouseEvent) => {
            pendingEvent = event;
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(updatePopup);
        };

        const onMouseOut = () => {
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

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            map.off("mousemove", onMouseMove);
            map.off("mouseout", onMouseOut);
            map.off("dragstart", removePopup);
            map.off("zoomstart", removePopup);
            popup.remove();
        };
    }, [getContentRef, mapRef, renderDraftRef]);
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
    return [...features].sort((a, b) => featureSelectPriority(b) - featureSelectPriority(a))[0];
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

function buildPopupNode(content: MapHoverPopupContent): HTMLElement {
    const root = document.createElement("div");
    root.style.width = "320px";
    root.style.maxWidth = "calc(100vw - 2rem)";
    root.style.maxHeight = "300px";
    root.style.overflowY = "auto";
    root.style.padding = "12px";
    root.style.border = "1px solid rgba(255, 255, 255, 0.10)";
    root.style.borderRadius = "12px";
    root.style.background = "rgba(2, 6, 23, 0.95)";
    root.style.boxShadow = "0 18px 36px rgba(0, 0, 0, 0.35)";
    root.style.backdropFilter = "blur(8px)";
    root.style.color = "#e2e8f0";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gap = "8px";
    root.appendChild(grid);

    for (const row of content.rows) {
        const titleText = row.title.trim();
        if (!titleText) continue;

        const card = document.createElement("div");
        card.style.width = "100%";
        card.style.border = "1px solid rgba(255, 255, 255, 0.10)";
        card.style.borderRadius = "8px";
        card.style.background = "rgba(255, 255, 255, 0.03)";
        card.style.padding = "12px";
        card.style.textAlign = "left";

        const title = document.createElement("div");
        title.textContent = titleText;
        title.style.fontSize = "14px";
        title.style.fontWeight = "700";
        title.style.lineHeight = "20px";
        title.style.color = "#ffffff";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        title.style.whiteSpace = "nowrap";
        card.appendChild(title);

        const quoteText = row.quote?.trim();
        if (quoteText) {
            const quote = document.createElement("div");
            quote.textContent = quoteText;
            quote.style.marginTop = "8px";
            quote.style.paddingLeft = "10px";
            quote.style.paddingRight = "4px";
            quote.style.borderLeft = "3px solid rgba(56, 189, 248, 0.40)";
            quote.style.fontSize = "14px";
            quote.style.fontStyle = "italic";
            quote.style.lineHeight = "20px";
            quote.style.color = "#cbd5e1";
            quote.style.display = "-webkit-box";
            quote.style.webkitLineClamp = "4";
            quote.style.webkitBoxOrient = "vertical";
            quote.style.overflow = "hidden";
            quote.style.whiteSpace = "normal";
            card.appendChild(quote);
        }

        grid.appendChild(card);
    }

    return root;
}

function stylePopupChrome(popup: maplibregl.Popup) {
    const element = popup.getElement();
    const content = element.querySelector(".maplibregl-popup-content") as HTMLElement | null;
    if (content) {
        content.style.padding = "0";
        content.style.borderRadius = "12px";
        content.style.background = "transparent";
        content.style.boxShadow = "none";
    }

    for (const tip of Array.from(element.querySelectorAll(".maplibregl-popup-tip")) as HTMLElement[]) {
        tip.style.display = "none";
    }
}
