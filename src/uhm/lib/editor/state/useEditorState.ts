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
import type { BattleReplay, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

export type { Feature, FeatureCollection, FeatureProperties, Geometry } from "@/uhm/types/geo";
export type { Change, UndoAction } from "@/uhm/lib/editor/draft/editorTypes";

type SnapshotUndoApi = {
    snapshotEntityRowsRef: { current: EntitySnapshot[] };
    setSnapshotEntityRows: Dispatch<SetStateAction<EntitySnapshot[]>>;
    snapshotWikisRef: { current: WikiSnapshot[] };
    setSnapshotWikis: Dispatch<SetStateAction<WikiSnapshot[]>>;
    snapshotEntityWikiLinksRef: { current: EntityWikiLinkSnapshot[] };
    setSnapshotEntityWikiLinks: Dispatch<SetStateAction<EntityWikiLinkSnapshot[]>>;
};

type FeaturePropertiesPatch = {
    id: FeatureProperties["id"];
    patch: Partial<FeatureProperties>;
};

type DraftRef = { current: FeatureCollection };
type DraftCommit = (next: FeatureCollection) => void;
type ReplayDraftSyncMode = "none" | "reset";

// State trung tâm của editor:
// - main draft: dữ liệu section thông thường
// - active replay draft: bản sao BattleReplay đang chỉnh (script + target ids)
// - replay feature draft: FeatureCollection local được hydrate từ mainDraft + target ids
export function useEditorState(
    baselineFeatureCollection: FeatureCollection,
    options: {
        snapshotUndo?: SnapshotUndoApi;
        initialReplays?: BattleReplay[];
        mode: EditorMode;
    }
) {
    const { snapshotUndo, initialReplays, mode } = options;

    const mainDraftState = useDraftState(baselineFeatureCollection);
    const replayFeatureDraftState = useDraftState(EMPTY_FEATURE_COLLECTION);
    const {
        draft: mainDraft,
        draftRef: mainDraftRef,
        commitDraft: commitMainDraft,
        resetDraft: resetMainDraft,
    } = mainDraftState;
    const {
        draft: replayDraft,
        draftRef: replayDraftRef,
        commitDraft: commitReplayDraft,
        resetDraft: resetReplayDraft,
    } = replayFeatureDraftState;

    const [replays, setReplays] = useState<BattleReplay[]>(initialReplays || []);
    const [activeReplayId, setActiveReplayId] = useState<string | number | null>(null);
    const [activeReplayDraft, setActiveReplayDraft] = useState<BattleReplay | null>(null);

    const replaysRef = useRef<BattleReplay[]>(initialReplays || []);
    const activeReplayDraftRef = useRef<BattleReplay | null>(null);
    const activeReplayOriginRef = useRef<BattleReplay | null>(null);
    const activeReplaySeedRef = useRef<BattleReplay | null>(null);

    const activeDraft = mode === "replay" ? replayDraft : mainDraft;
    const activeDraftRef = mode === "replay" ? replayDraftRef : mainDraftRef;
    const activeCommitDraft = mode === "replay" ? commitReplayDraft : commitMainDraft;

    const updateReplaysState = useCallback((next: SetStateAction<BattleReplay[]>) => {
        const resolved = resolveStateAction(next, replaysRef.current);
        const cloned = deepClone(resolved || []);
        replaysRef.current = cloned;
        setReplays(cloned);
        return cloned;
    }, []);

    const syncReplayFeatureDraft = useCallback((nextReplay: BattleReplay | null) => {
        resetReplayDraft(buildReplayFeatureDraft(mainDraftRef.current, nextReplay));
    }, [mainDraftRef, resetReplayDraft]);

    const setActiveReplayDraftState = useCallback((
        next: SetStateAction<BattleReplay | null>,
        syncMode: ReplayDraftSyncMode = "reset"
    ) => {
        const resolved = resolveStateAction(next, activeReplayDraftRef.current);
        const cloned = resolved ? deepClone(resolved) : null;
        activeReplayDraftRef.current = cloned;
        setActiveReplayDraft(cloned);

        if (syncMode === "reset") {
            syncReplayFeatureDraft(cloned);
        }

        return cloned;
    }, [syncReplayFeatureDraft]);

    useEffect(() => {
        replaysRef.current = replays;
    }, [replays]);

    useEffect(() => {
        activeReplayDraftRef.current = activeReplayDraft;
    }, [activeReplayDraft]);

    // Map baseline (id -> feature) để diff main draft ra changes.
    const initialMapRef = useRef<Map<FeatureProperties["id"], Feature>>(
        buildInitialMap(baselineFeatureCollection)
    );
    // Version counter để ép diff recalculation sau khi reset/clear baseline.
    const [baselineVersion, setBaselineVersion] = useState(0);

    const applyUndoActionToDraft = useCallback((
        action: UndoAction,
        targetDraftRef: DraftRef,
        targetCommitDraft: DraftCommit,
        allowSnapshotUndo: boolean
    ): boolean => {
        switch (action.type) {
            case "create": {
                targetCommitDraft({
                    ...targetDraftRef.current,
                    features: targetDraftRef.current.features.filter((feature) =>
                        !featureIdEquals(feature.properties.id, action.id)
                    ),
                });
                return true;
            }
            case "delete": {
                const feature = deepClone(action.feature);
                const nextFeatures = [...targetDraftRef.current.features];
                const insertAt = typeof action.index === "number" && Number.isFinite(action.index)
                    ? Math.max(0, Math.min(action.index, nextFeatures.length))
                    : nextFeatures.length;
                nextFeatures.splice(insertAt, 0, feature);
                targetCommitDraft({
                    ...targetDraftRef.current,
                    features: nextFeatures,
                });
                return true;
            }
            case "update": {
                const idx = targetDraftRef.current.features.findIndex((feature) =>
                    featureIdEquals(feature.properties.id, action.id)
                );
                if (idx === -1) return false;
                const nextFeatures = [...targetDraftRef.current.features];
                nextFeatures[idx] = {
                    ...nextFeatures[idx],
                    geometry: deepClone(action.prevGeometry),
                };
                targetCommitDraft({ ...targetDraftRef.current, features: nextFeatures });
                return true;
            }
            case "properties": {
                const idx = targetDraftRef.current.features.findIndex((feature) =>
                    featureIdEquals(feature.properties.id, action.id)
                );
                if (idx === -1) return false;
                const nextFeatures = [...targetDraftRef.current.features];
                nextFeatures[idx] = {
                    ...nextFeatures[idx],
                    properties: deepClone(action.prevProperties),
                };
                targetCommitDraft({ ...targetDraftRef.current, features: nextFeatures });
                return true;
            }
            case "snapshot_entities": {
                if (!allowSnapshotUndo || !snapshotUndo) return false;
                const prev = deepClone(action.prev);
                snapshotUndo.snapshotEntityRowsRef.current = prev;
                snapshotUndo.setSnapshotEntityRows(prev);
                return true;
            }
            case "snapshot_wikis": {
                if (!allowSnapshotUndo || !snapshotUndo) return false;
                const prev = deepClone(action.prev);
                snapshotUndo.snapshotWikisRef.current = prev;
                snapshotUndo.setSnapshotWikis(prev);
                return true;
            }
            case "snapshot_entity_wiki": {
                if (!allowSnapshotUndo || !snapshotUndo) return false;
                const prev = deepClone(action.prev);
                snapshotUndo.snapshotEntityWikiLinksRef.current = prev;
                snapshotUndo.setSnapshotEntityWikiLinks(prev);
                return true;
            }
            case "group": {
                let applied = true;
                for (let i = action.actions.length - 1; i >= 0; i -= 1) {
                    applied = applyUndoActionToDraft(
                        action.actions[i],
                        targetDraftRef,
                        targetCommitDraft,
                        allowSnapshotUndo
                    ) && applied;
                }
                return applied;
            }
            case "replay":
            case "replay_session":
            default:
                return false;
        }
    }, [snapshotUndo]);

    const applyMainUndoAction = useCallback((action: UndoAction): boolean => {
        if (action.type === "replay") {
            const restoredReplay = action.prevReplay ? deepClone(action.prevReplay) : null;
            updateReplaysState((prev) =>
                replaceReplayByGeometryId(prev, action.geometryId, restoredReplay)
            );

            if (activeReplayId != null && String(activeReplayId) === action.geometryId) {
                activeReplayOriginRef.current = restoredReplay ? deepClone(restoredReplay) : null;
                activeReplaySeedRef.current = restoredReplay ? deepClone(restoredReplay) : null;
                setActiveReplayDraftState(restoredReplay, "reset");
            }
            return true;
        }

        if (action.type === "replays") {
            const restoredReplays = deepClone(action.prevReplays || []);
            updateReplaysState(restoredReplays);

            if (activeReplayId != null) {
                const activeReplay = restoredReplays.find((replay) => replay.geometry_id === String(activeReplayId)) || null;
                activeReplayOriginRef.current = activeReplay ? deepClone(activeReplay) : null;
                activeReplaySeedRef.current = activeReplay ? deepClone(activeReplay) : null;
                setActiveReplayDraftState(activeReplay, "reset");
            }
            return true;
        }

        return applyUndoActionToDraft(
            action,
            mainDraftRef,
            commitMainDraft,
            true
        );
    }, [
        activeReplayId,
        applyUndoActionToDraft,
        commitMainDraft,
        mainDraftRef,
        setActiveReplayDraftState,
        updateReplaysState,
    ]);

    const applyReplayUndoAction = useCallback((action: UndoAction): boolean => {
        if (action.type !== "replay_session") return false;
        const restoredReplay = action.prevReplay ? deepClone(action.prevReplay) : null;
        if (!restoredReplay) return false;

        setActiveReplayDraftState(restoredReplay, "reset");
        return true;
    }, [setActiveReplayDraftState]);

    const {
        undoStack: mainUndoStack,
        pushUndo: pushMainUndo,
        undo: undoMain,
        clearUndo: clearMainUndo,
    } = useUndoStack({ applyUndoAction: applyMainUndoAction });
    const {
        undoStack: replayUndoStack,
        pushUndo: pushReplayUndo,
        undo: undoReplay,
        clearUndo: clearReplayUndo,
    } = useUndoStack({ applyUndoAction: applyReplayUndoAction });

    useEffect(() => {
        resetMainDraft(deepClone(baselineFeatureCollection));
        resetReplayDraft(EMPTY_FEATURE_COLLECTION);
        updateReplaysState(initialReplays || []);
        setActiveReplayId(null);
        setActiveReplayDraftState(null, "none");
        activeReplayOriginRef.current = null;
        activeReplaySeedRef.current = null;
        clearMainUndo();
        clearReplayUndo();
        initialMapRef.current = buildInitialMap(baselineFeatureCollection);
        setBaselineVersion((version) => version + 1);
    }, [
        clearMainUndo,
        clearReplayUndo,
        baselineFeatureCollection,
        initialReplays,
        resetMainDraft,
        resetReplayDraft,
        setActiveReplayDraftState,
        updateReplaysState,
    ]);

    const changes = useMemo(() => {
        const baseline = initialMapRef.current;
        return diffDraftToInitial(mainDraft, baseline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainDraft, baselineVersion]);
    const changeCount = useMemo(() => changes.size, [changes]);

    const applyReplaySessionMutation = useCallback((
        label: string,
        mutator: (draftReplay: BattleReplay) => void
    ) => {
        const currentReplay = activeReplayDraftRef.current;
        if (!currentReplay) return false;

        const prevReplay = deepClone(currentReplay);
        const nextReplay = deepClone(currentReplay);
        mutator(nextReplay);
        if (replayEquals(prevReplay, nextReplay)) {
            return false;
        }

        pushReplayUndo({
            type: "replay_session",
            geometryId: nextReplay.geometry_id,
            label,
            prevReplay,
        });
        setActiveReplayDraftState(nextReplay, "reset");
        return true;
    }, [pushReplayUndo, setActiveReplayDraftState]);

    const finalizeActiveReplaySession = useCallback((recordMainUndo = true) => {
        if (activeReplayId == null) return;

        const geometryId = String(activeReplayId);
        const currentReplay = activeReplayDraftRef.current
            ? deepClone(activeReplayDraftRef.current)
            : null;
        const originReplay = activeReplayOriginRef.current
            ? deepClone(activeReplayOriginRef.current)
            : null;
        const seedReplay = activeReplaySeedRef.current
            ? deepClone(activeReplaySeedRef.current)
            : null;

        if (!currentReplay) return;
        if (replayEquals(currentReplay, seedReplay)) return;

        updateReplaysState((prev) =>
            replaceReplayByGeometryId(prev, geometryId, currentReplay)
        );

        if (recordMainUndo && !replayEquals(currentReplay, originReplay)) {
            pushMainUndo({
                type: "replay",
                geometryId,
                label: `Replay #${geometryId}`,
                prevReplay: originReplay ? deepClone(originReplay) : null,
            });
        }
    }, [activeReplayId, pushMainUndo, updateReplaysState]);

    const effectiveReplays = useMemo(() => {
        if (activeReplayId == null || !activeReplayDraft) return replays;
        const seedReplay = activeReplaySeedRef.current;
        if (!seedReplay || replayEquals(activeReplayDraft, seedReplay)) {
            return replays;
        }
        return replaceReplayByGeometryId(replays, String(activeReplayId), activeReplayDraft);
    }, [activeReplayDraft, activeReplayId, replays]);

    function createFeature(feature: Feature) {
        const featureClone = deepClone(feature);

        if (mode === "replay") {
            return;
        }

        activeCommitDraft({
            ...activeDraftRef.current,
            features: [...activeDraftRef.current.features, featureClone],
        });
        pushMainUndo({ type: "create", id: featureClone.properties.id });
    }

    function createFeatureWithSnapshotEntityRows(
        feature: Feature,
        nextEntities: SetStateAction<EntitySnapshot[]>,
        label = "Import geometry"
    ) {
        if (mode === "replay") {
            return;
        }

        const featureClone = deepClone(feature);
        const undoActions: UndoAction[] = [];

        if (snapshotUndo) {
            const prevEntities = snapshotUndo.snapshotEntityRowsRef.current || [];
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
                snapshotUndo.snapshotEntityRowsRef.current = computedEntitiesClone;
                snapshotUndo.setSnapshotEntityRows(computedEntitiesClone);
            }
        }

        undoActions.push({ type: "create", id: featureClone.properties.id });
        pushMainUndo(
            undoActions.length === 1
                ? undoActions[0]
                : { type: "group", label, actions: undoActions }
        );
        commitMainDraft({
            ...mainDraftRef.current,
            features: [...mainDraftRef.current.features, featureClone],
        });
    }

    function patchFeatureProperties(
        id: FeatureProperties["id"],
        patch: Partial<FeatureProperties>
    ) {
        if (mode === "replay") {
            return;
        }

        const idx = mainDraftRef.current.features.findIndex((feature) => featureIdEquals(feature.properties.id, id));
        if (idx === -1) return;

        const nextFeatures = [...mainDraftRef.current.features];
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

        pushMainUndo({ type: "properties", id, prevProperties });
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
    }

    function patchFeaturePropertiesBatch(
        patches: FeaturePropertiesPatch[],
        label = "Cập nhật nhiều geometry"
    ) {
        if (mode === "replay") {
            return;
        }

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

        const nextFeatures = [...mainDraftRef.current.features];
        const undoActions: UndoAction[] = [];

        for (const [id, patch] of mergedPatches.entries()) {
            const idx = nextFeatures.findIndex((feature) => featureIdEquals(feature.properties.id, id));
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

        pushMainUndo(
            undoActions.length === 1
                ? undoActions[0]
                : { type: "group", label, actions: undoActions }
        );
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
    }

    function updateFeature(id: FeatureProperties["id"], newGeometry: Geometry) {
        if (mode === "replay") {
            return;
        }

        const idx = mainDraftRef.current.features.findIndex((feature) => featureIdEquals(feature.properties.id, id));
        if (idx === -1) return;

        const prevFeature = mainDraftRef.current.features[idx];
        const prevGeometry = deepClone(prevFeature.geometry);
        if (geometryEquals(prevGeometry, newGeometry)) {
            return;
        }
        const nextFeatures = [...mainDraftRef.current.features];
        nextFeatures[idx] = {
            ...prevFeature,
            geometry: deepClone(newGeometry),
        };

        pushMainUndo({ type: "update", id, prevGeometry });
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
    }

    function deleteFeature(id: FeatureProperties["id"]) {
        if (mode === "replay") {
            return;
        }

        const idx = mainDraftRef.current.features.findIndex((feature) => featureIdEquals(feature.properties.id, id));
        if (idx === -1) return;

        const feature = mainDraftRef.current.features[idx];
        const nextFeatures = [...mainDraftRef.current.features];
        nextFeatures.splice(idx, 1);

        const undoActions: UndoAction[] = [];
        const replayUndoAction = pruneReplaysForDeletedGeometryIds([feature.properties.id], `Xóa replay theo GEO #${feature.properties.id}`);
        if (replayUndoAction) undoActions.push(replayUndoAction);
        undoActions.push({ type: "delete", feature: deepClone(feature), index: idx });
        pushMainUndo(
            undoActions.length === 1
                ? undoActions[0]
                : { type: "group", label: `Xóa GEO #${feature.properties.id}`, actions: undoActions }
        );
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
    }

    function deleteFeatures(ids: Array<FeatureProperties["id"]>) {
        if (mode === "replay") {
            return;
        }

        const idsSet = new Set(ids.map(String));
        const nextFeatures: Feature[] = [];
        const undoActions: UndoAction[] = [];

        mainDraftRef.current.features.forEach((feature, index) => {
            if (idsSet.has(String(feature.properties.id))) {
                undoActions.push({ type: "delete", feature: deepClone(feature), index });
            } else {
                nextFeatures.push(feature);
            }
        });

        if (undoActions.length === 0) return;

        const replayUndoAction = pruneReplaysForDeletedGeometryIds(ids, `Xóa replay theo ${undoActions.length} GEO`);
        const groupedActions = replayUndoAction
            ? [replayUndoAction, ...undoActions.slice().reverse()]
            : undoActions.length === 1
                ? undoActions
                : undoActions.slice().reverse();
        pushMainUndo(
            groupedActions.length === 1
                ? groupedActions[0]
                : { type: "group", label: `Xóa ${undoActions.length} geometry`, actions: groupedActions }
        );
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
    }

    function pruneReplaysForDeletedGeometryIds(
        ids: Array<FeatureProperties["id"]>,
        label: string
    ): UndoAction | null {
        const deletedIds = new Set(ids.map((id) => String(id)));
        if (!deletedIds.size) return null;

        const prevReplays = replaysRef.current || [];
        const nextReplays = pruneDeletedGeometryIdsFromReplays(prevReplays, deletedIds);
        if (replaysEqual(prevReplays, nextReplays)) return null;

        updateReplaysState(nextReplays);
        return {
            type: "replays",
            label,
            prevReplays: deepClone(prevReplays),
        };
    }

    function buildPayload(): Change[] {
        return Array.from(changes.values()).map((change) => deepClone(change));
    }

    function clearChanges() {
        clearMainUndo();
        clearReplayUndo();
        initialMapRef.current = buildInitialMap(mainDraftRef.current);
        setBaselineVersion((version) => version + 1);
    }

    function hasPersistedFeature(id: FeatureProperties["id"]) {
        return initialMapRef.current.has(id);
    }

    const switchReplayContext = useCallback((featureId: string | number, selectedIds: (string | number)[] = []) => {
        const geometryId = String(featureId);

        if (activeReplayId != null && String(activeReplayId) === geometryId) {
            return;
        }

        if (activeReplayId != null) {
            finalizeActiveReplaySession(true);
        }

        const existing = replaysRef.current.find((replay) => replay.geometry_id === geometryId) || null;
        const seedReplay = existing
            ? normalizeReplaySessionSeed(existing, mainDraftRef.current, geometryId, selectedIds)
            : createReplaySessionSeed(mainDraftRef.current, geometryId, selectedIds);

        activeReplayOriginRef.current = existing ? deepClone(existing) : null;
        activeReplaySeedRef.current = deepClone(seedReplay);
        clearReplayUndo();
        setActiveReplayDraftState(seedReplay, "reset");
        setActiveReplayId(geometryId);
    }, [
        activeReplayId,
        clearReplayUndo,
        finalizeActiveReplaySession,
        mainDraftRef,
        setActiveReplayDraftState,
    ]);

    const closeReplayContext = useCallback(() => {
        finalizeActiveReplaySession(true);
        setActiveReplayId(null);
        setActiveReplayDraftState(null, "reset");
        activeReplayOriginRef.current = null;
        activeReplaySeedRef.current = null;
        clearReplayUndo();
    }, [clearReplayUndo, finalizeActiveReplaySession, setActiveReplayDraftState]);

    const setSnapshotEntityRowsUndoable = useCallback((
        next: SetStateAction<EntitySnapshot[]>,
        label = "Cập nhật entities"
    ) => {
        if (!snapshotUndo) return;
        const prev = snapshotUndo.snapshotEntityRowsRef.current || [];
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
        pushMainUndo({ type: "snapshot_entities", label, prev: prevClone });
        snapshotUndo.snapshotEntityRowsRef.current = computedClone;
        snapshotUndo.setSnapshotEntityRows(computedClone);
    }, [pushMainUndo, snapshotUndo]);

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
        pushMainUndo({ type: "snapshot_wikis", label, prev: prevClone });
        snapshotUndo.snapshotWikisRef.current = computedClone;
        snapshotUndo.setSnapshotWikis(computedClone);
    }, [pushMainUndo, snapshotUndo]);

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
        pushMainUndo({ type: "snapshot_entity_wiki", label, prev: prevClone });
        snapshotUndo.snapshotEntityWikiLinksRef.current = computedClone;
        snapshotUndo.setSnapshotEntityWikiLinks(computedClone);
    }, [pushMainUndo, snapshotUndo]);

    const setSnapshotWikisAndEntityWikiLinksUndoable = useCallback((
        nextWikis: SetStateAction<WikiSnapshot[]>,
        nextLinks: SetStateAction<EntityWikiLinkSnapshot[]>,
        label = "Cập nhật wiki/entity-wiki"
    ) => {
        if (!snapshotUndo) return;

        const prevWikis = snapshotUndo.snapshotWikisRef.current || [];
        const prevWikiLinks = snapshotUndo.snapshotEntityWikiLinksRef.current || [];
        const prevWikisClone = deepClone(prevWikis);
        const prevWikiLinksClone = deepClone(prevWikiLinks);
        const computedWikis = typeof nextWikis === "function"
            ? (nextWikis as (p: WikiSnapshot[]) => WikiSnapshot[])(prevWikisClone)
            : nextWikis;
        const computedWikiLinks = typeof nextLinks === "function"
            ? (nextLinks as (p: EntityWikiLinkSnapshot[]) => EntityWikiLinkSnapshot[])(prevWikiLinksClone)
            : nextLinks;

        const wikisChanged = !jsonEquals(prevWikis, computedWikis);
        const linksChanged = !jsonEquals(prevWikiLinks, computedWikiLinks);
        if (!wikisChanged && !linksChanged) return;

        const undoActions: Array<Extract<UndoAction, { type: "snapshot_wikis" | "snapshot_entity_wiki" }>> = [];
        if (wikisChanged) {
            undoActions.push({ type: "snapshot_wikis", label: "Cập nhật wiki", prev: prevWikisClone });
        }
        if (linksChanged) {
            undoActions.push({ type: "snapshot_entity_wiki", label: "Cập nhật entity-wiki", prev: prevWikiLinksClone });
        }

        pushMainUndo(
            undoActions.length === 1
                ? { ...undoActions[0], label }
                : { type: "group", label, actions: undoActions }
        );

        if (wikisChanged) {
            const computedWikisClone = deepClone(computedWikis);
            snapshotUndo.snapshotWikisRef.current = computedWikisClone;
            snapshotUndo.setSnapshotWikis(computedWikisClone);
        }
        if (linksChanged) {
            const computedWikiLinksClone = deepClone(computedWikiLinks);
            snapshotUndo.snapshotEntityWikiLinksRef.current = computedWikiLinksClone;
            snapshotUndo.setSnapshotEntityWikiLinks(computedWikiLinksClone);
        }
    }, [pushMainUndo, snapshotUndo]);

    const undo = useCallback(() => {
        if (mode === "replay") {
            undoReplay();
            return;
        }
        undoMain();
    }, [mode, undoMain, undoReplay]);

    const undoStack = mode === "replay" ? replayUndoStack : mainUndoStack;

    return {
        draft: activeDraft,
        draftRef: activeDraftRef,
        mainDraft,
        replayDraft,
        replays,
        activeReplayDraft,
        effectiveReplays,
        setReplays: updateReplaysState,
        mutateActiveReplay: applyReplaySessionMutation,
        activeReplayId,
        switchReplayContext,
        closeReplayContext,
        changes,
        undoStack,
        replayUndoStack,
        changeCount,
        canUndoReplay: replayUndoStack.length > 0,
        createFeature,
        createFeatureWithSnapshotEntityRows,
        patchFeatureProperties,
        patchFeaturePropertiesBatch,
        updateFeature,
        deleteFeature,
        deleteFeatures,
        undo,
        buildPayload,
        clearChanges,
        hasPersistedFeature,
        // Snapshot undo helpers (no-op if snapshotUndo not provided)
        setSnapshotEntityRows: setSnapshotEntityRowsUndoable,
        setSnapshotWikis: setSnapshotWikisUndoable,
        setSnapshotEntityWikiLinks: setSnapshotEntityWikiLinksUndoable,
        setSnapshotWikisAndEntityWikiLinks: setSnapshotWikisAndEntityWikiLinksUndoable,
    };
}

