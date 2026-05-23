import { useCallback, useRef, useState } from "react";
import type { UndoAction } from "@/uhm/lib/editor/draft/editorTypes";
import { geometryEquals } from "@/uhm/lib/editor/draft/draftDiff";

type Options = {
    applyUndoAction: (action: UndoAction) => boolean;
};

export function useUndoStack(options: Options) {
    const { applyUndoAction } = options;
    // Stack thao tác undo (append-only, pop khi undo).
    const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
    const undoStackRef = useRef<UndoAction[]>([]);

    const pushUndo = useCallback((action: UndoAction) => {
        const prev = undoStackRef.current;
        const last = prev[prev.length - 1];
        if (isSameUndo(last, action)) return;
        const next = [...prev, action];
        undoStackRef.current = next;
        setUndoStack(next);
    }, []);

    const undo = useCallback(() => {
        const current = undoStackRef.current;
        if (!current.length) return;

        const last = current[current.length - 1];
        const didApply = applyUndoAction(last);
        if (!didApply) return;

        const remaining = current.slice(0, -1);
        undoStackRef.current = remaining;
        setUndoStack(remaining);
    }, [applyUndoAction]);

    const clearUndo = useCallback(() => {
        undoStackRef.current = [];
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
        case "snapshot_entities": {
            const next = b as Extract<UndoAction, { type: "snapshot_entities" }>;
            return a.label === next.label && JSON.stringify(a.prev) === JSON.stringify(next.prev);
        }
        case "snapshot_wikis": {
            const next = b as Extract<UndoAction, { type: "snapshot_wikis" }>;
            return a.label === next.label && JSON.stringify(a.prev) === JSON.stringify(next.prev);
        }
        case "snapshot_entity_wiki": {
            const next = b as Extract<UndoAction, { type: "snapshot_entity_wiki" }>;
            return a.label === next.label && JSON.stringify(a.prev) === JSON.stringify(next.prev);
        }
        case "replay": {
            const next = b as Extract<UndoAction, { type: "replay" }>;
            return (
                a.geometryId === next.geometryId
                && a.label === next.label
                && JSON.stringify(a.prevReplay) === JSON.stringify(next.prevReplay)
            );
        }
        case "replays": {
            const next = b as Extract<UndoAction, { type: "replays" }>;
            return a.label === next.label && JSON.stringify(a.prevReplays) === JSON.stringify(next.prevReplays);
        }
        case "replay_session": {
            const next = b as Extract<UndoAction, { type: "replay_session" }>;
            return (
                a.geometryId === next.geometryId
                && a.label === next.label
                && JSON.stringify(a.prevReplay) === JSON.stringify(next.prevReplay)
            );
        }
        case "group": {
            const next = b as Extract<UndoAction, { type: "group" }>;
            return a.label === next.label && JSON.stringify(a.actions) === JSON.stringify(next.actions);
        }
        default:
            return false;
    }
}
