"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map from "@/uhm/components/Map";
import BackgroundLayersPanel from "@/uhm/components/BackgroundLayersPanel";
import TimelineBar from "@/uhm/components/TimelineBar";
import { fetchGeometriesByBBox } from "@/uhm/api/geometries";
import { ApiError } from "@/uhm/api/http";
import { API_BASE_URL } from "@/uhm/api/config";
import {
  BackgroundLayerId,
  BackgroundLayerVisibility,
  DEFAULT_BACKGROUND_LAYER_VISIBILITY,
  HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/backgroundLayers";
import {
  loadBackgroundLayerVisibilityFromStorage,
  persistBackgroundLayerVisibility,
} from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { EMPTY_FEATURE_COLLECTION, WORLD_BBOX } from "@/uhm/lib/geo/constants";
import { clampYearToFixedRange, TIMELINE_DEBOUNCE_MS } from "@/uhm/lib/timeline";
import { GEO_TYPE_KEYS } from "@/uhm/lib/geoTypeMap";
import type { Feature, FeatureCollection } from "@/uhm/types/geo";

const CURRENT_YEAR = new Date().getUTCFullYear();

export default function Page() {
  const [data, setData] = useState<FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | number | null>(null);
  const [timelineYear, setTimelineYear] = useState<number>(() => clampYearToFixedRange(CURRENT_YEAR));
  const [timelineDraftYear, setTimelineDraftYear] = useState<number>(() => clampYearToFixedRange(CURRENT_YEAR));
  const [timeRange, setTimeRange] = useState<number>(0);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [backgroundVisibility, setBackgroundVisibility] = useState<BackgroundLayerVisibility>(
    () => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY })
  );
  const [isBackgroundVisibilityReady, setIsBackgroundVisibilityReady] = useState(false);
  const timelineFetchRequestRef = useRef(0);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [geometryVisibility, setGeometryVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const key of GEO_TYPE_KEYS) init[key] = true;
    return init;
  });

  const selectedFeature: Feature | null = useMemo(() => {
    if (selectedFeatureId === null) return null;
    return (
      data.features.find((feature) => String(feature.properties.id) === String(selectedFeatureId)) || null
    );
  }, [data.features, selectedFeatureId]);

  useEffect(() => {
    if (selectedFeatureId === null) return;
    const stillExists = data.features.some((feature) => String(feature.properties.id) === String(selectedFeatureId));
    if (!stillExists) setSelectedFeatureId(null);
  }, [data.features, selectedFeatureId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (timelineDraftYear !== timelineYear) setTimelineYear(timelineDraftYear);
    }, TIMELINE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineDraftYear, timelineYear]);

  useEffect(() => {
    setBackgroundVisibility(loadBackgroundLayerVisibilityFromStorage());
    setIsBackgroundVisibilityReady(true);
  }, []);

  useEffect(() => {
    let disposed = false;
    const requestId = ++timelineFetchRequestRef.current;

    async function loadByTimeline() {
      setIsTimelineLoading(true);
      setTimelineStatus(null);
      try {
        const next = await fetchGeometriesByBBox({ ...WORLD_BBOX, time: timelineYear, timeRange });
        if (disposed || requestId !== timelineFetchRequestRef.current) return;
        setData(next);
        setLastLoadedAt(new Date().toISOString());
      } catch (err) {
        if (err instanceof ApiError) {
          console.error("Load timeline data failed", err.body);
        } else {
          console.error("Load timeline data failed", err);
        }
        if (!disposed && requestId === timelineFetchRequestRef.current) {
          setTimelineStatus("Không tải được geometry tại mốc thời gian đã chọn.");
        }
      } finally {
        if (!disposed && requestId === timelineFetchRequestRef.current) {
          setIsTimelineLoading(false);
        }
      }
    }

    loadByTimeline();
    return () => {
      disposed = true;
    };
  }, [timelineYear, timeRange]);

  const updateBackgroundVisibility = (updater: (prev: BackgroundLayerVisibility) => BackgroundLayerVisibility) => {
    setBackgroundVisibility((prev) => {
      const next = updater(prev);
      persistBackgroundLayerVisibility(next);
      return next;
    });
  };

  const handleToggleBackgroundLayer = (id: BackgroundLayerId) => {
    updateBackgroundVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleShowAllBackgroundLayers = () => {
    updateBackgroundVisibility(() => ({ ...DEFAULT_BACKGROUND_LAYER_VISIBILITY }));
  };

  const handleHideAllBackgroundLayers = () => {
    updateBackgroundVisibility(() => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY }));
  };

  const handleTimelineYearChange = (nextYear: number) => {
    setTimelineDraftYear(clampYearToFixedRange(Math.trunc(nextYear)));
  };

  const handleTimeRangeChange = (nextRange: number) => {
    const safe = Number.isFinite(nextRange) ? Math.trunc(nextRange) : 0;
    setTimeRange(Math.max(0, Math.min(30, safe)));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ flex: 1, position: "relative", minHeight: "100vh" }}>
        {isBackgroundVisibilityReady ? (
          <Map
            mode="select"
            draft={data}
            selectedFeatureId={selectedFeatureId}
            onSelectFeatureId={setSelectedFeatureId}
            backgroundVisibility={backgroundVisibility}
            geometryVisibility={geometryVisibility}
            allowGeometryEditing={false}
            respectBindingFilter={false}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#0b1220" }} />
        )}

        <TimelineBar
          year={timelineDraftYear}
          onYearChange={handleTimelineYearChange}
          timeRange={timeRange}
          onTimeRangeChange={handleTimeRangeChange}
          isLoading={isTimelineLoading}
          disabled={false}
          statusText={timelineStatus}
        />
      </div>

      <BackgroundLayersPanel
        visibility={backgroundVisibility}
        onToggleLayer={handleToggleBackgroundLayer}
        onShowAll={handleShowAllBackgroundLayers}
        onHideAll={handleHideAllBackgroundLayers}
        geometryVisibility={geometryVisibility}
        onToggleGeometryType={(typeKey) => {
          setGeometryVisibility((prev) => ({ ...prev, [typeKey]: prev[typeKey] === false }));
        }}
        topContent={
          <div
            style={{
              padding: "10px",
              background: "#0b1220",
              borderRadius: "8px",
              border: "1px solid #1f2937",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#f8fafc" }}>Viewer</div>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
              API: {API_BASE_URL}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
              Year: {timelineYear} | Features: {data.features.length}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
              {isTimelineLoading ? "Loading geometries..." : lastLoadedAt ? `Loaded: ${lastLoadedAt}` : "Not loaded yet"}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "13px", overflowWrap: "anywhere" }}>
              {selectedFeature ? `ID: ${String(selectedFeature.properties.id)}` : "Chưa chọn geometry"}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
              {selectedFeature?.properties?.type ? `Type: ${String(selectedFeature.properties.type)}` : "Type: -"}
            </div>
          </div>
        }
      />
    </div>
  );
}
