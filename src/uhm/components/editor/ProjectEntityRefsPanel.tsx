"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { EntityFormState } from "@/uhm/lib/editor/session/sessionTypes";
import NewBadge from "@/uhm/components/editor/NewBadge";

type Props = {
  entityRefs: EntitySnapshot[];
  entityForm: EntityFormState;
  onEntityFormChange: (key: keyof EntityFormState, value: string) => void;
  isEntitySubmitting: boolean;
  onCreateEntityOnly: () => void;
  onUpdateEntity?: (entityId: string, payload: { name: string; description: string | null }) => void;
  entityFormStatus: string | null;
  selectedGeometryEntityIds?: string[];
  hasSelectedGeometry?: boolean;
  onToggleBindEntityForSelectedGeometry?: (entityId: string, nextChecked: boolean) => void;
};

export default function ProjectEntityRefsPanel({
  entityRefs,
  entityForm,
  onEntityFormChange,
  isEntitySubmitting,
  onCreateEntityOnly,
  onUpdateEntity,
  entityFormStatus,
  selectedGeometryEntityIds,
  hasSelectedGeometry,
  onToggleBindEntityForSelectedGeometry,
}: Props) {
  const canBindToggle =
    Boolean(hasSelectedGeometry) &&
    Array.isArray(selectedGeometryEntityIds) &&
    typeof onToggleBindEntityForSelectedGeometry === "function";

  const canEditEntity = typeof onUpdateEntity === "function";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);

  const activeEntity = useMemo(
    () => (activeEntityId ? entityRefs.find((e) => String(e.id) === String(activeEntityId)) || null : null),
    [activeEntityId, entityRefs]
  );
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const openEntityEditor = (entity: EntitySnapshot) => {
    setActiveEntityId(String(entity.id));
    setEditName(typeof entity.name === "string" ? entity.name : "");
    setEditDescription(entity.description == null ? "" : String(entity.description));
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

      {collapsed ? null : entityRefs.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
          {entityRefs.map((e) => (
            <div
              key={e.id}
              style={{
                padding: "8px",
                borderRadius: "6px",
                border: activeEntityId === String(e.id) ? "1px solid #2563eb" : "1px solid #1f2937",
                background: "transparent",
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
                  {isNewEntityRef(e) ? <NewBadge /> : null}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.id}
                </div>
              </button>
              {canBindToggle ? (
                <button
                  type="button"
                  title={selectedGeometryEntityIds!.includes(String(e.id)) ? "Unbind from selected geometry" : "Bind to selected geometry"}
                  onClick={() =>
                    onToggleBindEntityForSelectedGeometry!(
                      String(e.id),
                      !selectedGeometryEntityIds!.includes(String(e.id))
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
                    selectedGeometryEntityIds!.includes(String(e.id))
                      ? `Unbind entity ${String(e.id)} from selected geometry`
                      : `Bind entity ${String(e.id)} to selected geometry`
                  }
                >
                  {selectedGeometryEntityIds!.includes(String(e.id)) ? (
                    <UnlockIcon />
                  ) : (
                    <LockIcon />
                  )}
                </button>
              ) : null}
            </div>
          ))}

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
            <button
              type="button"
              onClick={() => setActiveEntityId(null)}
              title="Dong"
              aria-label="Dong sua entity"
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
              <CloseIcon />
            </button>
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

          <button
            type="button"
            onClick={() => onUpdateEntity!(String(activeEntity.id), { name: editName, description: editDescription.trim().length ? editDescription : null })}
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
          <button
            type="button"
            onClick={() => setIsCreateOpen((v) => !v)}
            disabled={isEntitySubmitting}
            title={isCreateOpen ? "Dong" : "Mo"}
            aria-label={isCreateOpen ? "Dong tao entity" : "Mo tao entity"}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#e2e8f0",
              cursor: isEntitySubmitting ? "not-allowed" : "pointer",
              opacity: isEntitySubmitting ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {isCreateOpen ? <CloseIcon /> : <PlusIcon />}
          </button>
        </div>

        {isCreateOpen ? (
          <>
            <input
              value={entityForm.name}
              onChange={(event) => onEntityFormChange("name", event.target.value)}
              placeholder="Tên entity mới"
              disabled={isEntitySubmitting}
              style={entityInputStyle}
            />
            <input
              value={entityForm.description}
              onChange={(event) => onEntityFormChange("description", event.target.value)}
              placeholder="Description"
              disabled={isEntitySubmitting}
              style={entityInputStyle}
            />

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