function resolveStateAction<T>(next: SetStateAction<T>, prev: T): T {
    return typeof next === "function" ? (next as (value: T) => T)(prev) : next;
}

function featureIdEquals(a: FeatureProperties["id"], b: FeatureProperties["id"]) {
    return String(a) === String(b);
}

function jsonEquals(a: unknown, b: unknown) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

function createReplaySessionSeed(
    sourceDraft: FeatureCollection,
    geometryId: string,
    selectedIds: (string | number)[]
): BattleReplay {
    return {
        id: geometryId,
        geometry_id: geometryId,
        target_geometry_ids: buildReplaySeedTargetIds(
            sourceDraft.features.find((feature) => String(feature.properties.id) === geometryId),
            geometryId,
            selectedIds
        ),
        detail: [],
    };
}

function normalizeReplaySessionSeed(
    replay: BattleReplay,
    sourceDraft: FeatureCollection,
    geometryId: string,
    selectedIds: (string | number)[]
): BattleReplay {
    const nextReplay = deepClone(replay);
    nextReplay.id = geometryId;
    const triggerFeature = sourceDraft.features.find((feature) => String(feature.properties.id) === geometryId);
    const seedTargetIds = buildReplaySeedTargetIds(triggerFeature, geometryId, selectedIds);
    nextReplay.target_geometry_ids = normalizeReplayTargetGeometryIds(
        nextReplay.target_geometry_ids,
        geometryId,
        seedTargetIds
    );
    return nextReplay;
}

