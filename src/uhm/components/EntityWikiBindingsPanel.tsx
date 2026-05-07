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
  const [activeWikiId, setActiveWikiId] = useState<string>("");

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
      if (l.operation === "delete") continue;
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
        const currentlyOn = existing.operation !== "delete";
        next[idx] = {
          ...existing,
          operation: currentlyOn ? "delete" : "binding",
        };
        return next;
      }
      next.push({
        entity_id: activeEntityId,
        wiki_id: id,
        operation: "binding",
      });
      return next;
    });
  };

  const activeWikiLinked = activeEntityId && activeWikiId ? activeLinks.has(activeWikiId) : false;
  const activeWikiChoice = activeWikiId ? wikiChoices.find((w) => w.id === activeWikiId) || null : null;

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
                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Linked wikis ({activeLinks.size})</div>
                    {Array.from(activeLinks).slice(0, 8).map((id) => {
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
                            <div
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
                    {activeLinks.size > 8 ? (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>+{activeLinks.size - 8} more…</div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>No wiki linked yet.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
