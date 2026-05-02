"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entity } from "@/uhm/types/entities";
import type { EntitySnapshot } from "@/uhm/types/entities";
import { searchEntitiesByName } from "@/uhm/api/entities";

type Props = {
  entityRefs: EntitySnapshot[];
  setEntityRefs: React.Dispatch<React.SetStateAction<EntitySnapshot[]>>;
};

export default function ProjectEntityRefsPanel({ entityRefs, setEntityRefs }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestRef = useState(() => ({ id: 0 }))[0];

  const existingIds = useMemo(() => new Set(entityRefs.map((e) => String(e.id))), [entityRefs]);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword.length) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let disposed = false;
    const requestId = ++searchRequestRef.id;
    const t = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const rows = await searchEntitiesByName(keyword, { limit: 20 });
        if (disposed || requestId !== searchRequestRef.id) return;
        setResults(rows);
      } catch (err) {
        if (disposed || requestId !== searchRequestRef.id) return;
        console.error("Search entities failed", err);
        setResults([]);
      } finally {
        if (disposed || requestId !== searchRequestRef.id) return;
        setIsSearching(false);
      }
    }, 250);

    return () => {
      disposed = true;
      window.clearTimeout(t);
    };
  }, [query, searchRequestRef]);

  const addRef = (e: Entity) => {
    const id = String(e.id || "").trim();
    if (!id) return;
    if (existingIds.has(id)) return;
    setEntityRefs((prev) => [
      {
        id,
        source: "ref",
        ref: { id },
        operation: "reference",
        name: e.name,
        description: e.description ?? null,
        is_deleted: 0,
      },
      ...prev,
    ]);
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
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>{entityRefs.length}</div>
      </div>

      <div style={{ marginTop: "10px" }}>
        <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Add existing entity</div>
        <input
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder="Search by name…"
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
        />
        {isSearching ? (
          <div style={{ marginTop: "6px", fontSize: "12px", color: "#94a3b8" }}>Searching…</div>
        ) : null}
        {!isSearching && query.trim().length > 0 ? (
          <div style={{ marginTop: "6px", display: "grid", gap: "6px" }}>
            {results.slice(0, 8).map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #1f2937",
                  background: "transparent",
                  opacity: existingIds.has(r.id) ? 0.55 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e5e7eb", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.name}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addRef(r)}
                  disabled={existingIds.has(r.id)}
                  style={{
                    border: "none",
                    background: "#111827",
                    color: existingIds.has(r.id) ? "#64748b" : "#93c5fd",
                    cursor: existingIds.has(r.id) ? "not-allowed" : "pointer",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    fontSize: "12px",
                    fontWeight: 700,
                    flex: "0 0 auto",
                  }}
                >
                  Add
                </button>
              </div>
            ))}
            {!results.length ? <div style={{ fontSize: "12px", color: "#94a3b8" }}>No results.</div> : null}
          </div>
        ) : null}
      </div>

      {entityRefs.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
          {entityRefs.slice(0, 8).map((e) => (
            <div
              key={e.id}
              style={{
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #1f2937",
                background: "transparent",
              }}
            >
              <div style={{ fontSize: "12px", color: "#e5e7eb", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.name || e.id}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.id}
              </div>
            </div>
          ))}
          {entityRefs.length > 8 ? <div style={{ fontSize: "12px", color: "#94a3b8" }}>+{entityRefs.length - 8} more…</div> : null}
        </div>
      ) : (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>No entity ref yet for this project.</div>
      )}
    </div>
  );
}
