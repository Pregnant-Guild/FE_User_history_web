import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
    Feature,
    FeatureCollection,
    FeatureProperties,
    Geometry,
} from "@/uhm/types/geo";
import { buildInitialMap, deepClone, diffDraftToInitial } from "@/uhm/lib/editor/draft/draftDiff";
import { useDraftState } from "@/uhm/lib/editor/draft/useDraftState";
import { useUndoStack } from "@/uhm/lib/editor/draft/useUndoStack";
import type { Change, UndoAction } from "@/uhm/lib/editor/draft/editorTypes";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/sections";

export type { Feature, FeatureCollection, FeatureProperties, Geometry } from "@/uhm/types/geo";
export type { Change, UndoAction } from "@/uhm/lib/editor/draft/editorTypes";

type SnapshotUndoApi = {
    snapshotEntitiesRef: { current: EntitySnapshot[] };
    setSnapshotEntities: Dispatch<SetStateAction<EntitySnapshot[]>>;
    snapshotWikisRef: { current: WikiSnapshot[] };
    setSnapshotWikis: Dispatch<SetStateAction<WikiSnapshot[]>>;
    snapshotEntityWikiLinksRef: { current: EntityWikiLinkSnapshot[] };
    setSnapshotEntityWikiLinks: Dispatch<SetStateAction<EntityWikiLinkSnapshot[]>>;
};

