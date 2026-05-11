"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type UnifiedSearchKind = "entity" | "wiki" | "geo";

type Props = {
    kind: UnifiedSearchKind;
    onKindChange: (kind: UnifiedSearchKind) => void;
    query: string;
    onQueryChange: (query: string) => void;
    disabledGeo?: boolean;
    debounceMs?: number;
    onLocalQueryChange?: (query: string) => void;
};

export default function UnifiedSearchBar({
    kind,
    onKindChange,
    query,
    onQueryChange,
    disabledGeo,
    debounceMs = 300,
    onLocalQueryChange,
}: Props) {
    // Local input state to avoid propagating query changes (and triggering API) on every keystroke.
    const [localQuery, setLocalQuery] = useState(query);
    const debounceTimerRef = useRef<number | null>(null);

    // Keep local input in sync when parent updates `query` externally (e.g. reset, preset, navigation).
    useEffect(() => {
        setLocalQuery(query);
    }, [query]);

    useEffect(() => {
        onLocalQueryChange?.(localQuery);
    }, [localQuery, onLocalQueryChange]);

    // Debounce propagation upwards.
    useEffect(() => {
        if (localQuery === query) return;

        if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = window.setTimeout(() => {
            onQueryChange(localQuery);
        }, debounceMs);

        return () => {
            if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        };
    }, [localQuery, query, onQueryChange, debounceMs]);

    const commitNow = () => {
        if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (localQuery !== query) onQueryChange(localQuery);
    };

    const selectStyle: CSSProperties = {
        width: 110,
        border: "1px solid #1f2937",
        background: "#0b1220",
        color: "#e5e7eb",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        outline: "none",
        flex: "0 0 auto",
    };

    const inputStyle: CSSProperties = {
        width: "100%",
        border: "1px solid #1f2937",
        background: "#0b1220",
        color: "#e5e7eb",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        outline: "none",
        minWidth: 0,
    };

    const helperText =
        kind === "entity"
            ? "Search entity theo name"
            : kind === "wiki"
                ? "Search wiki theo title"
                : "Search geo theo entity name";

    return (
        <div
            style={{
                padding: 10,
                background: "#0b1220",
                borderRadius: 8,
                border: "1px solid #1f2937",
                display: "grid",
                gap: 8,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Search</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{helperText}</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <select
                    value={kind}
                    onChange={(e) => onKindChange(e.target.value as UnifiedSearchKind)}
                    style={selectStyle}
                    aria-label="Search kind"
                >
                    <option value="entity">Entity</option>
                    <option value="wiki">Wiki</option>
                    <option value="geo" disabled={Boolean(disabledGeo)}>
                        Geo
                    </option>
                </select>
                <input
                    value={localQuery}
                    onChange={(e) => setLocalQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitNow();
                    }}
                    onBlur={() => commitNow()}
                    placeholder={kind === "entity" ? "Nhập tên entity…" : kind === "wiki" ? "Nhập title wiki…" : "Nhập tên entity…"}
                    style={inputStyle}
                    aria-label="Search query"
                />
            </div>
        </div>
    );
}