function buildReplaySeedTargetIds(
    triggerFeature: Feature | undefined,
    featureId: string,
    selectedIds: (string | number)[]
) {
    const orderedIds: string[] = [];
    const seen = new Set<string>();

    const pushId = (rawId: string | number | null | undefined) => {
        if (rawId == null) return;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        orderedIds.push(id);
    };

    pushId(featureId);

    for (const rawId of selectedIds || []) {
        pushId(rawId);
    }

    if (Array.isArray(triggerFeature?.properties?.binding)) {
        for (const rawId of triggerFeature.properties.binding) {
            pushId(rawId);
        }
    }

    return orderedIds;
}

function buildReplayFeatureDraft(
    sourceDraft: FeatureCollection,
    replay: BattleReplay | null
): FeatureCollection {
    if (!replay) return deepClone(EMPTY_FEATURE_COLLECTION);
    return buildReplayFeatureDraftFromTargetIds(
        sourceDraft,
        normalizeReplayTargetGeometryIds(replay.target_geometry_ids, replay.geometry_id)
    );
}

function buildReplayFeatureDraftFromTargetIds(
    sourceDraft: FeatureCollection,
    targetGeometryIds: string[]
): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: targetGeometryIds
            .map((id) =>
                sourceDraft.features.find((feature) => String(feature.properties.id) === id) || null
            )
            .filter(Boolean)
            .map((feature) => sanitizeReplayFeature(deepClone(feature!))),
    };
}

