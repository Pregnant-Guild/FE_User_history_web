import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
    Feature,
    FeatureCollection,
    FeatureProperties,
    Geometry,
} from "@/uhm/types/geo";
import { buildInitialMap, deepClone, diffDraftToInitial, geometryEquals } from "@/uhm/lib/editor/draft/draftDiff";
import { useDraftState } from "@/uhm/lib/editor/draft/useDraftState";
import { useUndoStack } from "@/uhm/lib/editor/draft/useUndoStack";
import type { Change, UndoAction } from "@/uhm/lib/editor/draft/editorTypes";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { BattleReplay, EditorSnapshot, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

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

type FeaturePropertiesPatch = {
    id: FeatureProperties["id"];
    patch: Partial<FeatureProperties>;
};

// State trung tâm của editor:
// - draft: dữ liệu nguồn để render UI (chuyển đổi giữa main và replay)
// - changes: map các thay đổi chờ lưu
// - undoStack: lịch sử thao tác tối thiểu để hoàn tác
export function useEditorState(
    initialData: FeatureCollection,
    options: {
        snapshotUndo?: SnapshotUndoApi;
        initialReplays?: BattleReplay[];
        mode: EditorMode;
    }
) {
    const { snapshotUndo, initialReplays, mode } = options;

    const mainDraftState = useDraftState(initialData);
    const replayDraftState = useDraftState(EMPTY_FEATURE_COLLECTION);

    const [replays, setReplays] = useState<BattleReplay[]>(initialReplays || []);
    const [activeReplayId, setActiveReplayId] = useState<string | number | null>(null);

    const activeDraftState = mode === "replay" ? replayDraftState : mainDraftState;
    const { draft, draftRef, commitDraft, resetDraft } = activeDraftState;

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
                const prev = deepClone(action.prev);
                snapshotUndo.snapshotEntitiesRef.current = prev;
                snapshotUndo.setSnapshotEntities(prev);
                return true;
            }
            case "snapshot_wikis": {
                if (!snapshotUndo) return false;
                const prev = deepClone(action.prev);
                snapshotUndo.snapshotWikisRef.current = prev;
                snapshotUndo.setSnapshotWikis(prev);
                return true;
            }
            case "snapshot_entity_wiki": {
                if (!snapshotUndo) return false;
                const prev = deepClone(action.prev);
                snapshotUndo.snapshotEntityWikiLinksRef.current = prev;
                snapshotUndo.setSnapshotEntityWikiLinks(prev);
                return true;
            }
            case "group": {
                let applied = true;
                for (let i = action.actions.length - 1; i >= 0; i -= 1) {
                    applied = applyUndoAction(action.actions[i]) && applied;
                }
                return applied;
            }
            default:
                return false;
        }
    }, [commitDraft, draftRef, snapshotUndo]);

    const { undoStack, pushUndo, undo, clearUndo } = useUndoStack({ applyUndoAction });

    useEffect(() => {
        mainDraftState.resetDraft(deepClone(initialData));
        replayDraftState.resetDraft(EMPTY_FEATURE_COLLECTION);
        setReplays(initialReplays || []);
        setActiveReplayId(null);
        clearUndo();
        initialMapRef.current = buildInitialMap(initialData);
        setBaselineVersion((version) => version + 1);
    }, [clearUndo, initialData, initialReplays, mainDraftState.resetDraft, replayDraftState.resetDraft]);

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

    function createFeatureWithSnapshotEntities(
        feature: Feature,
        nextEntities: SetStateAction<EntitySnapshot[]>,
        label = "Import geometry"
    ) {
        const featureClone = deepClone(feature);
        const undoActions: UndoAction[] = [];

        if (snapshotUndo) {
            const prevEntities = snapshotUndo.snapshotEntitiesRef.current || [];
            const prevEntitiesClone = deepClone(prevEntities);
            const computedEntities = typeof nextEntities === "function"
                ? (nextEntities as (p: EntitySnapshot[]) => EntitySnapshot[])(prevEntitiesClone)
                : nextEntities;
            let entitiesChanged = true;
            try {
                entitiesChanged = JSON.stringify(prevEntities) !== JSON.stringify(computedEntities);
            } catch {
                entitiesChanged = true;
            }

            if (entitiesChanged) {
                const computedEntitiesClone = deepClone(computedEntities);
                undoActions.push({
                    type: "snapshot_entities",
                    label: "Cập nhật entities",
                    prev: prevEntitiesClone,
                });
                snapshotUndo.snapshotEntitiesRef.current = computedEntitiesClone;
                snapshotUndo.setSnapshotEntities(computedEntitiesClone);
            }
        }

        undoActions.push({ type: "create", id: featureClone.properties.id });
        pushUndo(
            undoActions.length === 1
                ? undoActions[0]
                : { type: "group", label, actions: undoActions }
        );
        commitDraft({
            ...draftRef.current,
            features: [...draftRef.current.features, featureClone],
        });
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

    function patchFeaturePropertiesBatch(
        patches: FeaturePropertiesPatch[],
        label = "Cập nhật nhiều geometry"
    ) {
        const mergedPatches = new Map<FeatureProperties["id"], Partial<FeatureProperties>>();
        for (const item of patches || []) {
            if (!item) continue;
            const prev = mergedPatches.get(item.id) || {};
            mergedPatches.set(item.id, {
                ...prev,
                ...deepClone(item.patch),
            });
        }
        if (!mergedPatches.size) return;

        const nextFeatures = [...draftRef.current.features];
        const undoActions: UndoAction[] = [];

        for (const [id, patch] of mergedPatches.entries()) {
            const idx = nextFeatures.findIndex((feature) => feature.properties.id === id);
            if (idx === -1) continue;

            const prevProperties = deepClone(nextFeatures[idx].properties);
            const nextProperties = {
                ...nextFeatures[idx].properties,
                ...deepClone(patch),
            };
            if (JSON.stringify(prevProperties) === JSON.stringify(nextProperties)) {
                continue;
            }

            nextFeatures[idx] = {
                ...nextFeatures[idx],
                properties: nextProperties,
            };
            undoActions.push({ type: "properties", id, prevProperties });
        }

        if (!undoActions.length) return;

        pushUndo(
            undoActions.length === 1
                ? undoActions[0]
                : { type: "group", label, actions: undoActions }
        );
        commitDraft({ ...draftRef.current, features: nextFeatures });
    }

    function updateFeature(id: FeatureProperties["id"], newGeometry: Geometry) {
        const idx = draftRef.current.features.findIndex((feature) => feature.properties.id === id);
        if (idx === -1) return;

        const prevFeature = draftRef.current.features[idx];
        const prevGeometry = deepClone(prevFeature.geometry);
        if (geometryEquals(prevGeometry, newGeometry)) {
            return;
        }
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
        initialMapRef.current = buildInitialMap(mainDraftState.draftRef.current);
        setBaselineVersion((version) => version + 1);
    }

    function hasPersistedFeature(id: FeatureProperties["id"]) {
        return initialMapRef.current.has(id);
    }

    const switchReplayContext = useCallback((featureId: string | number, selectedIds: (string | number)[] = []) => {
        const id = String(featureId);
        // Lưu draft replay cũ nếu có (defensive)
        if (activeReplayId && mode === "replay") {
            const currentDraft = replayDraftState.draftRef.current;
            setReplays(prev => prev.map(r =>
                r.geometry_id === String(activeReplayId)
                    ? { ...r, replay_features: deepClone(currentDraft) }
                    : r
            ));
        }

        const existing = replays.find(r => r.geometry_id === id);

        // Chuẩn bị data: bao gồm tất cả các geo đang chọn + binding của geo chính
        const selectedIdsSet = new Set(selectedIds.map(String));
        selectedIdsSet.add(id); // Luôn bao gồm geo chính

        const triggerFeature = mainDraftState.draftRef.current.features.find(f => String(f.properties.id) === id);
        const mainBoundIds = new Set(triggerFeature?.properties?.binding?.map(String) || []);
        
        // Quy tắc: targetIds bao gồm các geo được chọn và binding CHỈ của geo chính.
        const targetIds = new Set([...selectedIdsSet, ...mainBoundIds]);

        const gatheredFeatures = mainDraftState.draftRef.current.features
            .filter(f => targetIds.has(String(f.properties.id)))
            .map(deepClone);

        if (existing) {
            // Đồng bộ lại danh sách geometry theo lựa chọn mới nhất (Sync với Main Draft)
            // Giúp "reset" danh sách geo theo multi-select và binding mới nhất, 
            // nhưng vẫn giữ nguyên phần kịch bản (detail) đã dựng.
            const nextFeatures: FeatureCollection = {
                type: "FeatureCollection",
                features: gatheredFeatures,
            };
            
            replayDraftState.resetDraft(deepClone(nextFeatures));
            // Cập nhật lại list replays để đồng bộ
            setReplays(prev => prev.map(r => 
                r.geometry_id === id ? { ...r, replay_features: nextFeatures } : r
            ));
        } else {
            const initialFeatures: FeatureCollection = {
                type: "FeatureCollection",
                features: gatheredFeatures,
            };
            const newReplay: BattleReplay = {
                geometry_id: id,
                detail: [],
                replay_features: initialFeatures,
            };
            setReplays(prev => [...prev, newReplay]);
            replayDraftState.resetDraft(deepClone(initialFeatures));
        }
        setActiveReplayId(id);
    }, [activeReplayId, mode, replayDraftState, replays, mainDraftState.draftRef]);

    const closeReplayContext = useCallback(() => {
        if (activeReplayId) {
            const currentDraft = replayDraftState.draftRef.current;
            setReplays(prev => prev.map(r =>
                r.geometry_id === String(activeReplayId)
                    ? { ...r, replay_features: deepClone(currentDraft) }
                    : r
            ));
        }
        setActiveReplayId(null);
        replayDraftState.resetDraft(EMPTY_FEATURE_COLLECTION);
    }, [activeReplayId, replayDraftState]);

    const setSnapshotEntitiesUndoable = useCallback((
        next: SetStateAction<EntitySnapshot[]>,
        label = "Cập nhật entities"
    ) => {
        if (!snapshotUndo) return;
        const prev = snapshotUndo.snapshotEntitiesRef.current || [];
        const prevClone = deepClone(prev);
        const computed = typeof next === "function" ? (next as (p: EntitySnapshot[]) => EntitySnapshot[])(prevClone) : next;
        let changed = true;
        try {
            changed = JSON.stringify(prev) !== JSON.stringify(computed);
        } catch {
            changed = true;
        }
        if (!changed) return;

        const computedClone = deepClone(computed);
        pushUndo({ type: "snapshot_entities", label, prev: prevClone });
        snapshotUndo.snapshotEntitiesRef.current = computedClone;
        snapshotUndo.setSnapshotEntities(computedClone);
    }, [pushUndo, snapshotUndo]);

    const setSnapshotWikisUndoable = useCallback((
        next: SetStateAction<WikiSnapshot[]>,
        label = "Cập nhật wikis"
    ) => {
        if (!snapshotUndo) return;
        const prev = snapshotUndo.snapshotWikisRef.current || [];
        const prevClone = deepClone(prev);
        const computed = typeof next === "function" ? (next as (p: WikiSnapshot[]) => WikiSnapshot[])(prevClone) : next;
        let changed = true;
        try {
            changed = JSON.stringify(prev) !== JSON.stringify(computed);
        } catch {
            changed = true;
        }
        if (!changed) return;

        const computedClone = deepClone(computed);
        pushUndo({ type: "snapshot_wikis", label, prev: prevClone });
        snapshotUndo.snapshotWikisRef.current = computedClone;
        snapshotUndo.setSnapshotWikis(computedClone);
    }, [pushUndo, snapshotUndo]);

    const setSnapshotEntityWikiLinksUndoable = useCallback((
        next: SetStateAction<EntityWikiLinkSnapshot[]>,
        label = "Cập nhật entity-wiki"
    ) => {
        if (!snapshotUndo) return;
        const prev = snapshotUndo.snapshotEntityWikiLinksRef.current || [];
        const prevClone = deepClone(prev);
        const computed = typeof next === "function"
            ? (next as (p: EntityWikiLinkSnapshot[]) => EntityWikiLinkSnapshot[])(prevClone)
            : next;
        let changed = true;
        try {
            changed = JSON.stringify(prev) !== JSON.stringify(computed);
        } catch {
            changed = true;
        }
        if (!changed) return;

        const computedClone = deepClone(computed);
        pushUndo({ type: "snapshot_entity_wiki", label, prev: prevClone });
        snapshotUndo.snapshotEntityWikiLinksRef.current = computedClone;
        snapshotUndo.setSnapshotEntityWikiLinks(computedClone);
    }, [pushUndo, snapshotUndo]);

    return {
        draft,
        draftRef,
        mainDraft: mainDraftState.draft,
        replayDraft: replayDraftState.draft,
        replays,
        setReplays,
        activeReplayId,
        switchReplayContext,
        closeReplayContext,
        changes,
        undoStack,
        changeCount,
        createFeature,
        createFeatureWithSnapshotEntities,
        patchFeatureProperties,
        patchFeaturePropertiesBatch,
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
