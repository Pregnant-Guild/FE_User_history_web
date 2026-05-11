"use client";

import { useMemo, useState } from "react";

type GeometryChoice = {
  id: string;
  label?: string;
};

type Props = {
  geometries: GeometryChoice[];
  selectedGeometryId: string | null;
  selectedGeometryBindingIds: string[];
  onToggleBindGeometryForSelectedGeometry?: (geometryId: string, nextChecked: boolean) => void;
  statusText?: string | null;
  bindingFilterEnabled: boolean;
  onBindingFilterEnabledChange: (next: boolean) => void;
};

export default function GeometryBindingPanel({
  geometries,
  selectedGeometryId,
  selectedGeometryBindingIds,
  onToggleBindGeometryForSelectedGeometry,
  statusText,
  bindingFilterEnabled,
  onBindingFilterEnabledChange,
}: Props) {
  const canBindToggle =
    Boolean(selectedGeometryId) && typeof onToggleBindGeometryForSelectedGeometry === "function";

  const [collapsed, setCollapsed] = useState(false);

  const rows = useMemo(() => {
    const cleaned = (geometries || [])
      .filter((g) => g && typeof g.id === "string" && g.id.trim().length > 0)
      .map((g) => ({ id: g.id.trim(), label: (g.label || "").trim() }));
    cleaned.sort((a, b) => a.id.localeCompare(b.id));
    return cleaned;
  }, [geometries]);

  const bindingSet = useMemo(() => new Set(selectedGeometryBindingIds || []), [selectedGeometryBindingIds]);


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
              onChange={(e) => onBindingFilterEnabledChange(e.target.checked)}
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

      {collapsed ? null : rows.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
          {rows
            .filter((g) => g.id !== selectedGeometryId)
            .map((g) => {
              const isBound = bindingSet.has(g.id);
              return (
                <div
                  key={g.id}
                  style={{
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #1f2937",
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: canBindToggle ? 1 : 0.75,
                  }}
                  title={g.id}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
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
                      onClick={() => onToggleBindGeometryForSelectedGeometry!(g.id, !isBound)}
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