function normalizeReplayTargetGeometryIds(
    targetGeometryIds: string[] | undefined,
    geometryId: string,
    extraIds: (string | number)[] = []
): string[] {
    const orderedIds: string[] = [];
    const seen = new Set<string>();

    const pushId = (rawId: string | number | null | undefined) => {
        if (rawId == null) return;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        orderedIds.push(id);
    };

    pushId(geometryId);
    for (const rawId of targetGeometryIds || []) pushId(rawId);
    for (const rawId of extraIds || []) pushId(rawId);
    return orderedIds;
}

function sanitizeReplayFeature(feature: Feature): Feature {
    return {
        ...feature,
        properties: {
            ...feature.properties,
            binding: [],
        },
    };
}

function replaceReplayByGeometryId(
    replays: BattleReplay[],
    geometryId: string,
    nextReplay: BattleReplay | null
) {
    const next: BattleReplay[] = [];
    let replaced = false;

    for (const replay of replays || []) {
        if (!replay || replay.geometry_id !== geometryId) {
            next.push(replay);
            continue;
        }
        if (nextReplay) {
            next.push(deepClone(nextReplay));
        }
        replaced = true;
    }

    if (!replaced && nextReplay) {
        next.push(deepClone(nextReplay));
    }

    return next;
}

function pruneDeletedGeometryIdsFromReplays(
    replays: BattleReplay[],
    deletedIds: Set<string>
): BattleReplay[] {
    const next: BattleReplay[] = [];

    for (const replay of replays || []) {
        const geometryId = String(replay?.geometry_id || "");
        if (!geometryId || deletedIds.has(geometryId)) continue;

        const targetGeometryIds = normalizeReplayTargetGeometryIds(
            replay.target_geometry_ids,
            geometryId
        ).filter((id) => !deletedIds.has(id));

        next.push({
            ...deepClone(replay),
            id: geometryId,
            geometry_id: geometryId,
            target_geometry_ids: targetGeometryIds,
        });
    }

    return next;
}

function replaysEqual(a: BattleReplay[] | null | undefined, b: BattleReplay[] | null | undefined) {
    try {
        return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
    } catch {
        return false;
    }
}

function replayEquals(a: BattleReplay | null | undefined, b: BattleReplay | null | undefined) {
    try {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    } catch {
        return false;
    }
}
