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

    const [localYear, setLocalYear] = useState<number | null>(null);
    const displayYear = localYear ?? safeYear;
    const localYearRef = useRef(displayYear);
    const onYearChangeRef = useRef(onYearChange);

    useEffect(() => {
        localYearRef.current = displayYear;
    }, [displayYear]);

    useEffect(() => {
        onYearChangeRef.current = onYearChange;
    }, [onYearChange]);

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
        localYearRef.current = clamped;
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

    const handleDragYearChange = useCallback((nextVal: number) => {
        const clamped = clampYearValue(Math.trunc(nextVal), lower, upper);
        localYearRef.current = clamped;
        setLocalYear(clamped);
    }, [lower, upper]);

    const finishLocalYearChange = useCallback(() => {
        commitYearChange(localYearRef.current);
        setLocalYear(null);
    }, [commitYearChange]);

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
        finishLocalYearChange();
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
                <CanvasTimelineRuler
                    year={displayYear}
                    onYearChange={handleDragYearChange}
                    onYearCommit={finishLocalYearChange}
                    minYear={lower}
                    maxYear={upper}
                    disabled={effectiveDisabled}
                />
                <div className={styles.numberWrapper}>
                    <input
                        type="number"
                        min={lower}
                        max={upper}
                        step={1}
                        value={displayYear}
                        onChange={(event) => handleLocalYearChange(Number(event.target.value))}
                        onBlur={finishLocalYearChange}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                finishLocalYearChange();
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

interface CanvasRulerProps {
    year: number;
    onYearChange: (year: number) => void;
    onYearCommit: () => void;
    minYear: number;
    maxYear: number;
    disabled?: boolean;
}

