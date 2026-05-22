"use client";

import { FIXED_TIMELINE_END_YEAR, FIXED_TIMELINE_START_YEAR, clampYearValue } from "@/uhm/lib/utils/timeline";
import styles from "@/styles/TimelineBar.module.css";

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
            className={`${styles.container} ${isLoading ? styles.containerLoading : ""} ${effectiveDisabled ? styles.disabled : ""}`}
            style={style}
            title={helperText || undefined}
        >
            <div className={styles.flexWrapper}>
                {typeof filterEnabled === "boolean" && onFilterEnabledChange ? (
                    <label
                        title={filterEnabled ? "Dang bat loc timeline" : "Dang tat loc timeline (hien thi tat ca geometry)"}
                        className={`${styles.toggleContainer} ${effectiveDisabled ? styles.disabled : ""}`}
                    >
                        <span
                            aria-hidden="true"
                            className={`${styles.toggleTrack} ${filterEnabled ? styles.toggleTrackActive : ""}`}
                        >
                            <span
                                className={`${styles.toggleThumb} ${filterEnabled ? styles.toggleThumbActive : ""}`}
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
                <span className={styles.labelBounds}>{formatYear(lower)}</span>
                <input
                    type="range"
                    min={lower}
                    max={upper}
                    step={1}
                    value={safeYear}
                    onChange={(event) => handleYearChange(Number(event.target.value))}
                    disabled={effectiveDisabled}
                    className={styles.slider}
                    aria-label="Timeline year"
                />
                <span className={styles.labelBoundsRight}>
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
                    className={styles.numberInput}
                    aria-label="Timeline exact year"
                />
                {typeof timeRange === "number" && onTimeRangeChange ? (
                    <label
                        title="time_range (0-30)"
                        className={`${styles.rangeLabel} ${effectiveDisabled ? styles.disabled : ""}`}
                    >
                        <span>Range</span>
                        <input
                            type="number"
                            min={0}
                            max={30}
                            step={1}
                            value={Math.max(0, Math.min(30, Math.trunc(timeRange)))}
                            onChange={(event) => handleTimeRangeChange(Number(event.target.value))}
                            disabled={effectiveDisabled}
                            className={styles.rangeInput}
                            aria-label="Timeline range"
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

