"use client";

import { useMemo, useState, memo } from "react";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import { useShallow } from "zustand/react/shallow";
import NewBadge from "@/uhm/components/editor/NewBadge";
import { useEditorStore } from "@/uhm/store/editorStore";

type EntityChoice = { id: string; name: string; isNew?: boolean };
type WikiChoice = { id: string; title: string; isNew?: boolean };
type BindingRow = {
  entityId: string;
  entityName: string;
  entityIsNew: boolean;
  wikiId: string;
  wikiTitle: string;
  wikiIsNew: boolean;
  linkIsNew: boolean;
};

type Props = {
  setLinks: React.Dispatch<React.SetStateAction<EntityWikiLinkSnapshot[]>>;
};

function wikiTitle(w: WikiSnapshot): string {
  const t = String(w.title || "").trim();
  return t.length ? t : "Untitled wiki";
}

function EntityWikiBindingsPanel({ setLinks }: Props) {
  const {
    entityCatalog,
    snapshotEntityRows,
    wikis,
    links,
  } = useEditorStore(
    useShallow((state) => ({
      entityCatalog: state.entityCatalog,
      snapshotEntityRows: state.snapshotEntityRows,
      wikis: state.snapshotWikis,
      links: state.snapshotEntityWikiLinks,
    }))
  );
  const [activeEntityId, setActiveEntityId] = useState<string>("");
  const [activeWikiId, setActiveWikiId] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);

  const wikiChoices: WikiChoice[] = useMemo(
    () =>
      (wikis || [])
        .filter((w) => w && typeof w.id === "string" && w.id.trim().length > 0)
        .map((w) => ({
          id: w.id,
          title: wikiTitle(w),
          isNew: w.source === "inline" && w.operation === "create",
        })),
    [wikis]
  );

  const entityChoices = useMemo<EntityChoice[]>(() => {
    const visibleSnapshotEntityRows = new globalThis.Map<string, { id: string; name: string; isNew: boolean }>();
    for (const ref of snapshotEntityRows || []) {
      const id = String(ref?.id || "").trim();
      if (!id || ref?.operation === "delete" || visibleSnapshotEntityRows.has(id)) continue;
      visibleSnapshotEntityRows.set(id, {
        id,
        name: String(ref?.name || id),
        isNew: ref?.source === "inline" && ref?.operation === "create",
      });
    }

    const rows = Array.from(visibleSnapshotEntityRows.values()).map((entity) => {
      const found = entityCatalog.find((item) => String(item.id) === entity.id) || null;
      return {
        id: entity.id,
        name: String(found?.name || entity.name || entity.id),
        isNew: entity.isNew,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [entityCatalog, snapshotEntityRows]);

  const activeLinks = useMemo(() => {
    const set = new Set<string>();
    for (const l of links || []) {
      if (!l || l.entity_id !== activeEntityId) continue;
      if (l.operation === "delete") continue;
      set.add(l.wiki_id);
    }
    return set;
  }, [activeEntityId, links]);

  const activeBindingRows = useMemo<BindingRow[]>(() => {
    const byKey = new Map<string, EntityWikiLinkSnapshot>();
    for (const link of links || []) {
      const entityId = String(link?.entity_id || "").trim();
      const wikiId = String(link?.wiki_id || "").trim();
      if (!entityId || !wikiId) continue;
      if (link.operation === "delete") continue;
      byKey.set(`${entityId}::${wikiId}`, link);
    }

    const rows = Array.from(byKey.values()).map((link) => {
      const entityId = String(link.entity_id);
      const wikiId = String(link.wiki_id);
      const entity = entityChoices.find((item) => item.id === entityId) || null;
      const wiki = wikiChoices.find((item) => item.id === wikiId) || null;
      return {
        entityId,
        entityName: entity?.name || entityId,
        entityIsNew: Boolean(entity?.isNew),
        wikiId,
        wikiTitle: wiki?.title || wikiId,
        wikiIsNew: Boolean(wiki?.isNew),
        linkIsNew: link.operation === "binding",
      };
    });

    rows.sort((a, b) => {
      if (a.linkIsNew !== b.linkIsNew) return a.linkIsNew ? -1 : 1;
      const entityCompare = a.entityName.localeCompare(b.entityName);
      if (entityCompare !== 0) return entityCompare;
      return a.wikiTitle.localeCompare(b.wikiTitle);
    });
    return rows;
  }, [entityChoices, links, wikiChoices]);

  const toggle = (wikiId: string) => {
    if (!activeEntityId) return;
    const id = String(wikiId || "").trim();
    if (!id) return;

    setLinks((prev) => {
      const idx = prev.findIndex((l) => l.entity_id === activeEntityId && l.wiki_id === id);
      // If link exists (reference/binding), unlink by removing the row entirely.
      if (idx >= 0 && prev[idx]?.operation !== "delete") {
        return prev.filter((_, i) => i !== idx);
      }
      // If link doesn't exist, add as a new binding (create for relation).
      return [
        ...prev.filter((l) => !(l.entity_id === activeEntityId && l.wiki_id === id)),
        { entity_id: activeEntityId, wiki_id: id, operation: "binding" },
      ];
    });
  };

  const activeWikiLinked = activeEntityId && activeWikiId ? activeLinks.has(activeWikiId) : false;
  const activeWikiChoice = activeWikiId ? wikiChoices.find((w) => w.id === activeWikiId) || null : null;
  const activeEntityChoice = activeEntityId ? entityChoices.find((e) => e.id === activeEntityId) || null : null;

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
        <div style={{ fontWeight: 700, fontSize: "14px" }}>Entity ↔ Wiki</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{activeBindingRows.length}</div>
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
            title={collapsed ? "Mo panel" : "Thu gon panel"}
            aria-label={collapsed ? "Mo panel Entity Wiki" : "Thu gon panel Entity Wiki"}
          >
            {collapsed ? <PlusIcon /> : <MinusIcon />}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Entity</div>
          <select
            value={activeEntityId}
            onChange={(e) => setActiveEntityId(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #1f2937",
              background: "#0b1220",
              color: "#e5e7eb",
              borderRadius: "6px",
              padding: "8px 10px",
              fontSize: "12px",
              outline: "none",
            }}
          >
            <option value="">Select entity…</option>
            {entityChoices.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {activeEntityId ? (
            <ActiveSelectionLabel
              label={activeEntityChoice?.name || activeEntityId}
              id={activeEntityId}
              isNew={Boolean(activeEntityChoice?.isNew)}
            />
          ) : null}
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Wikis</div>
          <div style={{ display: "grid", gap: "8px" }}>
            <select
              value={activeWikiId}
              onChange={(e) => setActiveWikiId(e.target.value)}
              disabled={wikiChoices.length === 0}
              style={{
                width: "100%",
                border: "1px solid #1f2937",
                background: "#0b1220",
                color: "#e5e7eb",
                borderRadius: "6px",
                padding: "8px 10px",
                fontSize: "12px",
                outline: "none",
                opacity: wikiChoices.length === 0 ? 0.7 : 1,
                cursor: wikiChoices.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <option value="">
                {wikiChoices.length === 0 ? "No wikis available" : "Select wiki…"}
              </option>
              {wikiChoices.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            {activeWikiChoice ? (
              <ActiveSelectionLabel
                label={activeWikiChoice.title}
                id={activeWikiChoice.id}
                isNew={Boolean(activeWikiChoice.isNew)}
              />
            ) : null}

            {wikiChoices.length === 0 ? (
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>No wiki in project yet.</div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!activeEntityId || !activeWikiId}
                  onClick={() => toggle(activeWikiId)}
                  style={{
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    cursor: !activeEntityId || !activeWikiId ? "not-allowed" : "pointer",
                    background: activeWikiLinked ? "#334155" : "#16a34a",
                    color: "white",
                    fontWeight: 800,
                    fontSize: 12,
                    opacity: !activeEntityId || !activeWikiId ? 0.65 : 1,
                  }}
                >
                  {activeWikiLinked ? "Unlink wiki" : "Link wiki"}
                </button>

                {activeWikiChoice ? (
                  <div style={{ fontSize: 12, color: "#94a3b8", overflowWrap: "anywhere" }}>
                    {activeWikiChoice.id}
                  </div>
                ) : null}

                {!activeEntityId ? (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>Pick an entity to see/link wikis.</div>
                ) : activeLinks.size ? (
                  <div style={{ display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Linked wikis ({activeLinks.size})</div>
                    {Array.from(activeLinks).map((id) => {
                      const w = wikiChoices.find((x) => x.id === id) || null;
                      return (
                        <div
                          key={id}
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #1f2937",
                            background: "#111827",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                          title={id}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <span
                                style={{
                                  color: "#e5e7eb",
                                  fontSize: 12,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontWeight: 700,
                                }}
                              >
                                {w?.title || "Untitled wiki"}
                              </span>
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {id}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggle(id)}
                            style={{
                              border: "none",
                              background: "#0b1220",
                              color: "#fecaca",
                              cursor: "pointer",
                              borderRadius: 6,
                              padding: "6px 8px",
                              fontSize: 12,
                              fontWeight: 800,
                              flex: "0 0 auto",
                            }}
                          >
                            Unlink
                          </button>
                        </div>
                      );
                    })}

                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>No wiki linked yet.</div>
                )}
              </>
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #1f2937",
            paddingTop: 8,
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            All bindings ({activeBindingRows.length})
          </div>
          {activeBindingRows.length ? (
            <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
              {activeBindingRows.map((row) => (
                <div
                  key={`${row.entityId}::${row.wikiId}`}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    border: row.linkIsNew ? "1px solid rgba(45, 212, 191, 0.55)" : "1px solid #1f2937",
                    background: row.linkIsNew ? "rgba(20, 184, 166, 0.12)" : "#111827",
                    display: "grid",
                    gap: 5,
                  }}
                  title={`${row.entityId} ↔ ${row.wikiId}`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        color: "#e5e7eb",
                        fontSize: 12,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.entityName}
                    </span>
                    {row.entityIsNew ? <NewBadge title="Entity mới trong phiên này" /> : null}
                    {row.linkIsNew ? <NewBadge title="Binding mới trong phiên này" /> : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ color: "#93c5fd", fontSize: 11, flex: "0 0 auto" }}>Wiki</span>
                    <span
                      style={{
                        color: "#cbd5e1",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.wikiTitle}
                    </span>
                    {row.wikiIsNew ? <NewBadge title="Wiki mới trong phiên này" /> : null}
                  </div>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.entityId} ↔ {row.wikiId}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>No entity-wiki binding yet.</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function ActiveSelectionLabel({
  label,
  id,
  isNew,
}: {
  label: string;
  id: string;
  isNew?: boolean;
}) {
  return (
    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ color: "#cbd5e1", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <span style={{ color: "#64748b", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {id}
      </span>
      {isNew ? <NewBadge /> : null}
    </div>
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

export default memo(EntityWikiBindingsPanel);
