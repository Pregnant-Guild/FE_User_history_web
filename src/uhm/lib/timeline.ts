import type { TimelineRange } from "@/uhm/lib/editor/session/sessionTypes";

// Single source of truth for the app-wide timeline range.
export const FIXED_TIMELINE_START_YEAR = -2000;
export const FIXED_TIMELINE_END_YEAR = 2000;

export const FIXED_TIMELINE_RANGE: TimelineRange = {
    min: FIXED_TIMELINE_START_YEAR,
    max: FIXED_TIMELINE_END_YEAR,
};

// UI debounce when user drags timeline before triggering data fetch.
export const TIMELINE_DEBOUNCE_MS = 180;

export function clampYearValue(year: number, minYear: number, maxYear: number): number {
    const lower = Math.min(minYear, maxYear);
    const upper = Math.max(minYear, maxYear);
    if (year < lower) return lower;
    if (year > upper) return upper;
    return year;
}

export function clampYearToFixedRange(year: number): number {
    return clampYearValue(year, FIXED_TIMELINE_START_YEAR, FIXED_TIMELINE_END_YEAR);
}
