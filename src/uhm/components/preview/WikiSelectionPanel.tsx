"use client";

import { useEffect, useRef } from "react";
import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";

type WikiSelectionRow = {
    entity: Entity;
    wiki: Wiki;
    quote: string;
};

type Props = {
    rows: WikiSelectionRow[];
    onClose: () => void;
    onSelectRow: (entityId: string, wikiId: string) => void;
};

export default function WikiSelectionPanel({
    rows,
    onClose,
    onSelectRow,
}: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                maxWidth: "100%",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
                overflow: "hidden",
                borderRadius: 20,
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
                boxShadow: "0 20px 48px rgba(2, 6, 23, 0.45)",
                backdropFilter: "blur(12px)",
                position: "relative",
            }}
        >
            <div
                style={{
                    borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
                    padding: "16px",
                }}
            >
                <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                            style={{
                                fontSize: 10,
                                textTransform: "uppercase",
                                letterSpacing: "1.2px",
                                fontWeight: 900,
                                color: "#94a3b8",
                            }}
                        >
                            Wiki
                        </div>
                        <div
                            style={{
                                marginTop: 4,
                                fontSize: 18,
                                fontWeight: 700,
                                lineHeight: 1.3,
                                color: "#f8fafc",
                            }}
                        >
                            Chọn wiki để mở
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            display: "inline-flex",
                            height: 28,
                            width: 28,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            border: "1px solid rgba(148, 163, 184, 0.25)",
                            background: "rgba(30, 41, 59, 0.4)",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: 12,
                            transition: "all 0.2s",
                            outline: "none",
                        }}
                        className="hover:bg-slate-700/50 hover:text-slate-100"
                        aria-label="Đóng bảng chọn wiki"
                    >
                        x
                    </button>
                </div>
            </div>

            <div className="uhm-pinned-wiki-panel-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
                <div style={{ display: "grid", gap: 10 }}>
                    {rows.map(({ entity, wiki, quote }, index) => {
                        const previous = rows[index - 1];
                        const startsEntityGroup = !previous || previous.entity.id !== entity.id;

                        return (
                            <div key={`${entity.id}:${wiki.id}`}>
                                {startsEntityGroup ? (
                                    <div
                                        style={{
                                            paddingTop: index > 0 ? 12 : 0,
                                            marginTop: index > 0 ? 4 : 0,
                                            borderTop: index > 0 ? "1px solid rgba(148, 163, 184, 0.16)" : "none",
                                        }}
                                    >
                                        <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", lineHeight: "20px" }}>
                                            {entity.name || String(entity.id)}
                                        </div>
                                        {entity.description?.trim() ? (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: 12,
                                                    lineHeight: "17px",
                                                    color: "#94a3b8",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {entity.description.trim()}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={() => onSelectRow(entity.id, wiki.id)}
                                    style={{
                                        width: "100%",
                                        marginTop: 6,
                                        padding: "9px 10px 9px 12px",
                                        border: "1px solid transparent",
                                        borderRadius: 10,
                                        background: "rgba(15, 23, 42, 0.34)",
                                        boxShadow: "inset 2px 0 0 rgba(56, 189, 248, 0.52)",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        transition: "background 0.15s ease, border-color 0.15s ease",
                                    }}
                                    className="hover:border-sky-400/30 hover:bg-sky-500/10"
                                >
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 800,
                                            lineHeight: "19px",
                                            color: "#e2e8f0",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            minWidth: 0,
                                        }}
                                    >
                                        {wiki.title?.trim() || entity.name || String(wiki.id)}
                                    </div>
                                    {quote ? (
                                        <div
                                            style={{
                                                marginTop: 6,
                                                paddingLeft: 10,
                                                borderLeft: "2px solid rgba(56, 189, 248, 0.48)",
                                                fontSize: 12.5,
                                                fontStyle: "italic",
                                                lineHeight: "18px",
                                                color: "#cbd5e1",
                                                display: "-webkit-box",
                                                WebkitLineClamp: 4,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                                whiteSpace: "normal",
                                                overflowWrap: "anywhere",
                                                wordBreak: "break-word",
                                            }}
                                        >
                                            {quote}
                                        </div>
                                    ) : null}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style jsx>{`
                .uhm-pinned-wiki-panel-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(56, 189, 248, 0.58) rgba(15, 23, 42, 0.72);
                }
                .uhm-pinned-wiki-panel-scroll::-webkit-scrollbar {
                    width: 9px;
                }
                .uhm-pinned-wiki-panel-scroll::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 0.72);
                }
                .uhm-pinned-wiki-panel-scroll::-webkit-scrollbar-thumb {
                    border: 2px solid rgba(15, 23, 42, 0.95);
                    border-radius: 999px;
                    background: linear-gradient(180deg, rgba(56, 189, 248, 0.86), rgba(14, 165, 233, 0.58));
                }
            `}</style>
        </div>
    );
}
