"use client";

import { useMemo, useState } from "react";
import type { Entity } from "@/uhm/types/entities";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/sections";

type EntityChoice = { id: string; name: string };
type WikiChoice = { id: string; title: string; operation?: string };

type Props = {
  entities: EntityChoice[];
  wikis: WikiSnapshot[];
  links: EntityWikiLinkSnapshot[];
  setLinks: React.Dispatch<React.SetStateAction<EntityWikiLinkSnapshot[]>>;
};

function wikiTitle(w: WikiSnapshot): string {
  const t = String(w.title || "").trim();
  return t.length ? t : "Untitled wiki";
}

export default function EntityWikiBindingsPanel({ entities, wikis, links, setLinks }: Props) {
  const [activeEntityId, setActiveEntityId] = useState<string>("");

  const wikiChoices: WikiChoice[] = useMemo(
    () =>
      (wikis || [])
        .filter((w) => w && typeof w.id === "string" && w.id.trim().length > 0)
        .map((w) => ({ id: w.id, title: wikiTitle(w), operation: w.operation })),
    [wikis]
  );

  const entityChoices = useMemo(() => {
    const cleaned = (entities || []).filter((e) => e && typeof e.id === "string" && e.id.trim().length > 0);
    cleaned.sort((a, b) => a.name.localeCompare(b.name));
    return cleaned;
  }, [entities]);

  const activeLinks = useMemo(() => {
    const set = new Set<string>();
    for (const l of links || []) {
      if (!l || l.entity_id !== activeEntityId) continue;
      if (l.is_deleted) continue;
      set.add(l.wiki_id);
    }
    return set;
  }, [activeEntityId, links]);

  const toggle = (wikiId: string) => {
    if (!activeEntityId) return;
    const id = String(wikiId || "").trim();
    if (!id) return;

    setLinks((prev) => {
      const next = [...prev];
      const idx = next.findIndex((l) => l.entity_id === activeEntityId && l.wiki_id === id);
      if (idx >= 0) {
        const existing = next[idx];
        const currentlyOn = !existing.is_deleted;
        next[idx] = {
          ...existing,
          operation: currentlyOn ? "delete" : "reference",
          is_deleted: currentlyOn ? 1 : 0,
        };
        return next;
      }
      next.push({
        entity_id: activeEntityId,
        wiki_id: id,
        operation: "reference",
        is_deleted: 0,
      });
      return next;
    });
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
        <div style={{ fontWeight: 700, fontSize: "14px" }}>Entity ↔ Wiki</div>
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>{links.length}</div>
      </div>

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
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Wikis</div>
          {!wikiChoices.length ? (
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>No wiki in project yet.</div>
          ) : !activeEntityId ? (
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>Pick an entity to bind wikis.</div>
          ) : (
            <div style={{ display: "grid", gap: "6px" }}>
              {wikiChoices.slice(0, 12).map((w) => {
                const checked = activeLinks.has(w.id);
                const isRefWiki = (wikis.find((x) => x.id === w.id)?.source || "inline") === "ref";
                return (
                  <label
                    key={w.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid #1f2937",
                      cursor: "pointer",
                      background: checked ? "#111827" : "transparent",
                    }}
                    title={w.id}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(w.id)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#e5e7eb", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {w.title}
                        {isRefWiki ? " (ref)" : ""}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {w.id}
                      </div>
                    </div>
                  </label>
                );
              })}
              {wikiChoices.length > 12 ? (
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>+{wikiChoices.length - 12} more…</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
