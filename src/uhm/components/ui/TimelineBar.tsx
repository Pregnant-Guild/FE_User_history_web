"use client";

import { FIXED_TIMELINE_END_YEAR, FIXED_TIMELINE_START_YEAR, clampYearValue } from "@/uhm/lib/utils/timeline";

type Props = {
    year: number;
    onYearChange: (year: number) => void;
    timeRange?: number;
    onTimeRangeChange?: (range: number) => void;
    isLoading: boolean;
    disabled: boolean;
    statusText?: string | null;
    filterEnabled?: boolean;
    onFilterEnabledChange?: (enabled: boolean) => void;
    style?: React.CSSProperties;
};

export default function TimelineBar({
    year,
    onYearChange,
    timeRange,
    onTimeRangeChange,
    isLoading,
    disabled,
    statusText,
    filterEnabled,
    onFilterEnabledChange,
    style,
}: Props) {
    const lower = FIXED_TIMELINE_START_YEAR;
    const upper = FIXED_TIMELINE_END_YEAR;
    const effectiveDisabled = disabled;
    const safeYear = clampYearValue(year, lower, upper);

    const helperText = isLoading
        ? "Đang tải geometry theo mốc thời gian..."
        : statusText || null;

    const handleYearChange = (nextYear: number) => {
        onYearChange(clampYearValue(Math.trunc(nextYear), lower, upper));
    };

    const handleTimeRangeChange = (nextValue: number) => {
        if (!onTimeRangeChange) return;
        const safe = Number.isFinite(nextValue) ? Math.trunc(nextValue) : 0;
        onTimeRangeChange(Math.max(0, Math.min(30, safe)));
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
                padding: "10px 12px",
                color: "#e2e8f0",
                backdropFilter: "blur(2px)",
                ...style,
            }}
            title={helperText || undefined}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    rowGap: "8px",
                    columnGap: "10px",
                    fontSize: "12px",
                }}
            >
                {typeof filterEnabled === "boolean" && onFilterEnabledChange ? (
                    <label
                        title={filterEnabled ? "Dang bat loc timeline" : "Dang tat loc timeline (hien thi tat ca geometry)"}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: effectiveDisabled ? "not-allowed" : "pointer",
                            userSelect: "none",
                            opacity: effectiveDisabled ? 0.6 : 1,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 36,
                                height: 20,
                                borderRadius: 999,
                                border: "1px solid rgba(148, 163, 184, 0.45)",
                                background: filterEnabled ? "rgba(34, 197, 94, 0.9)" : "rgba(148, 163, 184, 0.25)",
                                position: "relative",
                                flex: "0 0 auto",
                            }}
                        >
                            <span
                                style={{
                                    position: "absolute",
                                    top: 2,
                                    left: filterEnabled ? 18 : 2,
                                    width: 16,
                                    height: 16,
                                    borderRadius: 999,
                                    background: "#0b1220",
                                    border: "1px solid rgba(148, 163, 184, 0.35)",
                                    transition: "left 120ms ease",
                                }}
                            />
                        </span>
                        <input
                            type="checkbox"
                            checked={filterEnabled}
                            onChange={(e) => onFilterEnabledChange(e.target.checked)}
                            disabled={effectiveDisabled}
                            aria-label="Toggle timeline filter"
                            style={{ display: "none" }}
                        />
                    </label>
                ) : null}
                <span style={{ color: "#94a3b8", minWidth: 44 }}>{formatYear(lower)}</span>
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
                        flex: 1,
                        minWidth: "120px",
                        accentColor: "#22c55e",
                        cursor: effectiveDisabled ? "not-allowed" : "pointer",
                        opacity: effectiveDisabled ? 0.6 : 1,
                    }}
                />
                <span style={{ color: "#94a3b8", minWidth: 44, textAlign: "right" }}>
                    {formatYear(upper)}
                </span>
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
                        width: "128px",
                        border: "1px solid rgba(148, 163, 184, 0.45)",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        background: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "13px",
                        outline: "none",
                    }}
                />
                {typeof timeRange === "number" && onTimeRangeChange ? (
                    <label
                        title="time_range (0-30)"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            color: "#94a3b8",
                            whiteSpace: "nowrap",
                            opacity: effectiveDisabled ? 0.6 : 1,
                        }}
                    >
                        <span style={{ fontSize: "12px" }}>Range</span>
                        <input
                            type="number"
                            min={0}
                            max={30}
                            step={1}
                            value={Math.max(0, Math.min(30, Math.trunc(timeRange)))}
                            onChange={(event) => handleTimeRangeChange(Number(event.target.value))}
                            disabled={effectiveDisabled}
                            aria-label="Timeline range"
                            style={{
                                width: "84px",
                                border: "1px solid rgba(148, 163, 184, 0.45)",
                                borderRadius: "6px",
                                padding: "6px 8px",
                                background: "rgba(15, 23, 42, 0.7)",
                                color: "#f8fafc",
                                fontSize: "13px",
                                outline: "none",
                            }}
                        />
                    </label>
                ) : null}
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
