"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import NewBadge from "@/uhm/components/editor/NewBadge";
import { normalizeTimelineYearValue } from "@/uhm/lib/utils/timeline";
import { useEditorStore } from "@/uhm/store/editorStore";

type GeometryChoice = {
  id: string;
  label?: string;
  time_start?: unknown;
  time_end?: unknown;
  isTimelineVisible?: boolean;
  isOrphan?: boolean;
  timeStatus?: GeometryTimeStatus;
  timelineStatus?: GeometryTimelineStatus;
  isNew?: boolean;
};

type GeometryTimeStatus = "missing" | "partial" | "complete";
type GeometryTimelineStatus = "off" | "visible" | "filteredOut";
type GeometryRow = Required<Pick<GeometryChoice, "id" | "label" | "isOrphan" | "timeStatus" | "timelineStatus" | "isNew">> & {
  time_start: number | null;
  time_end: number | null;
  isTimelineVisible: boolean;
};

type Props = {
  geometries: GeometryChoice[];
  selectedGeometryId?: string | null;
  selectedGeometryChildIds: string[];
  onToggleBindGeometryForSelectedGeometry?: (geometryId: string, nextChecked: boolean) => void;
  onFocusGeometry?: (geometryId: string) => void;
};

export default function GeometryBindingPanel({
  geometries,
  selectedGeometryId,
  selectedGeometryChildIds,
  onToggleBindGeometryForSelectedGeometry,
  onFocusGeometry,
}: Props) {
  const {
    selectedFeatureIds,
    statusText,
    bindingFilterEnabled,
    setGeometryBindingFilterEnabled,
    geometryVisibility,
    setGeometryVisibility,
  } = useEditorStore(
    useShallow((state) => ({
      selectedFeatureIds: state.selectedFeatureIds,
      statusText: state.geoBindingStatus,
      bindingFilterEnabled: state.geometryBindingFilterEnabled,
      setGeometryBindingFilterEnabled: state.setGeometryBindingFilterEnabled,
      geometryVisibility: state.geometryVisibility,
      setGeometryVisibility: state.setGeometryVisibility,
    }))
  );
  const effectiveSelectedGeometryId =
    selectedGeometryId ??
    (selectedFeatureIds.length > 0 ? String(selectedFeatureIds[0]) : null);
  const canBindToggle =
    Boolean(effectiveSelectedGeometryId) && typeof onToggleBindGeometryForSelectedGeometry === "function";
  const canFocusGeometry = typeof onFocusGeometry === "function";

  const [collapsed, setCollapsed] = useState(false);

  const rows = useMemo(() => {
    const cleaned = (geometries || [])
      .filter((g) => g && typeof g.id === "string" && g.id.trim().length > 0)
      .map((g) => ({
        id: g.id.trim(),
        label: (g.label || "").trim(),
        time_start: normalizeTimelineYearValue(g.time_start),
        time_end: normalizeTimelineYearValue(g.time_end),
        isTimelineVisible: Boolean(g.isTimelineVisible),
        isOrphan: Boolean(g.isOrphan),
        timeStatus: resolveTimeStatus(g),
        timelineStatus: resolveTimelineStatus(g),
        isNew: Boolean(g.isNew),
      }));
    cleaned.sort((a, b) => a.id.localeCompare(b.id));
    return cleaned;
  }, [geometries]);

  const childSet = useMemo(() => new Set(selectedGeometryChildIds || []), [selectedGeometryChildIds]);
  const selectedGeometry = useMemo(() => {
    if (!effectiveSelectedGeometryId) return null;
    return rows.find((g) => g.id === effectiveSelectedGeometryId) || null;
  }, [effectiveSelectedGeometryId, rows]);
  const visibleRows = useMemo(() => {
    return rows
      .filter((g) => g.id !== effectiveSelectedGeometryId)
      .sort((a, b) => {
        const aBound = childSet.has(a.id);
        const bBound = childSet.has(b.id);
        if (aBound !== bBound) return aBound ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
  }, [childSet, effectiveSelectedGeometryId, rows]);
  const summary = useMemo(() => {
    let orphan = 0;
    let missingTime = 0;
    let partialTime = 0;
    let filteredOut = 0;
    let hidden = 0;

    for (const row of rows) {
      if (row.isOrphan) orphan += 1;
      if (row.timeStatus === "missing") missingTime += 1;
      if (row.timeStatus === "partial") partialTime += 1;
      if (row.timelineStatus === "filteredOut") filteredOut += 1;
      if (geometryVisibility[row.id] === false) hidden += 1;
    }

    return {
      total: rows.length,
      orphan,
      missingTime,
      partialTime,
      timeIssues: missingTime + partialTime,
      filteredOut,
      hidden,
    };
  }, [geometryVisibility, rows]);

  const handleFocusKeyDown = (event: KeyboardEvent<HTMLDivElement>, geometryId: string) => {
    if (!canFocusGeometry) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onFocusGeometry?.(geometryId);
  };

  const handleFocusGeometry = (geometryId: string) => {
    onFocusGeometry?.(geometryId);
  };

  const toggleGeometryVisibility = (geometryId: string) => {
    setGeometryVisibility((prev) => ({
      ...prev,
      [geometryId]: prev[geometryId] === false,
    }));
  };

  return (
    <div
      style={{
        padding: "10px",
        background: "#0b1220",
        borderRadius: "8px",
        border: "1px solid #1f2937",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex",flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>Geometry Binding</div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              userSelect: "none",
            }}
            title={bindingFilterEnabled ? "Đang ẩn geo theo binding" : "Đang hiển thị tất cả geo"}
          >
            <button
              type="button"
              role="switch"
              aria-checked={bindingFilterEnabled}
              aria-label="Toggle geometry binding filter"
              onClick={() => setGeometryBindingFilterEnabled(!bindingFilterEnabled)}
              style={{
                width: 32,
                height: 18,
                padding: 2,
                borderRadius: 999,
                border: bindingFilterEnabled ? "1px solid #38bdf8" : "1px solid #334155",
                background: bindingFilterEnabled ? "rgba(14, 165, 233, 0.32)" : "#111827",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: bindingFilterEnabled ? "flex-end" : "flex-start",
                transition: "background 140ms ease, border-color 140ms ease",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: bindingFilterEnabled ? "#67e8f9" : "#94a3b8",
                  boxShadow: bindingFilterEnabled ? "0 0 8px rgba(103, 232, 249, 0.45)" : "none",
                  transition: "background 140ms ease, box-shadow 140ms ease",
                }}
              />
            </button>
            <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>Filter binding</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={summaryWrapStyle}>
            <span style={summaryBadgeStyle} title="Total geometry count">all {summary.total}</span>
            {summary.orphan > 0 ? (
              <span style={summaryDangerBadgeStyle} title="Geometry without any bound entity">entity {summary.orphan}</span>
            ) : null}
            {summary.timeIssues > 0 ? (
              <span
                style={summaryWarningBadgeStyle}
                title={`Missing time: ${summary.missingTime}; partial time: ${summary.partialTime}`}
              >
                time {summary.timeIssues}
              </span>
            ) : null}
            {summary.filteredOut > 0 ? (
              <span style={summaryMutedBadgeStyle} title="Geometry filtered out by timeline">out {summary.filteredOut}</span>
            ) : null}
            {summary.hidden > 0 ? (
              <span style={summaryMutedBadgeStyle} title="Geometry hidden manually">hidden {summary.hidden}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
            title={collapsed ? "Mở panel" : "Thu gọn panel"}
            aria-label={collapsed ? "Mở panel Geometry Binding" : "Thu gọn panel Geometry Binding"}
          >
            {collapsed ? <PlusIcon /> : <MinusIcon />}
          </button>
        </div>
      </div>

      {collapsed ? null : selectedGeometry ? (
        (() => {
          const isHidden = geometryVisibility[selectedGeometry.id] === false;
          const isBound = childSet.has(selectedGeometry.id);
          const title = buildGeometryTitle(selectedGeometry, isHidden, isBound);
          return (
        <div
          style={{
            marginTop: 10,
            padding: "8px",
            borderRadius: "6px",
            border:
              "1px solid rgba(59, 130, 246, 0.45)",
            background: "rgba(37, 99, 235, 0.12)",
            cursor: canFocusGeometry ? "pointer" : "default",
            opacity: isHidden ? 0.58 : 1,
            boxShadow: "none",
          }}
          title={title}
          role={canFocusGeometry ? "button" : undefined}
          tabIndex={canFocusGeometry ? 0 : undefined}
          onClick={() => handleFocusGeometry(selectedGeometry.id)}
          onKeyDown={(event) => handleFocusKeyDown(event, selectedGeometry.id)}
        >
          <div
            style={{
              fontSize: 10,
              color: "#93c5fd",
              fontWeight: 900,
              textTransform: "uppercase",
              lineHeight: 1,
              marginBottom: 5,
            }}
          >
            Selected
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <GeometryLabel row={selectedGeometry} color="#dbeafe" />
            {selectedGeometry.isNew ? <NewBadge /> : null}
            <button
              type="button"
              title={isHidden ? "Show geometry on map" : "Hide geometry on map"}
              onClick={(event) => {
                event.stopPropagation();
                toggleGeometryVisibility(selectedGeometry.id);
              }}
              style={iconButtonStyle}
              aria-label={isHidden ? `Show geometry ${selectedGeometry.id}` : `Hide geometry ${selectedGeometry.id}`}
            >
              {isHidden ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <StatusChips row={selectedGeometry} isHidden={isHidden} isBound={isBound} />
        </div>
          );
        })()
      ) : null}

      {collapsed ? null : rows.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
          {visibleRows
            .map((g) => {
              const isBound = childSet.has(g.id);
              const isHidden = geometryVisibility[g.id] === false;
              const title = buildGeometryTitle(g, isHidden, isBound);
              return (
                <div
                  key={g.id}
                  style={{
                    padding: "8px",
                    borderRadius: "6px",
                    border: isBound
                        ? "1px solid rgba(20, 184, 166, 0.65)"
                        : "1px solid #1f2937",
                    background: isBound
                        ? "rgba(20, 184, 166, 0.12)"
                        : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: canFocusGeometry ? "pointer" : "default",
                    opacity: isHidden ? 0.55 : canBindToggle ? 1 : 0.75,
                    boxShadow: "none",
                  }}
                  title={title}
                  role={canFocusGeometry ? "button" : undefined}
                  tabIndex={canFocusGeometry ? 0 : undefined}
                  onClick={() => handleFocusGeometry(g.id)}
                  onKeyDown={(event) => handleFocusKeyDown(event, g.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                      }}
                    >
                      <GeometryLabel row={g} />
                      {g.isNew ? <NewBadge /> : null}
                    </div>
                    <StatusChips row={g} isHidden={isHidden} isBound={isBound} />
                  </div>

                  <button
                    type="button"
                    title={isHidden ? "Show geometry on map" : "Hide geometry on map"}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleGeometryVisibility(g.id);
                    }}
                    style={iconButtonStyle}
                    aria-label={isHidden ? `Show geometry ${g.id}` : `Hide geometry ${g.id}`}
                  >
                    {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>

                  {canBindToggle ? (
                    <button
                      type="button"
                      title={isBound ? "Unbind from selected geometry" : "Bind to selected geometry"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleBindGeometryForSelectedGeometry!(g.id, !isBound);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: "1px solid #334155",
                        background: "#0b1220",
                        cursor: "pointer",
                        flex: "0 0 auto",
                      }}
                      aria-label={
                        isBound
                          ? `Unbind geometry ${g.id} from selected geometry`
                          : `Bind geometry ${g.id} to selected geometry`
                      }
                    >
                      {isBound ? <UnlockIcon /> : <LockIcon />}
                    </button>
                  ) : null}
                </div>
              );
            })}

        </div>
      ) : (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>
          No geometry yet for this project.
        </div>
      )}

      {collapsed ? null : statusText ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#93c5fd" }}>
          {statusText}
        </div>
      ) : null}
    </div>
  );
}

function GeometryLabel({ row, color = "#e5e7eb" }: { row: GeometryRow; color?: string }) {
  return (
    <span
      style={{
        fontSize: "12px",
        color,
        fontWeight: 700,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {row.label || "Geometry"}
    </span>
  );
}

function StatusChips({ row, isHidden, isBound }: { row: GeometryRow; isHidden: boolean; isBound: boolean }) {
  return (
    <div style={statusChipRowStyle}>
      {row.isOrphan ? <span style={dangerBadgeStyle}>no entity</span> : null}
      {row.timeStatus === "missing" ? <span style={dangerBadgeStyle}>no time</span> : null}
      {row.timeStatus === "partial" ? <span style={warningBadgeStyle}>partial time</span> : null}
      {row.timelineStatus === "visible" ? <span style={timelineBadgeStyle}>timeline</span> : null}
      {row.timelineStatus === "filteredOut" ? <span style={mutedBadgeStyle}>out timeline</span> : null}
      {isHidden ? <span style={hiddenBadgeStyle}>hidden</span> : null}
      {isBound ? <span style={boundBadgeStyle}>bound</span> : null}
    </div>
  );
}

function resolveTimeStatus(geometry: GeometryChoice): GeometryTimeStatus {
  if (geometry.timeStatus === "missing" || geometry.timeStatus === "partial" || geometry.timeStatus === "complete") {
    return geometry.timeStatus;
  }

  const hasStart = normalizeTimelineYearValue(geometry.time_start) !== null;
  const hasEnd = normalizeTimelineYearValue(geometry.time_end) !== null;
  if (!hasStart && !hasEnd) return "missing";
  if (!hasStart || !hasEnd) return "partial";
  return "complete";
}

function resolveTimelineStatus(geometry: GeometryChoice): GeometryTimelineStatus {
  if (
    geometry.timelineStatus === "off" ||
    geometry.timelineStatus === "visible" ||
    geometry.timelineStatus === "filteredOut"
  ) {
    return geometry.timelineStatus;
  }

  return geometry.isTimelineVisible ? "visible" : "off";
}

function buildGeometryTitle(row: GeometryRow, isHidden: boolean, isBound: boolean): string {
  const parts = [`ID: ${row.id}`];

  if (row.isOrphan) parts.push("Orphan");
  if (row.timeStatus === "missing") parts.push("Missing time");
  if (row.timeStatus === "partial") parts.push("Partial time");
  if (row.timelineStatus === "visible") parts.push("Timeline visible");
  if (row.timelineStatus === "filteredOut") parts.push("Filtered out by timeline");
  if (isHidden) parts.push("Hidden");
  if (isBound) parts.push("Bound");
  if (row.isNew) parts.push("New");

  return parts.join(" | ");
}

const summaryWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
  minWidth: 0,
  flexWrap: "wrap",
};

const baseBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  height: 17,
  padding: "0 6px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
  textTransform: "uppercase",
  letterSpacing: 0,
  whiteSpace: "nowrap",
};

const summaryBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "rgba(15, 23, 42, 0.9)",
  color: "#cbd5e1",
};

const summaryDangerBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(248, 113, 113, 0.5)",
  background: "rgba(127, 29, 29, 0.32)",
  color: "#fecaca",
};

const summaryWarningBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(250, 204, 21, 0.48)",
  background: "rgba(113, 63, 18, 0.3)",
  color: "#fde68a",
};

const summaryMutedBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(148, 163, 184, 0.4)",
  background: "rgba(51, 65, 85, 0.32)",
  color: "#cbd5e1",
};

const statusChipRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 4,
  marginTop: 5,
  minHeight: 17,
};

const dangerBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(248, 113, 113, 0.5)",
  background: "rgba(127, 29, 29, 0.28)",
  color: "#fecaca",
};

const warningBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(250, 204, 21, 0.5)",
  background: "rgba(113, 63, 18, 0.28)",
  color: "#fde68a",
};

const timelineBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(34, 197, 94, 0.5)",
  background: "rgba(20, 83, 45, 0.3)",
  color: "#bbf7d0",
};

const mutedBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(148, 163, 184, 0.45)",
  background: "rgba(71, 85, 105, 0.28)",
  color: "#cbd5e1",
};

const boundBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(45, 212, 191, 0.5)",
  background: "rgba(20, 184, 166, 0.18)",
  color: "#99f6e4",
};

const hiddenBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  border: "1px solid rgba(148, 163, 184, 0.45)",
  background: "rgba(71, 85, 105, 0.32)",
  color: "#cbd5e1",
};

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 6,
  border: "1px solid #334155",
  background: "#0b1220",
  cursor: "pointer",
  flex: "0 0 auto",
};

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="#cbd5e1"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="#cbd5e1" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8M6.2 8.1A17 17 0 0 0 2.5 12s3.5 6 9.5 6c1.3 0 2.5-.3 3.5-.7"
        stroke="#fca5a5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2"
        stroke="#cbd5e1"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="10"
        width="12"
        height="10"
        rx="2"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 10V8a5 5 0 0 0-9.5-2"
        stroke="#a7f3d0"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="10"
        width="12"
        height="10"
        rx="2"
        stroke="#a7f3d0"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
