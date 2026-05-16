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

type DraftRef = { current: FeatureCollection };
type DraftCommit = (next: FeatureCollection) => void;
type ReplayDraftSyncMode = "none" | "reset";

// State trung tâm của editor:
// - main draft: dữ liệu section thông thường
// - active replay draft: bản sao đầy đủ của toàn bộ BattleReplay đang chỉnh
// - replay feature draft: FeatureCollection con để map/editor hiện tại thao tác
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

    const syncReplayFeatureDraft = useCallback((nextFeatures: FeatureCollection) => {
        resetReplayDraft(deepClone(nextFeatures));
    }, [resetReplayDraft]);

    const setActiveReplayDraftState = useCallback((
        next: SetStateAction<BattleReplay | null>,
        syncMode: ReplayDraftSyncMode = "reset"
    ) => {
        const resolved = resolveStateAction(next, activeReplayDraftRef.current);
        const cloned = resolved ? deepClone(resolved) : null;
        activeReplayDraftRef.current = cloned;
        setActiveReplayDraft(cloned);

        if (syncMode === "reset") {
            syncReplayFeatureDraft(cloned?.replay_features || EMPTY_FEATURE_COLLECTION);
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
        buildInitialMap(initialData)
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
                        feature.properties.id !== action.id
                    ),
                });
                return true;
            }
            case "delete": {
                const feature = deepClone(action.feature);
                targetCommitDraft({
                    ...targetDraftRef.current,
                    features: [...targetDraftRef.current.features, feature],
                });
                return true;
            }
            case "update": {
                const idx = targetDraftRef.current.features.findIndex((feature) =>
                    feature.properties.id === action.id
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
                    feature.properties.id === action.id
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
                snapshotUndo.snapshotEntitiesRef.current = prev;
                snapshotUndo.setSnapshotEntities(prev);
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
        resetMainDraft(deepClone(initialData));
        resetReplayDraft(EMPTY_FEATURE_COLLECTION);
        updateReplaysState(initialReplays || []);
        setActiveReplayId(null);
        setActiveReplayDraftState(null, "none");
        activeReplayOriginRef.current = null;
        activeReplaySeedRef.current = null;
        clearMainUndo();
        clearReplayUndo();
        initialMapRef.current = buildInitialMap(initialData);
        setBaselineVersion((version) => version + 1);
    }, [
        clearMainUndo,
        clearReplayUndo,
        initialData,
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
        if (!nextReplay.replay_features) {
            nextReplay.replay_features = deepClone(EMPTY_FEATURE_COLLECTION);
        }
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
            applyReplaySessionMutation(`Replay: thêm #${featureClone.properties.id}`, (draftReplay) => {
                const featureDraft = ensureReplayFeatureCollection(draftReplay);
                featureDraft.features = [...featureDraft.features, featureClone];
            });
            return;
        }

        activeCommitDraft({
            ...activeDraftRef.current,
            features: [...activeDraftRef.current.features, featureClone],
        });
        pushMainUndo({ type: "create", id: featureClone.properties.id });
    }

    function createFeatureWithSnapshotEntities(
        feature: Feature,
        nextEntities: SetStateAction<EntitySnapshot[]>,
        label = "Import geometry"
    ) {
        if (mode === "replay") {
            createFeature(feature);
            return;
        }

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
            applyReplaySessionMutation(`Replay: cập nhật thuộc tính #${id}`, (draftReplay) => {
                const featureDraft = ensureReplayFeatureCollection(draftReplay);
                const idx = featureDraft.features.findIndex((feature) => feature.properties.id === id);
                if (idx === -1) return;
                featureDraft.features[idx] = {
                    ...featureDraft.features[idx],
                    properties: {
                        ...featureDraft.features[idx].properties,
                        ...deepClone(patch),
                    },
                };
            });
            return;
        }

        const idx = mainDraftRef.current.features.findIndex((feature) => feature.properties.id === id);
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
            applyReplaySessionMutation(label, (draftReplay) => {
                const featureDraft = ensureReplayFeatureCollection(draftReplay);
                const mergedPatches = new Map<FeatureProperties["id"], Partial<FeatureProperties>>();
                for (const item of patches || []) {
                    if (!item) continue;
                    const prev = mergedPatches.get(item.id) || {};
                    mergedPatches.set(item.id, {
                        ...prev,
                        ...deepClone(item.patch),
                    });
                }

                featureDraft.features = featureDraft.features.map((feature) => {
                    const featurePatch = mergedPatches.get(feature.properties.id);
                    if (!featurePatch) return feature;
                    return {
                        ...feature,
                        properties: {
                            ...feature.properties,
                            ...deepClone(featurePatch),
                        },
                    };
                });
            });
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

        pushMainUndo(
            undoActions.length === 1
                ? undoActions[0]
                : { type: "group", label, actions: undoActions }
        );
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
    }

    function updateFeature(id: FeatureProperties["id"], newGeometry: Geometry) {
        if (mode === "replay") {
            applyReplaySessionMutation(`Replay: chỉnh sửa #${id}`, (draftReplay) => {
                const featureDraft = ensureReplayFeatureCollection(draftReplay);
                const idx = featureDraft.features.findIndex((feature) => feature.properties.id === id);
                if (idx === -1) return;
                featureDraft.features[idx] = {
                    ...featureDraft.features[idx],
                    geometry: deepClone(newGeometry),
                };
            });
            return;
        }

        const idx = mainDraftRef.current.features.findIndex((feature) => feature.properties.id === id);
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
            applyReplaySessionMutation(`Replay: xóa #${id}`, (draftReplay) => {
                const featureDraft = ensureReplayFeatureCollection(draftReplay);
                featureDraft.features = featureDraft.features.filter((feature) => feature.properties.id !== id);
            });
            return;
        }

        const idx = mainDraftRef.current.features.findIndex((feature) => feature.properties.id === id);
        if (idx === -1) return;

        const feature = mainDraftRef.current.features[idx];
        const nextFeatures = [...mainDraftRef.current.features];
        nextFeatures.splice(idx, 1);

        pushMainUndo({ type: "delete", feature: deepClone(feature) });
        commitMainDraft({ ...mainDraftRef.current, features: nextFeatures });
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
        pushMainUndo({ type: "snapshot_entities", label, prev: prevClone });
        snapshotUndo.snapshotEntitiesRef.current = computedClone;
        snapshotUndo.setSnapshotEntities(computedClone);
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
        activeReplayId,
        switchReplayContext,
        closeReplayContext,
        changes,
        undoStack,
        replayUndoStack,
        changeCount,
        canUndoReplay: replayUndoStack.length > 0,
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

