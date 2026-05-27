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

        // Tạo đường ghost ảo chỉ vị trí kéo thay vì kích hoạt re-render liên tục
        const ghost = document.createElement("div");
        ghost.style.position = "fixed";
        ghost.style.top = "0";
        ghost.style.bottom = "0";
        ghost.style.width = "4px";
        ghost.style.backgroundColor = "#38bdf8";
        ghost.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.8)";
        ghost.style.zIndex = "99999";
        ghost.style.cursor = "col-resize";
        ghost.style.pointerEvents = "none";
        ghost.style.left = `${startX}px`;
        document.body.appendChild(ghost);

        const onMove = (e: PointerEvent) => {
            ghost.style.left = `${e.clientX}px`;
        };

        const onUp = (e: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            if (ghost.parentNode) {
                ghost.parentNode.removeChild(ghost);
            }
            const deltaX = e.clientX - startX;
            if (deltaX !== 0) {
                onDrag(deltaX);
            }
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
