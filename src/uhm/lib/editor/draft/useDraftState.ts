import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "@/uhm/types/geo";
import { deepClone } from "@/uhm/lib/editor/draft/draftDiff";

export function useDraftState(initialData: FeatureCollection) {
    // Draft hiện tại (React state) để UI re-render khi dữ liệu thay đổi.
    const [draft, setDraft] = useState<FeatureCollection>(() => deepClone(initialData));
    // Draft ref để đọc giá trị mới nhất trong event handlers/engines mà không cần deps.
    const draftRef = useRef<FeatureCollection>(deepClone(initialData));

    const commitDraft = useCallback((nextDraft: FeatureCollection) => {
        const cloned = deepClone(nextDraft);
        draftRef.current = cloned;
        setDraft(cloned);
    }, []);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    const resetDraft = useCallback((nextDraft: FeatureCollection) => {
        commitDraft(nextDraft);
    }, [commitDraft]);

    return {
        draft,
        draftRef,
        commitDraft,
        resetDraft,
    };
}