function resolveStateAction<T>(next: SetStateAction<T>, prev: T): T {
    return typeof next === "function" ? (next as (value: T) => T)(prev) : next;
}

function buildReplaySeedFeatures(
    sourceDraft: FeatureCollection,
    featureId: string,
    selectedIds: (string | number)[]
): FeatureCollection {
    const selectedIdsSet = new Set(selectedIds.map(String));
    selectedIdsSet.add(featureId);

    const triggerFeature = sourceDraft.features.find(
        (feature) => String(feature.properties.id) === featureId
    );
    const mainBoundIds = new Set(
        Array.isArray(triggerFeature?.properties?.binding)
            ? triggerFeature.properties.binding.map(String)
            : []
    );
    const targetIds = new Set([...selectedIdsSet, ...mainBoundIds]);

    return {
        type: "FeatureCollection",
        features: sourceDraft.features
            .filter((feature) => targetIds.has(String(feature.properties.id)))
            .map(deepClone),
    };
}

function createReplaySessionSeed(
    sourceDraft: FeatureCollection,
    geometryId: string,
    selectedIds: (string | number)[]
): BattleReplay {
    return {
        geometry_id: geometryId,
        detail: [],
        replay_features: buildReplaySeedFeatures(sourceDraft, geometryId, selectedIds),
    };
}

function normalizeReplaySessionSeed(
    replay: BattleReplay,
    sourceDraft: FeatureCollection,
    geometryId: string,
    selectedIds: (string | number)[]
): BattleReplay {
    const nextReplay = deepClone(replay);
    if (!nextReplay.replay_features) {
        nextReplay.replay_features = buildReplaySeedFeatures(sourceDraft, geometryId, selectedIds);
    }
    return nextReplay;
}

function ensureReplayFeatureCollection(replay: BattleReplay): FeatureCollection {
    if (!replay.replay_features) {
        replay.replay_features = deepClone(EMPTY_FEATURE_COLLECTION);
    }
    return replay.replay_features;
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

function replayEquals(a: BattleReplay | null | undefined, b: BattleReplay | null | undefined) {
    try {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    } catch {
        return false;
    }
}
