import { normalizeTimelineYearValue } from "@/uhm/lib/utils/timeline";

export function formatEntityHoverTitle(
    name: string,
    timeStart: unknown,
    timeEnd: unknown
): string {
    const range = formatEntityTimeRange(timeStart, timeEnd);
    return range ? `${name} (${range})` : name;
}

export function formatEntityTimeRange(timeStart: unknown, timeEnd: unknown): string {
    const start = normalizeTimelineYearValue(timeStart);
    const end = normalizeTimelineYearValue(timeEnd);
    if (start == null && end == null) return "";
    if (start != null && end != null && start === end) return formatTimelineYear(start);
    return `${start == null ? "?" : formatTimelineYear(start)}-${end == null ? "?" : formatTimelineYear(end)}`;
}

export function isTimelineYearWithinEntityTimeRange(
    timelineYear: unknown,
    timeStart: unknown,
    timeEnd: unknown
): boolean {
    const year = normalizeTimelineYearValue(timelineYear);
    const start = normalizeTimelineYearValue(timeStart);
    const end = normalizeTimelineYearValue(timeEnd);
    if (year == null || (start == null && end == null)) return false;
    if (start != null && year < start) return false;
    if (end != null && year > end) return false;
    return true;
}

function formatTimelineYear(year: number): string {
    if (year < 0) return `${Math.abs(year)} TCN`;
    return String(year);
}
