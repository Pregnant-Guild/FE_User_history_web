import { type ReactNode, useState } from "react";

type PanelProps = {
    title: string;
    badge?: string | null;
    defaultOpen?: boolean;
    children: ReactNode;
};

export function Panel({
    title,
    badge,
    defaultOpen,
    children,
}: PanelProps) {
    const [open, setOpen] = useState(Boolean(defaultOpen));

    return (
        <details
            open={open}
            onToggle={(e) => setOpen(e.currentTarget.open)}
            style={{
                marginTop: 10,
                padding: 10,
                background: "#111827",
                borderRadius: 8,
                border: "1px solid #1f2937",
            }}
        >
            <summary
                style={{
                    cursor: "pointer",
                    listStyle: "none",
                    fontWeight: 900,
                    fontSize: 13,
                    color: "white",
                    userSelect: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <span>{title}</span>
                <span
                    style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: "1px solid #334155",
                        background: "#0b1220",
                        color: "#cbd5e1",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        flex: "0 0 auto",
                    }}
                >
                    {open ? "−" : "+"}
                </span>
            </summary>
            <style>{`
                summary::-webkit-details-marker {
                    display: none !important;
                }
                summary {
                    list-style: none !important;
                }
            `}</style>
            <div style={{ marginTop: 10 }}>{children}</div>
        </details>
    );
}
