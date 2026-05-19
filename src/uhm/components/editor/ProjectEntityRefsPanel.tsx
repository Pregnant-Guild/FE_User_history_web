"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { EntitySnapshot } from "@/uhm/types/entities";
import { useShallow } from "zustand/react/shallow";
import NewBadge from "@/uhm/components/editor/NewBadge";
import { useEditorStore } from "@/uhm/store/editorStore";

type Props = {
  onCreateEntityOnly: () => void;
  onUpdateEntity?: (entityId: string, payload: { name: string; description: string | null; time_start: string; time_end: string }) => void;
  hasSelectedGeometry?: boolean;
  selectedGeometryTime?: { time_start: number | null; time_end: number | null } | null;
  onToggleBindEntityForSelectedGeometry?: (entityId: string, nextChecked: boolean) => void;
};

export default function ProjectEntityRefsPanel({
  onCreateEntityOnly,
  onUpdateEntity,
  hasSelectedGeometry,
  selectedGeometryTime,
  onToggleBindEntityForSelectedGeometry,
}: Props) {
  const {
    snapshotEntities,
    entityForm,
    setEntityForm,
    isEntitySubmitting,
    entityFormStatus,
    selectedGeometryEntityIds,
  } = useEditorStore(
    useShallow((state) => ({
      snapshotEntities: state.snapshotEntities,
      entityForm: state.entityForm,
      setEntityForm: state.setEntityForm,
      isEntitySubmitting: state.isEntitySubmitting,
      entityFormStatus: state.entityFormStatus,
      selectedGeometryEntityIds: state.selectedGeometryEntityIds,
    }))
  );
  const canBindToggle =
    Boolean(hasSelectedGeometry) &&
    Array.isArray(selectedGeometryEntityIds) &&
    typeof onToggleBindEntityForSelectedGeometry === "function";

  const canEditEntity = typeof onUpdateEntity === "function";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const selectedEntityIdSet = useMemo(
    () => new Set((selectedGeometryEntityIds || []).map(String)),
    [selectedGeometryEntityIds]
  );
  const entityRefs = useMemo(() => {
    const byId = new globalThis.Map<string, EntitySnapshot>();
    for (const ref of snapshotEntities || []) {
      const id = String(ref?.id || "").trim();
      if (!id || byId.has(id)) continue;
      if (ref.operation === "delete") continue;
      byId.set(id, ref);
    }
    return Array.from(byId.values());
  }, [snapshotEntities]);
  const sortedEntityRefs = useMemo(() => {
    const rows = [...(entityRefs || [])];
    rows.sort((a, b) => {
      const aBound = selectedEntityIdSet.has(String(a.id));
      const bBound = selectedEntityIdSet.has(String(b.id));
      if (aBound !== bBound) return aBound ? -1 : 1;
      const aLabel = String(a.name || a.id || "");
      const bLabel = String(b.name || b.id || "");
      return aLabel.localeCompare(bLabel);
    });
    return rows;
  }, [entityRefs, selectedEntityIdSet]);

  const activeEntity = useMemo(
    () => (activeEntityId ? entityRefs.find((e) => String(e.id) === String(activeEntityId)) || null : null),
    [activeEntityId, entityRefs]
  );
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTimeStart, setEditTimeStart] = useState("");
  const [editTimeEnd, setEditTimeEnd] = useState("");
  const canCopySelectedGeometryTime =
    selectedGeometryTime != null &&
    (selectedGeometryTime.time_start != null || selectedGeometryTime.time_end != null);

  const openEntityEditor = (entity: EntitySnapshot) => {
    setActiveEntityId(String(entity.id));
    setEditName(typeof entity.name === "string" ? entity.name : "");
    setEditDescription(entity.description == null ? "" : String(entity.description));
    setEditTimeStart(entity.time_start != null ? String(entity.time_start) : "");
    setEditTimeEnd(entity.time_end != null ? String(entity.time_end) : "");
  };
  const handleEntityFormChange = (key: "name" | "description" | "time_start" | "time_end", value: string) => {
    setEntityForm((prev) => ({ ...prev, [key]: value }));
  };
  const copySelectedGeometryTimeToCreateForm = () => {
    if (!canCopySelectedGeometryTime || !selectedGeometryTime) return;
    setEntityForm((prev) => ({
      ...prev,
      time_start: selectedGeometryTime.time_start != null ? String(selectedGeometryTime.time_start) : "",
      time_end: selectedGeometryTime.time_end != null ? String(selectedGeometryTime.time_end) : "",
    }));
  };
  const copySelectedGeometryTimeToEditForm = () => {
    if (!canCopySelectedGeometryTime || !selectedGeometryTime) return;
    setEditTimeStart(selectedGeometryTime.time_start != null ? String(selectedGeometryTime.time_start) : "");
    setEditTimeEnd(selectedGeometryTime.time_end != null ? String(selectedGeometryTime.time_end) : "");
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
        <div style={{ fontWeight: 700, fontSize: "14px" }}>Entities</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{entityRefs.length}</div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Mo panel" : "Thu gon panel"}
            aria-label={collapsed ? "Mo panel Entities" : "Thu gon panel Entities"}
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
          >
            {collapsed ? <PlusIcon /> : <MinusIcon />}
          </button>
        </div>
      </div>

      {collapsed ? null : sortedEntityRefs.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
          {sortedEntityRefs.map((e) => {
            const entityId = String(e.id);
            const isBoundToSelectedGeometry = selectedEntityIdSet.has(entityId);
            const isActive = activeEntityId === entityId;
            return (
              <div
                key={e.id}
                style={{
                  padding: "8px",
                  borderRadius: "6px",
                  border: isActive
                    ? "1px solid #2563eb"
                    : isBoundToSelectedGeometry
                      ? "1px solid rgba(20, 184, 166, 0.65)"
                      : "1px solid #1f2937",
                  background: isBoundToSelectedGeometry ? "rgba(20, 184, 166, 0.12)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => openEntityEditor(e)}
                  title="Chon de sua"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: canEditEntity ? "pointer" : "default",
                  }}
                  disabled={!canEditEntity}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: "12px", color: "#e5e7eb", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.name || e.id}
                    </span>
                    {isBoundToSelectedGeometry ? <span style={boundBadgeStyle}>bound</span> : null}
                    {isNewEntityRef(e) ? <NewBadge /> : null}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.id}
                  </div>
                </button>
                {canBindToggle ? (
                  <button
                    type="button"
                    title={isBoundToSelectedGeometry ? "Unbind from selected geometry" : "Bind to selected geometry"}
                    onClick={() =>
                      onToggleBindEntityForSelectedGeometry!(
                        entityId,
                        !isBoundToSelectedGeometry
                      )
                    }
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
                      isBoundToSelectedGeometry
                        ? `Unbind entity ${entityId} from selected geometry`
                        : `Bind entity ${entityId} to selected geometry`
                    }
                  >
                    {isBoundToSelectedGeometry ? (
                      <UnlockIcon />
                    ) : (
                      <LockIcon />
                    )}
                  </button>
                ) : null}
              </div>
            );
          })}

        </div>
      ) : (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>No entity ref yet for this project.</div>
      )}

      {collapsed ? null : canEditEntity && activeEntity ? (
        <div
          style={{
            marginTop: "10px",
            display: "grid",
            gap: "8px",
            border: "1px solid #0f766e",
            borderRadius: "8px",
            padding: "8px",
            background: "#0f172a",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ color: "#a7f3d0", fontWeight: 700, fontSize: "12px" }}>
                Sua entity
              </span>
              {isNewEntityRef(activeEntity) ? <NewBadge /> : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={copySelectedGeometryTimeToEditForm}
                disabled={!canCopySelectedGeometryTime || isEntitySubmitting}
                title="Lay nam cua GEO dang chon"
                aria-label="Lay nam cua GEO dang chon cho entity dang sua"
                style={iconButtonStyle(!canCopySelectedGeometryTime || isEntitySubmitting)}
              >
                <ClockIcon />
              </button>
              <button
                type="button"
                onClick={() => setActiveEntityId(null)}
                title="Dong"
                aria-label="Dong sua entity"
                style={iconButtonStyle(false)}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#94a3b8", overflowWrap: "anywhere" }}>
            {String(activeEntity.id)}
          </div>
          <input
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            placeholder="Ten entity"
            disabled={isEntitySubmitting}
            style={entityInputStyle}
          />
          <input
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            placeholder="Description"
            disabled={isEntitySubmitting}
            style={entityInputStyle}
          />
          <div style={timeInputGridStyle}>
            <input
              value={editTimeStart}
              onChange={(event) => setEditTimeStart(event.target.value)}
              placeholder="time_start"
              disabled={isEntitySubmitting}
              style={entityInputStyle}
            />
            <input
              value={editTimeEnd}
              onChange={(event) => setEditTimeEnd(event.target.value)}
              placeholder="time_end"
              disabled={isEntitySubmitting}
              style={entityInputStyle}
            />
          </div>

          <button
            type="button"
            onClick={() => onUpdateEntity!(String(activeEntity.id), {
              name: editName,
              description: editDescription.trim().length ? editDescription : null,
              time_start: editTimeStart,
              time_end: editTimeEnd,
            })}
            disabled={isEntitySubmitting}
            style={{
              border: "none",
              borderRadius: "6px",
              padding: "7px 8px",
              cursor: isEntitySubmitting ? "not-allowed" : "pointer",
              background: "#0f766e",
              color: "#ffffff",
              opacity: isEntitySubmitting ? 0.7 : 1,
              fontWeight: 600,
            }}
          >
            Luu entity
          </button>
        </div>
      ) : null}

      {collapsed ? null : (
      <>
      <div
        style={{
          marginTop: "10px",
          display: "grid",
          gap: "8px",
          border: "1px solid #1e3a8a",
          borderRadius: "8px",
          padding: "8px",
          background: "#0f172a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "12px" }}>
            Tạo entity mới
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isCreateOpen ? (
              <button
                type="button"
                onClick={copySelectedGeometryTimeToCreateForm}
                disabled={!canCopySelectedGeometryTime || isEntitySubmitting}
                title="Lay nam cua GEO dang chon"
                aria-label="Lay nam cua GEO dang chon cho entity moi"
                style={iconButtonStyle(!canCopySelectedGeometryTime || isEntitySubmitting)}
              >
                <ClockIcon />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsCreateOpen((v) => !v)}
              disabled={isEntitySubmitting}
              title={isCreateOpen ? "Dong" : "Mo"}
              aria-label={isCreateOpen ? "Dong tao entity" : "Mo tao entity"}
              style={iconButtonStyle(isEntitySubmitting)}
            >
              {isCreateOpen ? <CloseIcon /> : <PlusIcon />}
            </button>
          </div>
        </div>

        {isCreateOpen ? (
          <>
            <input
              value={entityForm.name}
              onChange={(event) => handleEntityFormChange("name", event.target.value)}
              placeholder="Tên entity mới"
              disabled={isEntitySubmitting}
              style={entityInputStyle}
            />
            <input
              value={entityForm.description}
              onChange={(event) => handleEntityFormChange("description", event.target.value)}
              placeholder="Description"
              disabled={isEntitySubmitting}
              style={entityInputStyle}
            />
            <div style={timeInputGridStyle}>
              <input
                value={entityForm.time_start}
                onChange={(event) => handleEntityFormChange("time_start", event.target.value)}
                placeholder="time_start"
                disabled={isEntitySubmitting}
                style={entityInputStyle}
              />
              <input
                value={entityForm.time_end}
                onChange={(event) => handleEntityFormChange("time_end", event.target.value)}
                placeholder="time_end"
                disabled={isEntitySubmitting}
                style={entityInputStyle}
              />
            </div>

            <button
              type="button"
              onClick={onCreateEntityOnly}
              disabled={isEntitySubmitting}
              style={{
                border: "none",
                borderRadius: "6px",
                padding: "7px 8px",
                cursor: isEntitySubmitting ? "not-allowed" : "pointer",
                background: "#2563eb",
                color: "#ffffff",
                opacity: isEntitySubmitting ? 0.7 : 1,
                fontWeight: 600,
              }}
            >
              Tạo entity mới
            </button>
          </>
        ) : null}
      </div>

      {entityFormStatus ? (
        <div style={{ color: "#93c5fd", fontSize: "12px", marginTop: "8px" }}>
          {entityFormStatus}
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}

function isNewEntityRef(entity: EntitySnapshot | null | undefined): boolean {
  return entity?.source === "inline" && entity?.operation === "create";
}

const entityInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "6px",
  border: "1px solid #334155",
  background: "#111827",
  color: "#f8fafc",
  padding: "6px 8px",
  fontSize: "13px",
};

const timeInputGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

function iconButtonStyle(disabled: boolean): CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "#e2e8f0",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  };
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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="#fbbf24" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
