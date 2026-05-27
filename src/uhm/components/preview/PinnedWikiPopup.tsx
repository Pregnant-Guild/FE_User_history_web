"use client";

import { useEffect, useRef } from "react";
import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";

type PopupRow = {
    entity: Entity;
    wiki: Wiki | null;
    quote: string;
};

type Props = {
    rows: PopupRow[];
    featureId: string | number;
    top: number;
    left: number;
    onClose: () => void;
    onSelectRow: (entityId: string, wikiId?: string) => void;
};

export default function PinnedWikiPopup({
    rows,
    featureId,
    top,
    left,
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

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && containerRef.current?.contains(target)) {
                return;
            }
            onClose();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [onClose]);

    return (
        <div
            ref={containerRef}
            className="absolute z-30 w-[320px] max-w-[calc(100vw-2rem)]"
            style={{ left, top }}
        >
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur">
                <div className="max-h-[300px] overflow-y-auto p-3">
                    <div className="grid gap-2">
                        {rows.map(({ entity, wiki, quote }) => (
                            <button
                                key={`${entity.id}:${wiki?.id || "entity-only"}`}
                                type="button"
                                onClick={() => {
                                    onSelectRow(entity.id, wiki?.id);
                                }}
                                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10"
                            >
                                <div className="truncate text-sm font-semibold text-white">
                                    {entity.name || String(entity.id)}
                                </div>
                                {quote ? (
                                    <div
                                        className="mt-2 pl-3 pr-1 text-sm italic leading-relaxed text-slate-300"
                                        style={{
                                            borderLeft: "3px solid rgba(56, 189, 248, 0.4)",
                                            display: "-webkit-box",
                                            WebkitLineClamp: 4,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                            whiteSpace: "normal",
                                        }}
                                    >
                                        {quote}
                                    </div>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