function CanvasTimelineRuler({
    year,
    onYearChange,
    onYearCommit,
    minYear,
    maxYear,
    disabled = false,
}: CanvasRulerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Visible span (in years)
    const [span, setSpan] = useState(400); // default show 400 years

    // Dimensions
    const [dimensions, setDimensions] = useState({ width: 0, height: 48 });

    // Dragging state
    const dragRef = useRef<{
        isDragging: boolean;
        startX: number;
        startYear: number;
        hasDragged: boolean;
    } | null>(null);

    // Sync dimensions using ResizeObserver
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            if (!entries || !entries[0]) return;
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height: height || 48 });
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // Draw the ruler on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dimensions.width === 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Support High DPI / Retina screens
        const dpr = window.devicePixelRatio || 1;
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;
        ctx.scale(dpr, dpr);

        const width = dimensions.width;
        const height = dimensions.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Center year is the selected year
        const centerYear = year;
        const startYear = centerYear - span / 2;
        const endYear = centerYear + span / 2;

        const yearToX = (y: number) => {
            return ((y - startYear) / span) * width;
        };

        // Determine tick step based on span
        let majorStep = 100;
        let mediumStep = 10;
        let minorStep = 1;

        if (span > 3000) {
            majorStep = 1000;
            mediumStep = 100;
            minorStep = 10;
        } else if (span > 1500) {
            majorStep = 500;
            mediumStep = 50;
            minorStep = 10;
        } else if (span > 600) {
            majorStep = 100;
            mediumStep = 20;
            minorStep = 5;
        } else if (span > 200) {
            majorStep = 100;
            mediumStep = 10;
            minorStep = 1;
        } else if (span > 60) {
            majorStep = 50;
            mediumStep = 10;
            minorStep = 1;
        } else {
            majorStep = 10;
            mediumStep = 5;
            minorStep = 1;
        }

        // Ticks drawing bounds
        const firstMajor = Math.floor(startYear / majorStep) * majorStep;
        const lastMajor = Math.ceil(endYear / majorStep) * majorStep;

        const pixelsPerYear = width / span;
        const showMinor = pixelsPerYear * minorStep >= 3;
        const showMedium = pixelsPerYear * mediumStep >= 5;

        // Draw ruler track baseline
        ctx.beginPath();
        ctx.moveTo(0, height - 8);
        ctx.lineTo(width, height - 8);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // 1. Draw minor & medium ticks
        ctx.beginPath();
        for (let y = Math.floor(startYear); y <= Math.ceil(endYear); y++) {
            if (y < minYear || y > maxYear) continue;

            const isMajor = y % majorStep === 0;
            const isMedium = y % mediumStep === 0;
            const isMinor = y % minorStep === 0;

            if (isMajor) continue;

            let tickHeight = 0;
            if (isMedium && showMedium) {
                tickHeight = 7;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            } else if (isMinor && showMinor) {
                tickHeight = 4;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            }

            if (tickHeight > 0) {
                const x = yearToX(y);
                ctx.moveTo(x, height - 8);
                ctx.lineTo(x, height - 8 - tickHeight);
            }
        }
        ctx.lineWidth = 1;
        ctx.stroke();

        // 2. Draw major ticks and labels
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.font = "600 10px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        for (let y = firstMajor; y <= lastMajor; y += majorStep) {
            if (y < minYear || y > maxYear) continue;

            const x = yearToX(y);

            // Draw tick line
            ctx.beginPath();
            ctx.moveTo(x, height - 8);
            ctx.lineTo(x, height - 20);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
            ctx.lineWidth = 1.25;
            ctx.stroke();

            // Draw label
            const label = formatYear(y);
            ctx.fillText(label, x, height - 33);
        }

        // 3. Draw needle indicator in the center
        const needleX = width / 2;
        ctx.beginPath();
        ctx.moveTo(needleX, 0);
        ctx.lineTo(needleX, height - 4);
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(16, 185, 129, 0.6)";
        ctx.shadowBlur = 6;
        ctx.stroke();

        // Draw needle head triangle
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.moveTo(needleX - 5, 0);
        ctx.lineTo(needleX + 5, 0);
        ctx.lineTo(needleX, 6);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
    }, [year, span, dimensions, minYear, maxYear]);

    const handleWheel = (e: React.WheelEvent) => {
        if (disabled) return;
        e.preventDefault();

        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
        const nextSpan = Math.max(10, Math.min(10000, span * zoomFactor));
        setSpan(Math.round(nextSpan));
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        e.preventDefault();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}

        dragRef.current = {
            isDragging: true,
            startX: e.clientX,
            startYear: year,
            hasDragged: false,
        };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dragRef.current || !dragRef.current.isDragging) return;
        e.preventDefault();

        const dx = e.clientX - dragRef.current.startX;
        if (Math.abs(dx) > 3) {
            dragRef.current.hasDragged = true;
        }

        const yearsPerPixel = span / dimensions.width;
        const deltaYears = -dx * yearsPerPixel;
        const nextYear = clampYearValue(Math.round(dragRef.current.startYear + deltaYears), minYear, maxYear);

        onYearChange(nextYear);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dragRef.current) return;
        e.preventDefault();
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}

        const dragInfo = dragRef.current;
        dragRef.current = null;

        if (!dragInfo.hasDragged) {
            // Click to jump
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const clickedX = e.clientX - rect.left;
                const centerYear = year;
                const startYear = centerYear - span / 2;
                const clickedYear = clampYearValue(
                    Math.round(startYear + (clickedX / rect.width) * span),
                    minYear,
                    maxYear
                );
                onYearChange(clickedYear);
            }
        }
        onYearCommit();
    };

    return (
        <div
            ref={containerRef}
            style={{
                flex: 1,
                height: 44,
                position: "relative",
                background: "rgba(255, 255, 255, 0.04)",
                borderRadius: 22,
                border: "1px solid rgba(255, 255, 255, 0.08)",
                overflow: "hidden",
                cursor: disabled ? "not-allowed" : "ew-resize",
            }}
            onWheel={handleWheel}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            />
        </div>
    );
}
