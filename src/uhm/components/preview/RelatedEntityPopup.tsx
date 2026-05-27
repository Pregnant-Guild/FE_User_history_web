"use client";

import { useEffect, useRef } from "react";
import type { Entity } from "@/uhm/api/entities";

type Props = {
    slug: string;
    entities: Entity[];
    top: number;
    left: number;
    onClose: () => void;
    onSelectEntity: (entityId: string) => void;
};

export default function RelatedEntityPopup({
    slug,
    entities,
    top,
    left,
    onClose,
    onSelectEntity,
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
            className="fixed z-[60] w-[240px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
            style={{ top, left }}
        >
            <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Related Entities
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    /wiki/{slug}
                </div>
            </div>
            <div className="max-h-[220px] overflow-y-auto p-2">
                <div className="grid gap-1">
                    {entities.map((entity) => (
                        <button
                            key={entity.id}
                            type="button"
                            onClick={() => {
                                onSelectEntity(entity.id);
                            }}
                            className="rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.04] dark:hover:text-white"
                        >
                            {entity.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
