import type { ReactNode } from "react";

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
    return (
        <details
            open={Boolean(defaultOpen)}
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
                {badge ? (
                    <span
                        style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #334155",
                            background: "#0b1220",
                            color: "#cbd5e1",
                            fontSize: 12,
                            fontWeight: 850,
                            flex: "0 0 auto",
                        }}
                    >
                        {badge}
                    </span>
                ) : null}
            </summary>
            <div style={{ marginTop: 10 }}>{children}</div>
        </details>
    );
}
