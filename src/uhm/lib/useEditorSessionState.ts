import { useState } from "react";
import type { FeatureCollection } from "@/uhm/types/geo";
import { useBackgroundSessionState } from "@/uhm/lib/editor/session/useBackgroundSessionState";
import { useEntitySessionState } from "@/uhm/lib/editor/session/useEntitySessionState";
import { useSectionSessionState } from "@/uhm/lib/editor/session/useSectionSessionState";
import { useTimelineState } from "@/uhm/lib/editor/session/useTimelineState";
import type { EditorMode, TimelineRange } from "@/uhm/lib/editor/session/sessionTypes";

export type {
    CreatedEntitySummary,
    EditorMode,
    EntityFormState,
    GeometryMetaFormState,
    PendingEntityCreate,
    TimelineRange,
} from "@/uhm/lib/editor/session/sessionTypes";

type Options = {
    emptyFeatureCollection: FeatureCollection;
    defaultEditorUserId: string;
    fallbackTimelineRange: TimelineRange;
    currentYear: number;
};

export function useEditorSessionState(options: Options) {
    // Mode thao tác map/editor hiện tại.
    const [mode, setMode] = useState<EditorMode>("idle");
    // FeatureCollection "gốc" của session hiện tại (global timeline hoặc section snapshot).
    const [initialData, setInitialData] = useState<FeatureCollection>(options.emptyFeatureCollection);

    const section = useSectionSessionState({
        defaultEditorUserId: options.defaultEditorUserId,
    });
    const entity = useEntitySessionState();
    const timeline = useTimelineState({
        currentYear: options.currentYear,
        fallbackTimelineRange: options.fallbackTimelineRange,
    });
    const background = useBackgroundSessionState();

    return {
        mode,
        setMode,
        initialData,
        setInitialData,
        ...section,
        ...entity,
        ...timeline,
        ...background,
    };
}
