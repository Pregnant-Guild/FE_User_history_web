import { useCallback, useState } from "react";
import type { UndoAction } from "@/uhm/lib/editor/draft/editorTypes";
import { geometryEquals } from "@/uhm/lib/editor/draft/draftDiff";

type Options = {
    applyUndoAction: (action: UndoAction) => boolean;
};

export function useUndoStack(options: Options) {
    const { applyUndoAction } = options;
    // Stack thao tác undo (append-only, pop khi undo).
    const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

    const pushUndo = useCallback((action: UndoAction) => {
        setUndoStack((prev) => {
            const last = prev[prev.length - 1];
            if (isSameUndo(last, action)) return prev;
            return [...prev, action];
        });
    }, []);

    const undo = useCallback(() => {
        let applied = false;
        setUndoStack((prev) => {
            if (applied) return prev;
            if (!prev.length) return prev;

            const last = prev[prev.length - 1];
            const remaining = prev.slice(0, -1);
            applied = true;

            const didApply = applyUndoAction(last);
            return didApply ? remaining : prev;
        });
    }, [applyUndoAction]);

    const clearUndo = useCallback(() => {
        setUndoStack([]);
    }, []);

    return {
        undoStack,
        pushUndo,
        undo,
        clearUndo,
    };
}

function isSameUndo(a: UndoAction | undefined, b: UndoAction) {
    if (!a) return false;
    if (a.type !== b.type) return false;
    switch (a.type) {
        case "create": {
            const next = b as Extract<UndoAction, { type: "create" }>;
            return a.id === next.id;
        }
        case "delete": {
            const next = b as Extract<UndoAction, { type: "delete" }>;
            return (
                a.feature.properties.id === next.feature.properties.id &&
                geometryEquals(a.feature.geometry, next.feature.geometry)
            );
        }
        case "update": {
            const next = b as Extract<UndoAction, { type: "update" }>;
            return (
                a.id === next.id &&
                geometryEquals(a.prevGeometry, next.prevGeometry)
            );
        }
        case "properties": {
            const next = b as Extract<UndoAction, { type: "properties" }>;
            return (
                a.id === next.id &&
                JSON.stringify(a.prevProperties) === JSON.stringify(next.prevProperties)
            );
        }
        default:
            return false;
    }
}
