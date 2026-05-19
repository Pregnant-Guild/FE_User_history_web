"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

type ResizeHandleProps = {
    onDrag: (deltaX: number) => void;
    title: string;
};

export function ResizeHandle({ onDrag, title }: ResizeHandleProps) {
    // Theo dõi pointer toàn window để resize vẫn mượt khi cursor đi ra khỏi handle.
    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        let lastX = startX;

        const onMove = (e: PointerEvent) => {
            const deltaX = e.clientX - lastX;
            if (deltaX !== 0) {
                onDrag(deltaX);
                lastX = e.clientX;
            }
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            title={title}
            onPointerDown={handlePointerDown}
            style={{
                width: 6,
                cursor: "col-resize",
                background: "rgba(148, 163, 184, 0.08)",
                borderLeft: "1px solid rgba(148, 163, 184, 0.18)",
                borderRight: "1px solid rgba(148, 163, 184, 0.18)",
                flex: "0 0 auto",
            }}
        />
    );
}
