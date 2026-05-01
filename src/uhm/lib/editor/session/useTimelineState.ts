import { useState } from "react";
import type { TimelineRange } from "@/uhm/lib/editor/session/sessionTypes";
import { clampYearValue } from "@/uhm/lib/timeline";

type Options = {
    currentYear: number;
    fallbackTimelineRange: TimelineRange;
};

export function useTimelineState(options: Options) {
    // Năm timeline "đã chốt" để fetch dữ liệu.
    const [timelineYear, setTimelineYear] = useState<number>(() =>
        clampYearValue(
            options.currentYear,
            options.fallbackTimelineRange.min,
            options.fallbackTimelineRange.max
        )
    );
    // Năm timeline đang chỉnh (debounce rồi đẩy sang timelineYear).
    const [timelineDraftYear, setTimelineDraftYear] = useState<number>(() =>
        clampYearValue(
            options.currentYear,
            options.fallbackTimelineRange.min,
            options.fallbackTimelineRange.max
        )
    );
    // Cờ loading khi fetch theo timeline.
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    // Thông báo trạng thái/lỗi khi fetch theo timeline.
    const [timelineStatus, setTimelineStatus] = useState<string | null>(null);

    return {
        timelineYear,
        setTimelineYear,
        timelineDraftYear,
        setTimelineDraftYear,
        isTimelineLoading,
        setIsTimelineLoading,
        timelineStatus,
        setTimelineStatus,
    };
}
