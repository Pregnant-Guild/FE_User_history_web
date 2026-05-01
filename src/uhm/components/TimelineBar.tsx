"use client";

import { FIXED_TIMELINE_END_YEAR, FIXED_TIMELINE_START_YEAR, clampYearValue } from "@/uhm/lib/timeline";

type Props = {
    year: number;
    onYearChange: (year: number) => void;
    isLoading: boolean;
    disabled: boolean;
    statusText?: string | null;
};

export default function TimelineBar({
    year,
    onYearChange,
    isLoading,
    disabled,
    statusText,
}: Props) {
    const lower = FIXED_TIMELINE_START_YEAR;
    const upper = FIXED_TIMELINE_END_YEAR;
    const effectiveDisabled = disabled;
    const safeYear = clampYearValue(year, lower, upper);

    const helperText = isLoading
        ? "Đang tải geometry theo mốc thời gian..."
        : statusText || "Kéo thanh hoặc nhập số năm để query chính xác.";

    const handleYearChange = (nextYear: number) => {
        onYearChange(clampYearValue(Math.trunc(nextYear), lower, upper));
    };

    return (
        <div
            style={{
                position: "absolute",
                left: "18px",
                right: "18px",
                bottom: "16px",
                zIndex: 10,
                background: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "10px",
                padding: "12px 14px",
                color: "#e2e8f0",
                backdropFilter: "blur(2px)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                    gap: "8px",
                }}
            >
                <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "0.02em" }}>
                    Timeline
                </span>
                <span style={{ fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                    {formatYear(safeYear)}
                </span>
            </div>

            <div style={{ fontSize: "12px", color: "#cbd5e1", marginTop: "8px", marginBottom: "6px" }}>
                Mốc thời gian chi tiết
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                    alignItems: "center",
                    gap: "10px",
                }}
            >
                <input
                    type="range"
                    min={lower}
                    max={upper}
                    step={1}
                    value={safeYear}
                    onChange={(event) => handleYearChange(Number(event.target.value))}
                    disabled={effectiveDisabled}
                    aria-label="Timeline year"
                    style={{
                        width: "100%",
                        accentColor: "#22c55e",
                        cursor: effectiveDisabled ? "not-allowed" : "pointer",
                        opacity: effectiveDisabled ? 0.6 : 1,
                    }}
                />
                <input
                    type="number"
                    min={lower}
                    max={upper}
                    step={1}
                    value={safeYear}
                    onChange={(event) => handleYearChange(Number(event.target.value))}
                    disabled={effectiveDisabled}
                    aria-label="Timeline exact year"
                    style={{
                        width: "100%",
                        border: "1px solid rgba(148, 163, 184, 0.45)",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        background: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "13px",
                        outline: "none",
                    }}
                />
            </div>

            <div
                style={{
                    marginTop: "8px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    columnGap: "10px",
                    fontSize: "12px",
                }}
            >
                <span style={{ color: "#94a3b8" }}>{formatYear(lower)}</span>
                <span style={{ color: "#cbd5e1", textAlign: "center", whiteSpace: "nowrap" }}>
                    {helperText}
                </span>
                <span style={{ color: "#94a3b8", textAlign: "right" }}>{formatYear(upper)}</span>
            </div>
        </div>
    );
}

function formatYear(year: number): string {
    if (year < 0) {
        return `${Math.abs(year)} TCN`;
    }
    return `${year}`;
}
