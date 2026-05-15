"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import NewBadge from "@/uhm/components/editor/NewBadge";
import { useEditorStore } from "@/uhm/store/editorStore";

type GeometryChoice = {
  id: string;
  label?: string;
  isNew?: boolean;
};

type Props = {
  geometries: GeometryChoice[];
  selectedGeometryId?: string | null;
  selectedGeometryBindingIds: string[];
  onToggleBindGeometryForSelectedGeometry?: (geometryId: string, nextChecked: boolean) => void;
  onFocusGeometry?: (geometryId: string) => void;
};

export default function GeometryBindingPanel({
  geometries,
  selectedGeometryId,
  selectedGeometryBindingIds,
  onToggleBindGeometryForSelectedGeometry,
  onFocusGeometry,
}: Props) {
  const {
    selectedFeatureIds,
    statusText,
    bindingFilterEnabled,
    setGeometryBindingFilterEnabled,
    hoveredGeometryId,
    setHoveredGeometryId,
  } = useEditorStore(
    useShallow((state) => ({
      selectedFeatureIds: state.selectedFeatureIds,
      statusText: state.geoBindingStatus,
      bindingFilterEnabled: state.geometryBindingFilterEnabled,
      setGeometryBindingFilterEnabled: state.setGeometryBindingFilterEnabled,
      hoveredGeometryId: state.hoveredGeometryId,
      setHoveredGeometryId: state.setHoveredGeometryId,
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
      .map((g) => ({ id: g.id.trim(), label: (g.label || "").trim(), isNew: Boolean(g.isNew) }));
    cleaned.sort((a, b) => a.id.localeCompare(b.id));
    return cleaned;
  }, [geometries]);

  const bindingSet = useMemo(() => new Set(selectedGeometryBindingIds || []), [selectedGeometryBindingIds]);
  const selectedGeometry = useMemo(() => {
    if (!effectiveSelectedGeometryId) return null;
    return rows.find((g) => g.id === effectiveSelectedGeometryId) || null;
  }, [effectiveSelectedGeometryId, rows]);
  const visibleRows = useMemo(() => {
    return rows
      .filter((g) => g.id !== effectiveSelectedGeometryId)
      .sort((a, b) => {
        const aBound = bindingSet.has(a.id);
        const bBound = bindingSet.has(b.id);
        if (aBound !== bBound) return aBound ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
  }, [bindingSet, effectiveSelectedGeometryId, rows]);

  const handleFocusKeyDown = (event: KeyboardEvent<HTMLDivElement>, geometryId: string) => {
    if (!canFocusGeometry) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setHoveredGeometryId((current) => (current === geometryId ? null : current));
    onFocusGeometry?.(geometryId);
  };

  const handleFocusGeometry = (geometryId: string) => {
    setHoveredGeometryId((current) => (current === geometryId ? null : current));
    onFocusGeometry?.(geometryId);
  };

  return (
    <div
      style={{
        padding: "10px",
        background: "#0b1220",
        borderRadius: "8px",
        border: "1px solid #1f2937",
      }}
      onMouseLeave={() => setHoveredGeometryId(null)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>Geometry Binding</div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              userSelect: "none",
            }}
            title={bindingFilterEnabled ? "Đang ẩn geo theo binding" : "Đang hiển thị tất cả geo"}
          >
            <input
              type="checkbox"
              checked={bindingFilterEnabled}
              onChange={(e) => setGeometryBindingFilterEnabled(e.target.checked)}
              style={{ width: 14, height: 14 }}
            />
            <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>Filter</span>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{rows.length}</div>
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
        <div
          style={{
            marginTop: 10,
            padding: "8px",
            borderRadius: "6px",
            border:
              hoveredGeometryId === selectedGeometry.id
                ? "1px solid rgba(245, 158, 11, 0.95)"
                : "1px solid rgba(59, 130, 246, 0.45)",
            background:
              hoveredGeometryId === selectedGeometry.id
                ? "rgba(245, 158, 11, 0.18)"
                : "rgba(37, 99, 235, 0.12)",
            cursor: canFocusGeometry ? "pointer" : "default",
            boxShadow:
              hoveredGeometryId === selectedGeometry.id
                ? "0 0 0 2px rgba(251, 191, 36, 0.18)"
                : "none",
          }}
          title={selectedGeometry.id}
          role={canFocusGeometry ? "button" : undefined}
          tabIndex={canFocusGeometry ? 0 : undefined}
          onClick={() => handleFocusGeometry(selectedGeometry.id)}
          onKeyDown={(event) => handleFocusKeyDown(event, selectedGeometry.id)}
          onMouseEnter={() => setHoveredGeometryId(selectedGeometry.id)}
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
            <span
              style={{
                fontSize: "12px",
                color: "#e5e7eb",
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selectedGeometry.label || selectedGeometry.id}
            </span>
            {selectedGeometry.isNew ? <NewBadge /> : null}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: "11px",
              color: "#94a3b8",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {selectedGeometry.id}
          </div>
        </div>
      ) : null}

      {collapsed ? null : rows.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
          {visibleRows
            .map((g) => {
              const isBound = bindingSet.has(g.id);
              const isHovered = hoveredGeometryId === g.id;
              return (
                <div
                  key={g.id}
                  style={{
                    padding: "8px",
                    borderRadius: "6px",
                    border: isHovered
                      ? "1px solid rgba(245, 158, 11, 0.95)"
                      : isBound
                        ? "1px solid rgba(20, 184, 166, 0.65)"
                        : "1px solid #1f2937",
                    background: isHovered
                      ? "rgba(245, 158, 11, 0.18)"
                      : isBound
                        ? "rgba(20, 184, 166, 0.12)"
                        : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: canFocusGeometry ? "pointer" : "default",
                    opacity: canBindToggle ? 1 : 0.75,
                    boxShadow: isHovered ? "0 0 0 2px rgba(251, 191, 36, 0.18)" : "none",
                  }}
                  title={g.id}
                  role={canFocusGeometry ? "button" : undefined}
                  tabIndex={canFocusGeometry ? 0 : undefined}
                  onClick={() => handleFocusGeometry(g.id)}
                  onKeyDown={(event) => handleFocusKeyDown(event, g.id)}
                  onMouseEnter={() => setHoveredGeometryId(g.id)}
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
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#e5e7eb",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {g.label || g.id}
                      </span>
                      {isBound ? <span style={boundBadgeStyle}>bound</span> : null}
                      {g.isNew ? <NewBadge /> : null}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {g.id}
                    </div>
                  </div>

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

const boundBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  height: 17,
  padding: "0 6px",
  borderRadius: 999,
  border: "1px solid rgba(45, 212, 191, 0.5)",
  background: "rgba(20, 184, 166, 0.18)",
  color: "#99f6e4",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
  textTransform: "uppercase",
  letterSpacing: 0,
};

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