// State trung tâm của editor:
// - draft: dữ liệu nguồn để render UI
// - changes: map các thay đổi chờ lưu
// - undoStack: lịch sử thao tác tối thiểu để hoàn tác
export function useEditorState(initialData: FeatureCollection, snapshotUndo?: SnapshotUndoApi) {
    const { draft, draftRef, commitDraft, resetDraft } = useDraftState(initialData);

    // Map baseline (id -> feature) để diff draft hiện tại ra changes.
    const initialMapRef = useRef<Map<FeatureProperties["id"], Feature>>(
        buildInitialMap(initialData)
    );
    // Version counter để ép diff recalculation sau khi reset/clear baseline.
    const [baselineVersion, setBaselineVersion] = useState(0);

    const applyUndoAction = useCallback((action: UndoAction): boolean => {
        switch (action.type) {
            case "create": {
                commitDraft({
                    ...draftRef.current,
                    features: draftRef.current.features.filter((feature) =>
                        feature.properties.id !== action.id
                    ),
                });
                return true;
            }
            case "delete": {
                const feature = deepClone(action.feature);
                commitDraft({
                    ...draftRef.current,
                    features: [...draftRef.current.features, feature],
                });
                return true;
            }
            case "update": {
                const idx = draftRef.current.features.findIndex((feature) =>
                    feature.properties.id === action.id
                );
                if (idx === -1) return false;
                const nextFeatures = [...draftRef.current.features];
                nextFeatures[idx] = {
                    ...nextFeatures[idx],
                    geometry: deepClone(action.prevGeometry),
                };
                commitDraft({ ...draftRef.current, features: nextFeatures });
                return true;
            }
            case "properties": {
                const idx = draftRef.current.features.findIndex((feature) =>
                    feature.properties.id === action.id
                );
                if (idx === -1) return false;
                const nextFeatures = [...draftRef.current.features];
                nextFeatures[idx] = {
                    ...nextFeatures[idx],
                    properties: deepClone(action.prevProperties),
                };
                commitDraft({ ...draftRef.current, features: nextFeatures });
                return true;
            }
            case "snapshot_entities": {
                if (!snapshotUndo) return false;
                snapshotUndo.setSnapshotEntities(deepClone(action.prev));
                return true;
            }
            case "snapshot_wikis": {
                if (!snapshotUndo) return false;
                snapshotUndo.setSnapshotWikis(deepClone(action.prev));
                return true;
            }
            case "snapshot_entity_wiki": {
                if (!snapshotUndo) return false;
                snapshotUndo.setSnapshotEntityWikiLinks(deepClone(action.prev));
                return true;
            }
            default:
                return false;
        }
    }, [commitDraft, draftRef, snapshotUndo]);

    const { undoStack, pushUndo, undo, clearUndo } = useUndoStack({ applyUndoAction });

    useEffect(() => {
        resetDraft(deepClone(initialData));
        clearUndo();
        initialMapRef.current = buildInitialMap(initialData);
        setBaselineVersion((version) => version + 1);
    }, [clearUndo, initialData, resetDraft]);

    const changes = useMemo(() => {
        const baseline = initialMapRef.current;
        return diffDraftToInitial(draft, baseline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, baselineVersion]);
    const changeCount = useMemo(() => changes.size, [changes]);

    function createFeature(feature: Feature) {
        const featureClone = deepClone(feature);
        commitDraft({
            ...draftRef.current,
            features: [...draftRef.current.features, featureClone],
        });
        pushUndo({ type: "create", id: featureClone.properties.id });
    }

    function patchFeatureProperties(
        id: FeatureProperties["id"],
        patch: Partial<FeatureProperties>
    ) {
        const idx = draftRef.current.features.findIndex((feature) => feature.properties.id === id);
        if (idx === -1) return;

        const nextFeatures = [...draftRef.current.features];
        const prevProperties = deepClone(nextFeatures[idx].properties);
        nextFeatures[idx] = {
            ...nextFeatures[idx],
            properties: {
                ...nextFeatures[idx].properties,
                ...deepClone(patch),
            },
        };

        if (JSON.stringify(prevProperties) === JSON.stringify(nextFeatures[idx].properties)) {
            return;
        }

        pushUndo({ type: "properties", id, prevProperties });
        commitDraft({ ...draftRef.current, features: nextFeatures });
    }

    function updateFeature(id: FeatureProperties["id"], newGeometry: Geometry) {
        const idx = draftRef.current.features.findIndex((feature) => feature.properties.id === id);
        if (idx === -1) return;

        const prevFeature = draftRef.current.features[idx];
        const prevGeometry = deepClone(prevFeature.geometry);
        const nextFeatures = [...draftRef.current.features];
        nextFeatures[idx] = {
            ...prevFeature,
            geometry: deepClone(newGeometry),
        };

        pushUndo({ type: "update", id, prevGeometry });
        commitDraft({ ...draftRef.current, features: nextFeatures });
    }

    function deleteFeature(id: FeatureProperties["id"]) {
        const idx = draftRef.current.features.findIndex((feature) => feature.properties.id === id);
        if (idx === -1) return;

        const feature = draftRef.current.features[idx];
        const nextFeatures = [...draftRef.current.features];
        nextFeatures.splice(idx, 1);

        pushUndo({ type: "delete", feature: deepClone(feature) });
        commitDraft({ ...draftRef.current, features: nextFeatures });
    }

    function buildPayload(): Change[] {
        return Array.from(changes.values()).map((change) => deepClone(change));
    }

    function clearChanges() {
        clearUndo();
        initialMapRef.current = buildInitialMap(draftRef.current);
        setBaselineVersion((version) => version + 1);
    }

    function hasPersistedFeature(id: FeatureProperties["id"]) {
        return initialMapRef.current.has(id);
    }

    const setSnapshotEntitiesUndoable = useCallback((
        next: SetStateAction<EntitySnapshot[]>,
        label = "Cập nhật entities"
    ) => {
        if (!snapshotUndo) return;
        snapshotUndo.setSnapshotEntities((prev) => {
            const prevClone = deepClone(prev);
            const computed = typeof next === "function" ? (next as (p: EntitySnapshot[]) => EntitySnapshot[])(prev) : next;
            let changed = true;
            try {
                changed = JSON.stringify(prev) !== JSON.stringify(computed);
            } catch {
                changed = true;
            }
            if (changed) {
                pushUndo({ type: "snapshot_entities", label, prev: prevClone });
            }
            return computed;
        });
    }, [pushUndo, snapshotUndo]);

    const setSnapshotWikisUndoable = useCallback((
        next: SetStateAction<WikiSnapshot[]>,
        label = "Cập nhật wikis"
    ) => {
        if (!snapshotUndo) return;
        snapshotUndo.setSnapshotWikis((prev) => {
            const prevClone = deepClone(prev);
            const computed = typeof next === "function" ? (next as (p: WikiSnapshot[]) => WikiSnapshot[])(prev) : next;
            let changed = true;
            try {
                changed = JSON.stringify(prev) !== JSON.stringify(computed);
            } catch {
                changed = true;
            }
            if (changed) {
                pushUndo({ type: "snapshot_wikis", label, prev: prevClone });
            }
            return computed;
        });
    }, [pushUndo, snapshotUndo]);

    const setSnapshotEntityWikiLinksUndoable = useCallback((
        next: SetStateAction<EntityWikiLinkSnapshot[]>,
        label = "Cập nhật entity-wiki"
    ) => {
        if (!snapshotUndo) return;
        snapshotUndo.setSnapshotEntityWikiLinks((prev) => {
            const prevClone = deepClone(prev);
            const computed = typeof next === "function"
                ? (next as (p: EntityWikiLinkSnapshot[]) => EntityWikiLinkSnapshot[])(prev)
                : next;
            let changed = true;
            try {
                changed = JSON.stringify(prev) !== JSON.stringify(computed);
            } catch {
                changed = true;
            }
            if (changed) {
                pushUndo({ type: "snapshot_entity_wiki", label, prev: prevClone });
            }
            return computed;
        });
    }, [pushUndo, snapshotUndo]);

    return {
        draft,
        changes,
        undoStack,
        changeCount,
        createFeature,
        patchFeatureProperties,
        updateFeature,
        deleteFeature,
        undo,
        buildPayload,
        clearChanges,
        hasPersistedFeature,
        // Snapshot undo helpers (no-op if snapshotUndo not provided)
        setSnapshotEntities: setSnapshotEntitiesUndoable,
        setSnapshotWikis: setSnapshotWikisUndoable,
        setSnapshotEntityWikiLinks: setSnapshotEntityWikiLinksUndoable,
    };
}
