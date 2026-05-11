import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from "@/uhm/lib/map/constants";
import { clampNumber, roundZoom } from "./mapUtils";
import { getBaseMapStyle } from "./useMapLayers";

const MAP_PROJECTION_STORAGE_KEY = "uhm:mapProjection";

export function applyMapProjection(map: maplibregl.Map, isGlobe: boolean) {
    map.setProjection({ type: isGlobe ? "globe" : "mercator" });
}

export function useMapInstance() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [fatalInitError, setFatalInitError] = useState<string | null>(null);

    const [zoomLevel, setZoomLevel] = useState(2);
    const [zoomBounds, setZoomBounds] = useState({ min: MAP_MIN_ZOOM, max: MAP_MAX_ZOOM });

    const [isGlobeProjection, setIsGlobeProjection] = useState(() => {
        if (typeof window === "undefined") return false;
        try {
            return window.localStorage.getItem(MAP_PROJECTION_STORAGE_KEY) === "globe";
        } catch {
            return false;
        }
    });

    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const geolocationCenteredRef = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(
                MAP_PROJECTION_STORAGE_KEY,
                isGlobeProjection ? "globe" : "mercator"
            );
        } catch {
            // ignore
        }
    }, [isGlobeProjection]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        try {
            const map = new maplibregl.Map({
                container,
                attributionControl: false,
                minZoom: MAP_MIN_ZOOM,
                maxZoom: MAP_MAX_ZOOM,
                style: getBaseMapStyle(),
                center: [0, 20],
                zoom: 2,
            });

            mapRef.current = map;

            const syncZoomLevel = () => {
                setZoomLevel(roundZoom(map.getZoom()));
            };

            map.on("load", () => {
                setZoomBounds({ min: MAP_MIN_ZOOM, max: MAP_MAX_ZOOM });
                syncZoomLevel();
                map.on("zoom", syncZoomLevel);
                setIsMapLoaded(true);
            });

            return () => {
                map.off("zoom", syncZoomLevel);
                setIsMapLoaded(false);
                if (mapRef.current === map) {
                    mapRef.current = null;
                }
                map.remove();
            };
        } catch (err) {
            console.error("Map initialization failed", err);
            setFatalInitError(err instanceof Error ? err.message : "Map initialization failed.");
        }
    }, []);

    // Sync Map Projection
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const apply = () => {
            if (mapRef.current !== map) return;
            if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
            applyMapProjection(map, isGlobeProjection);
        };

        if (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) {
            apply();
            return;
        }

        map.once("load", apply);
        map.once("style.load", apply);
        return () => {
            map.off("load", apply);
            map.off("style.load", apply);
        };
    }, [isGlobeProjection]);

    const handleZoomByStep = useCallback((delta: number) => {
        const map = mapRef.current;
        if (!map) return;
        setZoomLevel((prev) => {
            const next = clampNumber(prev + delta, zoomBounds.min, zoomBounds.max);
            map.easeTo({ zoom: next, duration: 120 });
            return next;
        });
    }, [zoomBounds]);

    const handleZoomSliderChange = useCallback((nextRaw: number) => {
        const map = mapRef.current;
        if (!map || !Number.isFinite(nextRaw)) return;
        const next = clampNumber(nextRaw, zoomBounds.min, zoomBounds.max);
        map.easeTo({ zoom: next, duration: 80 });
        setZoomLevel(next);
    }, [zoomBounds]);

    return {
        mapRef,
        containerRef,
        fatalInitError,
        setFatalInitError,
        zoomLevel,
        zoomBounds,
        isGlobeProjection,
        setIsGlobeProjection,
        isMapLoaded,
        geolocationCenteredRef,
        handleZoomByStep,
        handleZoomSliderChange,
    };
}
