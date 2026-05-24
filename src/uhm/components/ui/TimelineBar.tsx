"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

    const [localYear, setLocalYear] = useState(safeYear);

    // Đồng bộ prop year với localYear khi prop year thay đổi từ bên ngoài
    useEffect(() => {
        setLocalYear(safeYear);
    }, [safeYear]);

    const localYearRef = useRef(localYear);
    localYearRef.current = localYear;

    const onYearChangeRef = useRef(onYearChange);
    onYearChangeRef.current = onYearChange;

    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastTriggeredYearRef = useRef<number | null>(null);
    const lastTriggerTimeRef = useRef<number>(0);

    const commitYearChange = useCallback((nextVal: number) => {
        if (nextVal === lastTriggeredYearRef.current) return;
        lastTriggeredYearRef.current = nextVal;
        lastTriggerTimeRef.current = Date.now();
        onYearChangeRef.current(nextVal);
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    const handleLocalYearChange = useCallback((nextVal: number) => {
        const clamped = clampYearValue(Math.trunc(nextVal), lower, upper);
        setLocalYear(clamped);

        const now = Date.now();
        if (now - lastTriggerTimeRef.current >= 1000) {
            commitYearChange(clamped);
        } else {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
                commitYearChange(clamped);
            }, 1000);
        }
    }, [lower, upper, commitYearChange]);

    const startChangingYear = (direction: number) => {
        if (effectiveDisabled) return;
        const nextVal = localYearRef.current + direction;
        handleLocalYearChange(nextVal);

        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                const currentVal = localYearRef.current;
                const targetVal = currentVal + direction;
                if (targetVal < lower || targetVal > upper) {
                    stopChangingYear();
                    return;
                }
                handleLocalYearChange(targetVal);
            }, 80);
        }, 400);
    };

    const stopChangingYear = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        commitYearChange(localYearRef.current);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    const helperText = isLoading
        ? "Đang tải geometry theo mốc thời gian..."
        : statusText || null;

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
                    <button
                        type="button"
                        role="switch"
                        aria-checked={filterEnabled}
                        aria-label="Toggle timeline filter"
                        title={filterEnabled ? "Dang bat loc timeline" : "Dang tat loc timeline (hien thi tat ca geometry)"}
                        className={`${styles.toggleContainer} ${effectiveDisabled ? styles.disabled : ""}`}
                        onClick={() => onFilterEnabledChange(!filterEnabled)}
                        disabled={effectiveDisabled}
                    >
                        <span
                            aria-hidden="true"
                            className={`${styles.toggleTrack} ${filterEnabled ? styles.toggleTrackActive : ""}`}
                        >
                            <span
                                className={`${styles.toggleThumb} ${filterEnabled ? styles.toggleThumbActive : ""}`}
                            />
                        </span>
                    </button>
                ) : null}
                <span className={styles.labelBounds}>{formatYear(lower)}</span>
                <input
                    type="range"
                    min={lower}
                    max={upper}
                    step={1}
                    value={localYear}
                    onChange={(event) => handleLocalYearChange(Number(event.target.value))}
                    onMouseUp={() => commitYearChange(localYearRef.current)}
                    onTouchEnd={() => commitYearChange(localYearRef.current)}
                    disabled={effectiveDisabled}
                    className={styles.slider}
                    aria-label="Timeline year"
                />
                <span className={styles.labelBoundsRight}>
                    {formatYear(upper)}
                </span>
                <div className={styles.numberWrapper}>
                    <input
                        type="number"
                        min={lower}
                        max={upper}
                        step={1}
                        value={localYear}
                        onChange={(event) => handleLocalYearChange(Number(event.target.value))}
                        onBlur={() => commitYearChange(localYearRef.current)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                commitYearChange(localYearRef.current);
                            }
                        }}
                        disabled={effectiveDisabled}
                        className={styles.numberInput}
                        aria-label="Timeline exact year"
                    />
                    <div className={styles.adjustGroup}>
                        <button
                            type="button"
                            onMouseDown={() => startChangingYear(-1)}
                            onMouseUp={stopChangingYear}
                            onMouseLeave={stopChangingYear}
                            onTouchStart={() => startChangingYear(-1)}
                            onTouchEnd={stopChangingYear}
                            disabled={effectiveDisabled}
                            className={styles.adjustBtn}
                            title="Giảm 1 năm"
                            aria-label="Giảm 1 năm"
                        >
                            -
                        </button>
                        <button
                            type="button"
                            onMouseDown={() => startChangingYear(1)}
                            onMouseUp={stopChangingYear}
                            onMouseLeave={stopChangingYear}
                            onTouchStart={() => startChangingYear(1)}
                            onTouchEnd={stopChangingYear}
                            disabled={effectiveDisabled}
                            className={styles.adjustBtn}
                            title="Tăng 1 năm"
                            aria-label="Tăng 1 năm"
                        >
                            +
                        </button>
                    </div>
                </div>
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
