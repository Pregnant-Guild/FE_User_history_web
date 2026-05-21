"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import Map, { type MapHandle } from "@/uhm/components/Map";
import Editor from "@/uhm/components/Editor";
import BackgroundLayersPanel from "@/uhm/components/editor/BackgroundLayersPanel";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import SelectedGeometryPanel from "@/uhm/components/editor/SelectedGeometryPanel";
import ReplayTimelineSidebar from "@/uhm/components/editor/ReplayTimelineSidebar";
import ReplayEffectsSidebar from "@/uhm/components/editor/ReplayEffectsSidebar";
import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import PublicWikiSidebar from "@/uhm/components/wiki/PublicWikiSidebar";
import WikiSidebarPanel from "@/uhm/components/wiki/WikiSidebarPanel";
import ProjectEntityRefsPanel from "@/uhm/components/editor/ProjectEntityRefsPanel";
import EntityWikiBindingsPanel from "@/uhm/components/editor/EntityWikiBindingsPanel";
import GeometryBindingPanel from "@/uhm/components/editor/GeometryBindingPanel";
import ImageOverlayPanel from "@/uhm/components/editor/ImageOverlayPanel";
import { Entity, fetchEntities, searchEntitiesByName } from "@/uhm/api/entities";
import { ApiError } from "@/uhm/api/http";
import { fetchCurrentUser } from "@/uhm/api/auth";
import { fetchWikiById, searchWikisByTitle, type Wiki } from "@/uhm/api/wikis";
import { searchGeometriesByEntityName, type EntityGeometriesSearchItem, type EntityGeometrySearchGeo } from "@/uhm/api/geometries";
import {
    Feature,
    FeatureCollection,
    useEditorState,
} from "@/uhm/lib/editor/state/useEditorState";
import { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";
import {
    getDefaultTypeIdForFeature,
    normalizeFeatureBindingIds,
    normalizeFeatureEntityIds,
    uniqueEntityIds,
} from "@/uhm/lib/editor/snapshot/editorSnapshot";
import {
    buildClientEntityId,
    mergeEntitySearchResults,
} from "@/uhm/lib/editor/entity/entityBinding";
import { buildFeatureEntityPatch } from "@/uhm/lib/editor/entity/entityBinding";
import {
    loadBackgroundLayerVisibilityFromStorage,
} from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { deepClone } from "@/uhm/lib/editor/draft/draftDiff";
import { useProjectCommands } from "@/uhm/lib/editor/project/useProjectCommands";
import { useReplayPreview } from "@/uhm/lib/replay/useReplayPreview";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import {
    getViewportImageCoordinates,
    moveImageOverlayCoordinatesByPixels,
    scaleImageOverlayCoordinatesByFactor,
    type MapImageOverlay,
} from "@/uhm/components/map/imageOverlay";
import { FIXED_TIMELINE_RANGE, clampYearToFixedRange } from "@/uhm/lib/utils/timeline";
import { useFeatureCommands } from "./featureCommands";
import { deleteSubmission } from "@/uhm/api/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { BattleReplay, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import {
    EditorStoreProvider,
    useEditorStore,
    useEditorStoreApi,
} from "@/uhm/store/editorStore";
import { EditorSearchResults } from "./EditorSearchResults";
import { ResizeHandle } from "./ResizeHandle";
import {
    clampNumber,
    formatCommitTitle,
    isFeatureVisibleAtYear,
    normalizeEntitiesForCompare,
    normalizeEntityWikiLinksForCompare,
    normalizeGeoSearchBindingIds,
    normalizeGeoSearchGeometry,
    normalizeReplaysForCompare,
    normalizeWikisForCompare,
} from "./editorPageUtils";

const CURRENT_YEAR = new Date().getUTCFullYear();
const DEFAULT_EDITOR_USER_ID = "local-editor";

type ReplayPreviewSession = {
    replay: BattleReplay;
    draft: FeatureCollection;
    wikis: WikiSnapshot[];
    selectedStageId: number | null;
    selectedStepIndex: number | null;
    timelineYear: number;
    timelineFilterEnabled: boolean;
    mapViewState: ReturnType<MapHandle["getViewState"]>;
};

export default function Page() {
    return (
        <EditorStoreProvider
            options={{
                emptyFeatureCollection: EMPTY_FEATURE_COLLECTION,
                defaultEditorUserId: DEFAULT_EDITOR_USER_ID,
                fallbackTimelineRange: FIXED_TIMELINE_RANGE,
                currentYear: CURRENT_YEAR,
            }}
        >
            <EditorPageContent />
        </EditorStoreProvider>
    );
}

function EditorPageContent() {
    const params = useParams();
    const router = useRouter();
    const editorStoreApi = useEditorStoreApi();
    const projectId = String(params.id || "");
    // Ref chặn auto-open lặp lại cùng project khi component re-render.
    const openedProjectIdRef = useRef<string | null>(null);
    // Ref giữ timeout flash message của form entity để clear đúng timer cũ.
    const entityFormStatusTimeoutRef = useRef<number | null>(null);
    // Ref giữ timeout flash message của panel geometry binding.
    const geoBindingStatusTimeoutRef = useRef<number | null>(null);
    // Ref tracking entity tạo local để cleanup khỏi catalog nếu undo/xóa khỏi snapshot.
    const localCreatedEntityIdsRef = useRef<Set<string>>(new Set());
    // Ref nhớ geometry vừa chọn để không xóa status khi chỉ patch metadata cùng geometry.
    const lastSelectedFeatureIdRef = useRef<string | null>(null);
    // Ref bridge sang Map imperative API (getMap/getViewState) cho replay preview.
    const mapHandleRef = useRef<MapHandle | null>(null);
    // State chính của editor nằm trong zustand store để các panel con đọc cùng source-of-truth.
    const {
        mode,
        internalSetMode,
        initialData,
        isSaving,
        isSubmitting,
        isOpeningSection,
        setIsOpeningSection,
        commitTitle,
        setCommitTitle,
        activeSection,
        projectState,
        sectionCommits,
        baselineSnapshot,
        entityCatalog,
        setEntityCatalog,
        snapshotEntities,
        setSnapshotEntities,
        entityStatus,
        setEntityStatus,
        selectedFeatureIds,
        setSelectedFeatureIds,
        entityForm,
        setEntityForm,
        selectedGeometryEntityIds,
        setSelectedGeometryEntityIds,
        geometryMetaForm,
        setGeometryMetaForm,
        setIsEntitySubmitting,
        setEntityFormStatus,
        entitySearchResults,
        setEntitySearchResults,
        isEntitySearchLoading,
        setIsEntitySearchLoading,
        timelineDraftYear,
        setTimelineDraftYear,
        backgroundVisibility,
        setBackgroundVisibility,
        isBackgroundVisibilityReady,
        setIsBackgroundVisibilityReady,
        snapshotWikis,
        setSnapshotWikis,
        snapshotEntityWikiLinks,
        setSnapshotEntityWikiLinks,
        blockedPendingSubmissionId,
        setBlockedPendingSubmissionId,
        searchKind,
        setSearchKind,
        searchQuery,
        setSearchQuery,
        searchQueryDraft,
        setSearchQueryDraft,
        wikiSearchResults,
        setWikiSearchResults,
        isWikiSearching,
        setIsWikiSearching,
        geoSearchResults,
        setGeoSearchResults,
        isGeoSearching,
        setIsGeoSearching,
        setRequestedActiveWikiId,
        leftPanelWidth,
        setLeftPanelWidth,
        rightPanelWidth,
        setRightPanelWidth,
        timelineFilterEnabled,
        setTimelineFilterEnabled,
        geometryBindingFilterEnabled,
        setGeoBindingStatus,
        geometryFocusRequest,
        setGeometryFocusRequest,
        replayFeatureId,
        setReplayFeatureId,
        hideOutside,
        setHideOutside,
        geometryVisibility,
        setGeometryVisibility,
    } = useEditorStore(useShallow((state) => ({
        mode: state.mode,
        internalSetMode: state.setMode,
        initialData: state.initialData,
        isSaving: state.isSaving,
        isSubmitting: state.isSubmitting,
        isOpeningSection: state.isOpeningSection,
        setIsOpeningSection: state.setIsOpeningSection,
        commitTitle: state.commitTitle,
        setCommitTitle: state.setCommitTitle,
        activeSection: state.activeSection,
        projectState: state.projectState,
        sectionCommits: state.sectionCommits,
        baselineSnapshot: state.baselineSnapshot,
        entityCatalog: state.entityCatalog,
        setEntityCatalog: state.setEntityCatalog,
        snapshotEntities: state.snapshotEntities,
        setSnapshotEntities: state.setSnapshotEntities,
        entityStatus: state.entityStatus,
        setEntityStatus: state.setEntityStatus,
        selectedFeatureIds: state.selectedFeatureIds,
        setSelectedFeatureIds: state.setSelectedFeatureIds,
        entityForm: state.entityForm,
        setEntityForm: state.setEntityForm,
        selectedGeometryEntityIds: state.selectedGeometryEntityIds,
        setSelectedGeometryEntityIds: state.setSelectedGeometryEntityIds,
        geometryMetaForm: state.geometryMetaForm,
        setGeometryMetaForm: state.setGeometryMetaForm,
        setIsEntitySubmitting: state.setIsEntitySubmitting,
        setEntityFormStatus: state.setEntityFormStatus,
        entitySearchResults: state.entitySearchResults,
        setEntitySearchResults: state.setEntitySearchResults,
        isEntitySearchLoading: state.isEntitySearchLoading,
        setIsEntitySearchLoading: state.setIsEntitySearchLoading,
        timelineDraftYear: state.timelineDraftYear,
        setTimelineDraftYear: state.setTimelineDraftYear,
        backgroundVisibility: state.backgroundVisibility,
        setBackgroundVisibility: state.setBackgroundVisibility,
        isBackgroundVisibilityReady: state.isBackgroundVisibilityReady,
        setIsBackgroundVisibilityReady: state.setIsBackgroundVisibilityReady,
        snapshotWikis: state.snapshotWikis,
        setSnapshotWikis: state.setSnapshotWikis,
        snapshotEntityWikiLinks: state.snapshotEntityWikiLinks,
        setSnapshotEntityWikiLinks: state.setSnapshotEntityWikiLinks,
        blockedPendingSubmissionId: state.blockedPendingSubmissionId,
        setBlockedPendingSubmissionId: state.setBlockedPendingSubmissionId,
        searchKind: state.searchKind,
        setSearchKind: state.setSearchKind,
        searchQuery: state.searchQuery,
        setSearchQuery: state.setSearchQuery,
        searchQueryDraft: state.searchQueryDraft,
        setSearchQueryDraft: state.setSearchQueryDraft,
        wikiSearchResults: state.wikiSearchResults,
        setWikiSearchResults: state.setWikiSearchResults,
        isWikiSearching: state.isWikiSearching,
        setIsWikiSearching: state.setIsWikiSearching,
        geoSearchResults: state.geoSearchResults,
        setGeoSearchResults: state.setGeoSearchResults,
        isGeoSearching: state.isGeoSearching,
        setIsGeoSearching: state.setIsGeoSearching,
        setRequestedActiveWikiId: state.setRequestedActiveWikiId,
        leftPanelWidth: state.leftPanelWidth,
        setLeftPanelWidth: state.setLeftPanelWidth,
        rightPanelWidth: state.rightPanelWidth,
        setRightPanelWidth: state.setRightPanelWidth,
        timelineFilterEnabled: state.timelineFilterEnabled,
        setTimelineFilterEnabled: state.setTimelineFilterEnabled,
        geometryBindingFilterEnabled: state.geometryBindingFilterEnabled,
        setGeoBindingStatus: state.setGeoBindingStatus,
        geometryFocusRequest: state.geometryFocusRequest,
        setGeometryFocusRequest: state.setGeometryFocusRequest,
        replayFeatureId: state.replayFeatureId,
        setReplayFeatureId: state.setReplayFeatureId,
        hideOutside: state.hideOutside,
        setHideOutside: state.setHideOutside,
        geometryVisibility: state.geometryVisibility,
        setGeometryVisibility: state.setGeometryVisibility,
    })));
    // Counter để bỏ qua response cũ khi user gõ search liên tục.
    const entitySearchRequestRef = useRef(0);
    const wikiSearchRequestRef = useRef(0);
    const geoSearchRequestRef = useRef(0);

    // Refs mirror snapshot arrays để undo callbacks luôn đọc state mới nhất.
    const snapshotEntitiesRef = useRef(snapshotEntities);
    const snapshotWikisRef = useRef(snapshotWikis);
    const snapshotEntityWikiLinksRef = useRef(snapshotEntityWikiLinks);
    useEffect(() => {
        snapshotEntitiesRef.current = snapshotEntities;
    }, [snapshotEntities]);
    useEffect(() => {
        snapshotWikisRef.current = snapshotWikis;
    }, [snapshotWikis]);
    useEffect(() => {
        snapshotEntityWikiLinksRef.current = snapshotEntityWikiLinks;
    }, [snapshotEntityWikiLinks]);

    // Hook quản lý draft/changes/undo cho main editor và replay editor.
    const editor = useEditorState(initialData, {
        snapshotUndo: {
            snapshotEntitiesRef,
            setSnapshotEntities,
            snapshotWikisRef,
            setSnapshotWikis,
            snapshotEntityWikiLinksRef,
            setSnapshotEntityWikiLinks,
        },
        initialReplays: baselineSnapshot?.replays,
        mode: mode,
    });
    // Setter bọc undo cho thao tác cập nhật wiki snapshot.
    const setSnapshotWikisUndoable = useCallback(
        (next: SetStateAction<WikiSnapshot[]>) => {
            editor.setSnapshotWikis(next, "Cập nhật wiki");
        },
        [editor]
    );
    // Setter bọc undo cho thao tác cập nhật binding entity-wiki.
    const setSnapshotEntityWikiLinksUndoable = useCallback(
        (next: SetStateAction<EntityWikiLinkSnapshot[]>) => {
            editor.setSnapshotEntityWikiLinks(next, "Cập nhật entity-wiki");
        },
        [editor]
    );
    // Chuyển entity snapshot local thành entity catalog row để search/binding dùng chung.
    const snapshotEntitiesAsEntities = useMemo(() => {
        const rows = snapshotEntities || [];
        return rows
            .filter((e) => e && e.operation !== "delete")
            .map((e) => ({
                id: String(e.id || ""),
                name: String(e.name || "").trim() || String(e.id || ""),
                description: e.description ?? null,
                time_start: e.time_start ?? null,
                time_end: e.time_end ?? null,
                geometry_count: 0,
            }))
            .filter((e) => e.id.length > 0 && e.name.length > 0);
    }, [snapshotEntities]);

    // Entity list hợp nhất giữa backend catalog và snapshot local.
    const entities = useMemo(
        () => mergeEntitySearchResults(entityCatalog, snapshotEntitiesAsEntities),
        [entityCatalog, snapshotEntitiesAsEntities]
    );
    // State vị trí stage/step đang chọn trong replay editor.
    const [replaySelection, setReplaySelection] = useState<{
        stageId: number | null;
        stepIndex: number | null;
    }>({
        stageId: null,
        stepIndex: null,
    });
    // State snapshot đóng băng của replay preview, tách khỏi draft đang edit.
    const [previewSession, setPreviewSession] = useState<ReplayPreviewSession | null>(null);
    // State yêu cầu autoplay sau khi chuyển vào preview mode.
    const [previewAutoplayMode, setPreviewAutoplayMode] = useState<"start" | "selection" | null>(null);
    // Cache wiki đã fetch trong preview để không gọi API lặp lại.
    const [previewWikiCache, setPreviewWikiCache] = useState<Record<string, Wiki>>({});
    // State lỗi riêng cho wiki preview sidebar.
    const [previewWikiError, setPreviewWikiError] = useState<string | null>(null);
    // State loading riêng cho wiki preview sidebar.
    const [isPreviewWikiLoading, setIsPreviewWikiLoading] = useState(false);
    // State ảnh overlay local-only để vẽ trace theo ảnh mẫu.
    const [imageOverlay, setImageOverlay] = useState<MapImageOverlay | null>(null);
    // Bật/tắt điều khiển ảnh overlay bằng phím mũi tên và W/S.
    const [imageOverlayKeyboardEnabled, setImageOverlayKeyboardEnabled] = useState(false);
    // Ref giữ object URL hiện tại để revoke khi đổi/xóa ảnh, tránh leak bộ nhớ.
    const imageOverlayObjectUrlRef = useRef<string | null>(null);
    // Cập nhật stage/step được chọn trong sidebar replay.
    const handleReplaySelectionChange = useCallback((stageId: number | null, stepIndex: number | null) => {
        setReplaySelection({ stageId, stepIndex });
    }, []);
    // Helper đọc MapLibre instance hiện tại cho replay dispatcher.
    const getCurrentMapInstance = useCallback(() => mapHandleRef.current?.getMap() ?? null, []);
    // Helper đọc camera/view hiện tại để lưu vào replay preview.
    const getCurrentMapViewState = useCallback(() => mapHandleRef.current?.getViewState() ?? null, []);
    const isReplayEditMode = mode === "replay";
    const isReplayPreviewMode = mode === "replay_preview";
    // Ref mirror entity list cho debounce search không phụ thuộc closure cũ.
    const entitiesRef = useRef(entities);
    useEffect(() => {
        entitiesRef.current = entities;
    }, [entities]);

    useEffect(() => {
        return () => {
            if (imageOverlayObjectUrlRef.current) {
                URL.revokeObjectURL(imageOverlayObjectUrlRef.current);
                imageOverlayObjectUrlRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!imageOverlayKeyboardEnabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target)) return;

            const key = event.key.toLowerCase();
            const step = event.shiftKey ? 9.6 : 2.8;
            let handled = true;
            setImageOverlay((prev) => {
                if (!prev) return prev;
                const map = getCurrentMapInstance();
                if (!map) return prev;

                if (key === "w") {
                    return { ...prev, coordinates: moveImageOverlayCoordinatesByPixels(map, prev.coordinates, 0, -step) };
                }
                if (key === "s") {
                    return { ...prev, coordinates: moveImageOverlayCoordinatesByPixels(map, prev.coordinates, 0, step) };
                }
                if (key === "a") {
                    return { ...prev, coordinates: moveImageOverlayCoordinatesByPixels(map, prev.coordinates, -step, 0) };
                }
                if (key === "d") {
                    return { ...prev, coordinates: moveImageOverlayCoordinatesByPixels(map, prev.coordinates, step, 0) };
                }
                if (key === "q") {
                    return {
                        ...prev,
                        coordinates: scaleImageOverlayCoordinatesByFactor(map, prev.coordinates, 1.012, prev.aspectRatio),
                    };
                }
                if (key === "e") {
                    return {
                        ...prev,
                        coordinates: scaleImageOverlayCoordinatesByFactor(map, prev.coordinates, 0.988, prev.aspectRatio),
                    };
                }

                handled = false;
                return prev;
            });

            if (handled) {
                event.preventDefault();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [getCurrentMapInstance, imageOverlayKeyboardEnabled]);

    useEffect(() => {
        const localCreatedIds = localCreatedEntityIdsRef.current;
        if (!localCreatedIds.size) return;

        const snapshotIds = new Set((snapshotEntities || []).map((entity) => String(entity.id || "")));
        setEntityCatalog((prev) => {
            let changed = false;
            const next = (prev || []).filter((entity) => {
                const id = String(entity?.id || "");
                const shouldDrop = localCreatedIds.has(id) && !snapshotIds.has(id);
                if (shouldDrop) {
                    changed = true;
                    localCreatedIds.delete(id);
                    return false;
                }
                return true;
            });
            return changed ? next : prev;
        });
    }, [snapshotEntities, setEntityCatalog]);

    // Clamp năm timeline vào range cố định trước khi đưa vào store.
    const handleTimelineYearChange = useCallback((nextYear: number) => {
        setTimelineDraftYear(clampYearToFixedRange(Math.trunc(nextYear)));
    }, [setTimelineDraftYear]);

    // Hook điều phối phát replay preview và các side effect lên map/UI.
    const replayPreview = useReplayPreview({
        replay: previewSession?.replay || null,
        draft: previewSession?.draft || EMPTY_FEATURE_COLLECTION,
        getMapInstance: getCurrentMapInstance,
        initialTimelineYear: previewSession?.timelineYear ?? timelineDraftYear,
        initialTimelineFilterEnabled: previewSession?.timelineFilterEnabled ?? timelineFilterEnabled,
        initialMapViewState: previewSession?.mapViewState ?? null,
        selectedStageId: previewSession?.selectedStageId ?? replaySelection.stageId,
        selectedStepIndex: previewSession?.selectedStepIndex ?? replaySelection.stepIndex,
        onSelectStep: () => {},
    });

    // Draft hiển thị trong preview có thể ẩn bớt geometry theo action replay.
    const replayPreviewDraft = useMemo(() => {
        const sourceDraft = previewSession?.draft || EMPTY_FEATURE_COLLECTION;
        if (!isReplayPreviewMode || replayPreview.hiddenGeometryIds.length === 0) {
            return sourceDraft;
        }
        const hiddenIds = new Set(replayPreview.hiddenGeometryIds);
        return {
            ...sourceDraft,
            features: sourceDraft.features.filter(
                (feature) => !hiddenIds.has(String(feature.properties.id))
            ),
        };
    }, [isReplayPreviewMode, previewSession?.draft, replayPreview.hiddenGeometryIds]);

    const activeTimelineYear = isReplayPreviewMode
        ? replayPreview.timelineYear
        : timelineDraftYear;
    const activeTimelineFilterEnabled = isReplayPreviewMode
        ? replayPreview.timelineFilterEnabled
        : timelineFilterEnabled;

    // Timeline filter: only affects persisted snapshot features.
    // New features created in the current session remain visible regardless of time range.
    // Draft cuối cùng đưa vào map sau khi áp filter timeline.
    const timelineVisibleDraft = useMemo(() => {
        const activeDraft = isReplayPreviewMode
            ? replayPreviewDraft
            : isReplayEditMode
                ? editor.replayDraft
                : editor.mainDraft;

        if (!activeTimelineFilterEnabled) return activeDraft;
        const year = clampYearToFixedRange(Math.trunc(activeTimelineYear));
        return {
            ...activeDraft,
            features: activeDraft.features.filter((feature) => {
                if (!editor.hasPersistedFeature(feature.properties.id)) return true;
                return isFeatureVisibleAtYear(feature, year);
            }),
        };
    }, [
        activeTimelineFilterEnabled,
        activeTimelineYear,
        editor,
        isReplayEditMode,
        isReplayPreviewMode,
        replayPreviewDraft,
    ]);

    // Danh sách feature đang chọn, map từ selectedFeatureIds sang draft hiện tại.
    const selectedFeatures = useMemo(() => {
        if (!selectedFeatureIds || selectedFeatureIds.length === 0) return [];
        return selectedFeatureIds
            .map(id => editor.draft.features.find(f => String(f.properties.id) === String(id)))
            .filter(Boolean) as Feature[];
    }, [selectedFeatureIds, editor.draft.features]);

    // Multi-edit chỉ hợp lệ khi các geometry được chọn cùng shape type.
    const isMultiEditValid = useMemo(() => {
        if (selectedFeatures.length <= 1) return true;
        const firstShape = selectedFeatures[0].geometry.type;
        return selectedFeatures.every(f => f.geometry.type === firstShape);
    }, [selectedFeatures]);

    // Feature đại diện cho panel phải; null khi multi-edit không cùng loại.
    const selectedFeature = selectedFeatures.length > 0 && isMultiEditValid ? selectedFeatures[0] : null;
    const selectedGeometryTime = useMemo(() => {
        if (!selectedFeature) return null;
        return {
            time_start: selectedFeature.properties.time_start ?? null,
            time_end: selectedFeature.properties.time_end ?? null,
        };
    }, [selectedFeature]);

    // Choices cho panel bind geometry, gồm cả marker geometry mới tạo local.
    const geometryChoices = useMemo(() => {
        const createdGeometryIds = new Set<string>();
        for (const [id, change] of editor.changes.entries()) {
            if (change.action === "create") createdGeometryIds.add(String(id));
        }
        const timelineVisibleGeometryIds = new Set(
            timelineVisibleDraft.features.map((feature) => String(feature.properties.id))
        );

        const rows = (editor.draft.features || [])
            .filter((f) => f && f.properties && (typeof f.properties.id === "string" || typeof f.properties.id === "number"))
            .map((f) => {
                const id = String(f.properties.id);
                const semantic = String(f.properties.type || getDefaultTypeIdForFeature(f) || "").trim();
                const label = semantic.length ? `${semantic} (${f.geometry.type})` : f.geometry.type;
                return {
                    id,
                    label,
                    time_start: f.properties.time_start ?? null,
                    time_end: f.properties.time_end ?? null,
                    isTimelineVisible: timelineVisibleGeometryIds.has(id),
                    isNew: createdGeometryIds.has(id) || !editor.hasPersistedFeature(f.properties.id),
                };
            });
        rows.sort((a, b) => a.id.localeCompare(b.id));
        return rows;
    }, [editor, timelineVisibleDraft.features]);

    // Binding ids của geometry đại diện đang chọn.
    const selectedGeometryBindingIds = useMemo(() => {
        if (!selectedFeature) return [];
        return normalizeFeatureBindingIds(selectedFeature);
    }, [selectedFeature]);

    // Choices wiki dùng trong replay actions và binding panel.
    const wikiChoices = useMemo(() => {
        return (snapshotWikis || [])
            .filter((wiki) => wiki && wiki.operation !== "delete")
            .map((wiki) => ({
                id: String(wiki.id || ""),
                label: `${(wiki.title || "").trim() || "Untitled wiki"} (${String(wiki.id || "")})`,
            }))
            .filter((wiki) => wiki.id.length > 0);
    }, [snapshotWikis]);

    // Dirty flag cho wiki snapshot so với baseline commit.
    const wikiDirty = useMemo(() => {
        const prev = normalizeWikisForCompare(baselineSnapshot?.wikis);
        const next = normalizeWikisForCompare(snapshotWikis);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [baselineSnapshot?.wikis, snapshotWikis]);

    // Dirty flag cho entity snapshot so với baseline commit.
    const entitiesDirty = useMemo(() => {
        const prev = normalizeEntitiesForCompare(baselineSnapshot?.entities);
        const next = normalizeEntitiesForCompare(snapshotEntities);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [baselineSnapshot?.entities, snapshotEntities]);

    // Dirty flag cho binding entity-wiki so với baseline commit.
    const entityWikiDirty = useMemo(() => {
        const prev = normalizeEntityWikiLinksForCompare(baselineSnapshot?.entity_wiki);
        const next = normalizeEntityWikiLinksForCompare(snapshotEntityWikiLinks);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [snapshotEntityWikiLinks, baselineSnapshot?.entity_wiki]);

    // Dirty flag cho replay scripts so với baseline commit.
    const replayDirty = useMemo(() => {
        const prev = normalizeReplaysForCompare(baselineSnapshot?.replays);
        const next = normalizeReplaysForCompare(editor.effectiveReplays);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [baselineSnapshot?.replays, editor.effectiveReplays]);

    // Tổng số nhóm thay đổi chưa commit, dùng để enable/disable commit UI.
    const pendingSaveCount =
        editor.changeCount
        + (wikiDirty ? 1 : 0)
        + (entitiesDirty ? 1 : 0)
        + (entityWikiDirty ? 1 : 0)
        + (replayDirty ? 1 : 0);
    // Stages của replay đang active, fallback [] để sidebar an toàn.
    const activeReplayStages = useMemo(
        () => editor.activeReplayDraft?.detail || [],
        [editor.activeReplayDraft?.detail]
    );

    // Commands thao tác project/commit/submission dựa trên draft + store hiện tại.
    const sectionCommands = useProjectCommands({
        editor,
        store: editorStoreApi,
        emptyFeatureCollection: EMPTY_FEATURE_COLLECTION,
        pendingSaveCount,
    });
    const {
        openSectionForEditing,
        commitSection,
        submitCurrentSection,
        restoreCommit,
    } = sectionCommands;

    // Thoát preview và quay về replay edit mode.
    const exitReplayPreview = useCallback(() => {
        replayPreview.resetPreview();
        setPreviewAutoplayMode(null);
        setPreviewSession(null);
        internalSetMode("replay");
    }, [internalSetMode, replayPreview.resetPreview]);

    // Đóng băng draft/replay hiện tại thành session preview để phát thử.
    const openReplayPreview = useCallback((autoplayMode: "start" | "selection") => {
        if (!editor.activeReplayDraft) return;

        setPreviewSession({
            replay: deepClone(editor.activeReplayDraft),
            draft: deepClone(editor.replayDraft),
            wikis: deepClone(snapshotWikis),
            selectedStageId: replaySelection.stageId,
            selectedStepIndex: replaySelection.stepIndex,
            timelineYear: timelineDraftYear,
            timelineFilterEnabled,
            mapViewState: getCurrentMapViewState(),
        });
        setPreviewAutoplayMode(autoplayMode);
        setSelectedFeatureIds([]);
        internalSetMode("replay_preview");
    }, [
        editor.activeReplayDraft,
        editor.replayDraft,
        getCurrentMapViewState,
        internalSetMode,
        replaySelection.stageId,
        replaySelection.stepIndex,
        setSelectedFeatureIds,
        snapshotWikis,
        timelineDraftYear,
        timelineFilterEnabled,
    ]);

    // State machine chuyển mode editor, xử lý riêng replay/replay_preview để không mất draft.
    const setMode = useCallback((m: EditorMode, featureId?: string | number) => {
        if (m === "replay_preview") {
            return;
        }

        if (mode === "replay_preview") {
            replayPreview.resetPreview();
            setPreviewAutoplayMode(null);
            setPreviewSession(null);

            if (m === "replay") {
                internalSetMode("replay");
                return;
            }

            editor.closeReplayContext();
            setSelectedFeatureIds([]);
            setReplayFeatureId(null);
            setHideOutside(false);
            setReplaySelection({ stageId: null, stepIndex: null });
            internalSetMode(m);
            return;
        }

        if (m === "replay" && featureId) {
            // QUY TẮC: Geo chọn đầu tiên là geo main.
            const triggerId = selectedFeatureIds.length > 0 ? selectedFeatureIds[0] : featureId;
            setReplayFeatureId(triggerId);
            setReplaySelection({ stageId: null, stepIndex: null });
            editor.switchReplayContext(triggerId, selectedFeatureIds);
            setSelectedFeatureIds([]);
        } else if (m !== "replay") {
            if (mode === "replay") {
                editor.closeReplayContext();
                setSelectedFeatureIds([]);
            }
            setReplayFeatureId(null);
            setHideOutside(false);
            setReplaySelection({ stageId: null, stepIndex: null });
        }
        internalSetMode(m);
    }, [
        editor,
        internalSetMode,
        mode,
        replayPreview.resetPreview,
        selectedFeatureIds,
        setHideOutside,
        setReplayFeatureId,
        setSelectedFeatureIds,
    ]);

    useEffect(() => {
        if (!activeReplayStages.length) {
            if (replaySelection.stageId != null || replaySelection.stepIndex != null) {
                setReplaySelection({ stageId: null, stepIndex: null });
            }
            return;
        }

        const targetStage =
            activeReplayStages.find((stage) => stage.id === replaySelection.stageId) ||
            activeReplayStages[0];
        const nextStageId = targetStage.id;
        let nextStepIndex: number | null = null;

        if (targetStage.steps.length > 0) {
            if (
                replaySelection.stageId === targetStage.id &&
                replaySelection.stepIndex != null &&
                replaySelection.stepIndex >= 0 &&
                replaySelection.stepIndex < targetStage.steps.length
            ) {
                nextStepIndex = replaySelection.stepIndex;
            } else {
                nextStepIndex = 0;
            }
        }

        if (
            nextStageId !== replaySelection.stageId ||
            nextStepIndex !== replaySelection.stepIndex
        ) {
            setReplaySelection({
                stageId: nextStageId,
                stepIndex: nextStepIndex,
            });
        }
    }, [activeReplayStages, replaySelection.stageId, replaySelection.stepIndex]);

    useEffect(() => {
        if (!isReplayPreviewMode || !previewSession || !previewAutoplayMode) return;
        if (previewAutoplayMode === "selection") {
            replayPreview.playFromSelection();
        } else {
            replayPreview.playFromStart();
        }
        setPreviewAutoplayMode(null);
    }, [
        isReplayPreviewMode,
        previewAutoplayMode,
        previewSession,
        replayPreview.playFromSelection,
        replayPreview.playFromStart,
    ]);

    useEffect(() => {
        setPreviewWikiCache({});
        setPreviewWikiError(null);
        setIsPreviewWikiLoading(false);
    }, [previewSession]);

    // Label ngắn cho overlay preview tại step đang phát.
    const replayPreviewActiveStepLabel = useMemo(() => {
        if (
            replayPreview.activeCursor.stageId == null ||
            replayPreview.activeCursor.stepIndex == null
        ) {
            return null;
        }
        return `Stage #${replayPreview.activeCursor.stageId} · Step ${replayPreview.activeCursor.stepIndex + 1}`;
    }, [replayPreview.activeCursor.stageId, replayPreview.activeCursor.stepIndex]);

    const replayPreviewWikiRows = previewSession?.wikis || [];
    // Wiki snapshot đang được step preview yêu cầu mở.
    const replayPreviewActiveWikiSnapshot = useMemo(() => {
        if (!replayPreview.activeWikiId) return null;
        return replayPreviewWikiRows.find((item) => item.id === replayPreview.activeWikiId) || null;
    }, [replayPreview.activeWikiId, replayPreviewWikiRows]);

    useEffect(() => {
        if (!isReplayPreviewMode || !replayPreview.sidebarOpen) {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        const activeWikiId = String(replayPreview.activeWikiId || "").trim();
        if (!activeWikiId.length) {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        const localWiki = replayPreviewWikiRows.find((item) => item.id === activeWikiId) || null;
        if (!localWiki) {
            setPreviewWikiError("Không tìm thấy wiki trong snapshot preview.");
            setIsPreviewWikiLoading(false);
            return;
        }

        if (typeof localWiki.doc === "string") {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        if (previewWikiCache[activeWikiId]) {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        let disposed = false;
        setPreviewWikiError(null);
        setIsPreviewWikiLoading(true);
        void fetchWikiById(activeWikiId)
            .then((row) => {
                if (disposed) return;
                setPreviewWikiCache((prev) => ({ ...prev, [activeWikiId]: row }));
            })
            .catch((err) => {
                if (disposed) return;
                setPreviewWikiError(err instanceof Error ? err.message : "Không tải được wiki preview.");
            })
            .finally(() => {
                if (!disposed) {
                    setIsPreviewWikiLoading(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [
        isReplayPreviewMode,
        previewWikiCache,
        replayPreview.activeWikiId,
        replayPreview.sidebarOpen,
        replayPreviewWikiRows,
    ]);

    // Wiki đầy đủ cho sidebar preview, ưu tiên doc có sẵn trong snapshot rồi mới dùng cache API.
    const replayPreviewActiveWiki = useMemo<Wiki | null>(() => {
        const snapshotWiki = replayPreviewActiveWikiSnapshot;
        if (!snapshotWiki) return null;
        if (typeof snapshotWiki.doc === "string") {
            return {
                id: snapshotWiki.id,
                project_id: projectId,
                title: snapshotWiki.title,
                slug: snapshotWiki.slug ?? null,
                content: snapshotWiki.doc || "",
            };
        }
        return previewWikiCache[snapshotWiki.id] || null;
    }, [previewWikiCache, projectId, replayPreviewActiveWikiSnapshot]);

    // Điều hướng link wiki nội bộ trong preview nhưng chỉ trong phạm vi snapshot preview.
    const handleReplayPreviewWikiLinkRequest = useCallback(({ slug }: { slug: string; rect: DOMRect }) => {
        const nextSlug = String(slug || "").trim();
        if (!nextSlug.length) return;
        const match = replayPreviewWikiRows.find((item) => String(item.slug || "").trim() === nextSlug) || null;
        if (!match) {
            setPreviewWikiError(`Wiki /wiki/${nextSlug} không có trong snapshot preview.`);
            return;
        }
        setPreviewWikiError(null);
        replayPreview.openWikiPanelById(match.id);
    }, [replayPreview.openWikiPanelById, replayPreviewWikiRows]);

    // Visibility cuối cùng theo type/layer, có override riêng cho replay edit/preview.
    const effectiveGeometryVisibility = useMemo(() => {
        const visibility: Record<string, boolean> = { ...geometryVisibility };

        if ((isReplayEditMode || isReplayPreviewMode) && replayFeatureId) {
            // Ẩn chính geo được chọn làm replay (marker kịch bản)
            visibility[String(replayFeatureId)] = false;

            if (isReplayEditMode && hideOutside) {
                // Trong mode replay, ta chỉ hiển thị những gì có trong draft của replay đó
                const currentReplayFeatureIds = new Set(editor.draft.features.map(f => String(f.properties.id)));
                
                // Ẩn tất cả các geo KHÔNG nằm trong draft replay hiện tại
                Object.keys(visibility).forEach(fid => {
                    if (fid === String(replayFeatureId)) {
                        visibility[fid] = false;
                    } else {
                        visibility[fid] = currentReplayFeatureIds.has(fid);
                    }
                });
            }
        }

        return visibility;
    }, [
        editor.draft.features,
        geometryVisibility,
        hideOutside,
        isReplayEditMode,
        isReplayPreviewMode,
        replayFeatureId,
    ]);

    // Load project editor payload, xử lý auth và pending-submission lock.
    const openProject = useCallback(async () => {
        if (!projectId) return;
        try {
            setIsOpeningSection(true);
            setEntityStatus(null);
            setBlockedPendingSubmissionId(null);
            await openSectionForEditing(projectId);
            setEntityStatus(null);
        } catch (err) {
            if (err instanceof ApiError) {
                // Only bounce to login when the session is truly unauthenticated.
                // Token refresh is handled centrally; if we still get 401 here, refresh likely failed/expired.
                if (err.status === 401) {
                    router.replace("/signin");
                    return;
                }
                // Pending submission blocks editor in BE. We parse the pending id to offer delete/unlock.
                if (err.status === 409) {
                    try {
                        const payload = JSON.parse(err.body || "{}");
                        if (payload?.pending_submission_id) {
                            setBlockedPendingSubmissionId(String(payload.pending_submission_id));
                            setEntityStatus("Project đang có submission PENDING. Hãy xoa submission đó để unlock editor.");
                            return;
                        }
                    } catch {
                        // fallthrough
                    }
                }
                setEntityStatus(`Mở project thất bại: ${err.body || err.message}`);
            } else {
                console.error("Open project failed", err);
                setEntityStatus("Mở project thất bại.");
            }
        } finally {
            setIsOpeningSection(false);
        }
    }, [openSectionForEditing, projectId, router, setBlockedPendingSubmissionId, setEntityStatus, setIsOpeningSection]);

    // Xóa pending submission để backend cho phép mở editor lại.
    const unlockByDeletingPendingSubmission = useCallback(async () => {
        if (!blockedPendingSubmissionId) return;
        const confirmed = window.confirm("Xoa submission PENDING de unlock editor? Hanh dong nay khong the hoan tac.");
        if (!confirmed) return;
        try {
            setIsOpeningSection(true);
            setEntityStatus(null);
            await deleteSubmission(blockedPendingSubmissionId);
            setBlockedPendingSubmissionId(null);
            await openProject();
        } catch (err) {
            if (err instanceof ApiError) {
                setEntityStatus(`Khong the xoa submission: ${err.body || err.message}`);
            } else {
                setEntityStatus("Khong the xoa submission.");
            }
        } finally {
            setIsOpeningSection(false);
        }
    }, [blockedPendingSubmissionId, openProject, setBlockedPendingSubmissionId, setEntityStatus, setIsOpeningSection]);

    useEffect(() => {
        let disposed = false;

        async function ensureAuthenticated() {
            try {
                await fetchCurrentUser();
            } catch (err) {
                if (disposed) return;
                if (err instanceof ApiError && err.status === 401) {
                    // Only redirect when refresh token/session is no longer usable.
                    router.replace("/signin");
                    return;
                }
                console.error("Ensure authenticated failed", err);
            }
        }

        ensureAuthenticated();
        return () => {
            disposed = true;
        };
    }, [router]);

    useEffect(() => {
        if (!projectId) return;
        if (openedProjectIdRef.current === projectId) return;

        openProject()
            .then(() => {
                openedProjectIdRef.current = projectId;
            })
            .catch(() => {
                // allow retry if openProject threw outside its try/catch (should be rare)
                openedProjectIdRef.current = null;
            });
    }, [openProject, projectId]);

    useEffect(() => {
        let disposed = false;

        async function loadEntities() {
            try {
                const rows = await fetchEntities();
                if (disposed) return;

                setEntityCatalog((prev) => {
                    const byId = new globalThis.Map<string, Entity>();
                    for (const row of prev || []) {
                        if (!row?.id) continue;
                        byId.set(String(row.id), row);
                    }
                    for (const row of rows || []) {
                        if (!row?.id) continue;
                        // Prefer the freshest backend payload on conflicts.
                        byId.set(String(row.id), row);
                    }
                    return Array.from(byId.values());
                });
                setEntityStatus(null);
            } catch (err) {
                if (disposed) return;
                console.error("Load entities failed", err);
                setEntityStatus("Không tải được danh sách entity.");
            }
        }

        loadEntities();

        return () => {
            disposed = true;
        };
    }, [setEntityCatalog, setEntityStatus]);

    useEffect(() => {
        if (searchKind !== "entity") {
            setEntitySearchResults([]);
            setIsEntitySearchLoading(false);
            return;
        }

        const keyword = searchQuery.trim();
        if (!keyword.length) {
            setEntitySearchResults([]);
            setIsEntitySearchLoading(false);
            return;
        }

        let disposed = false;
        const requestId = ++entitySearchRequestRef.current;
        const timeoutId = window.setTimeout(async () => {
            const keywordLower = keyword.toLowerCase();
            const localMatches = entitiesRef.current
                .filter((entity) =>
                    entity.name.toLowerCase().includes(keywordLower) ||
                    (entity.description || "").toLowerCase().includes(keywordLower)
                )
                .map<Entity>((entity) => ({
                    ...entity,
                    geometry_count: typeof entity.geometry_count === "number" ? entity.geometry_count : 0,
                }));

            setIsEntitySearchLoading(true);
            try {
                const rows = await searchEntitiesByName(keyword, { limit: 30 });
                if (disposed || requestId !== entitySearchRequestRef.current) return;
                // Centralize: merge search results into the shared entity catalog so UI stays consistent.
                setEntityCatalog((prev) => {
                    const byId = new globalThis.Map<string, Entity>();
                    for (const row of prev || []) {
                        if (!row?.id) continue;
                        byId.set(String(row.id), row);
                    }
                    for (const row of rows || []) {
                        if (!row?.id) continue;
                        byId.set(String(row.id), row);
                    }
                    return Array.from(byId.values());
                });

                const mergedRows = mergeEntitySearchResults(rows, localMatches);
                setEntitySearchResults(mergedRows);
            } catch (err) {
                if (disposed || requestId !== entitySearchRequestRef.current) return;
                console.error("Search entity by name failed", err);
                setEntitySearchResults(localMatches);
            } finally {
                if (!disposed && requestId === entitySearchRequestRef.current) {
                    setIsEntitySearchLoading(false);
                }
            }
        }, 220);

        return () => {
            disposed = true;
            window.clearTimeout(timeoutId);
        };
    }, [
        searchKind,
        searchQuery,
        setEntityCatalog,
        setEntitySearchResults,
        setIsEntitySearchLoading,
    ]);

    useEffect(() => {
        if (searchKind !== "wiki") {
            setWikiSearchResults([]);
            setIsWikiSearching(false);
            return;
        }

        const keyword = searchQuery.trim();
        if (!keyword.length) {
            setWikiSearchResults([]);
            setIsWikiSearching(false);
            return;
        }

        let disposed = false;
        const requestId = ++wikiSearchRequestRef.current;
        const timeoutId = window.setTimeout(async () => {
            setIsWikiSearching(true);
            try {
                const rows = await searchWikisByTitle(keyword, { limit: 12 });
                if (disposed || requestId !== wikiSearchRequestRef.current) return;
                setWikiSearchResults(rows);
            } catch (err) {
                if (disposed || requestId !== wikiSearchRequestRef.current) return;
                console.error("Search wikis failed", err);
                setWikiSearchResults([]);
            } finally {
                if (!disposed && requestId === wikiSearchRequestRef.current) {
                    setIsWikiSearching(false);
                }
            }
        }, 250);

        return () => {
            disposed = true;
            window.clearTimeout(timeoutId);
        };
    }, [searchKind, searchQuery, setIsWikiSearching, setWikiSearchResults]);

    useEffect(() => {
        if (searchKind !== "geo") {
            setGeoSearchResults([]);
            setIsGeoSearching(false);
            return;
        }

        const keyword = searchQuery.trim();
        if (!keyword.length) {
            setGeoSearchResults([]);
            setIsGeoSearching(false);
            return;
        }

        let disposed = false;
        const requestId = ++geoSearchRequestRef.current;
        const timeoutId = window.setTimeout(async () => {
            setIsGeoSearching(true);
            try {
                const res = await searchGeometriesByEntityName(keyword, { limit: 24 });
                if (disposed || requestId !== geoSearchRequestRef.current) return;
                setGeoSearchResults(res.items || []);
            } catch (err) {
                if (disposed || requestId !== geoSearchRequestRef.current) return;
                console.error("Search geometries by entity name failed", err);
                setGeoSearchResults([]);
            } finally {
                if (!disposed && requestId === geoSearchRequestRef.current) {
                    setIsGeoSearching(false);
                }
            }
        }, 260);

        return () => {
            disposed = true;
            window.clearTimeout(timeoutId);
        };
    }, [searchKind, searchQuery, setGeoSearchResults, setIsGeoSearching]);

    useEffect(() => {
        if (!selectedFeatureIds || selectedFeatureIds.length === 0) return;
        const stillExistIds = selectedFeatureIds.filter(id =>
            timelineVisibleDraft.features.some(feature => String(feature.properties.id) === String(id))
        );
        if (stillExistIds.length !== selectedFeatureIds.length) {
            setSelectedFeatureIds(stillExistIds);
        }
    }, [timelineVisibleDraft, selectedFeatureIds, setSelectedFeatureIds]);

    useEffect(() => {
        if (!selectedFeature) {
            setSelectedGeometryEntityIds([]);
            setGeometryMetaForm({
                type_key: "",
                time_start: "",
                time_end: "",
                binding: "",
            });
            setEntityFormStatus(null);
            lastSelectedFeatureIdRef.current = null;
            return;
        }

        const featureEntityIds = normalizeFeatureEntityIds(selectedFeature);
        const nextTypeKey = typeof selectedFeature.properties.type === "string" && selectedFeature.properties.type.trim().length
            ? selectedFeature.properties.type
            : getDefaultTypeIdForFeature(selectedFeature);
        const currentId = String(selectedFeature.properties.id);
        setSelectedGeometryEntityIds(featureEntityIds);
        setGeometryMetaForm({
            type_key: nextTypeKey,
            time_start: selectedFeature.properties.time_start != null
                ? String(selectedFeature.properties.time_start)
                : "",
            time_end: selectedFeature.properties.time_end != null
                ? String(selectedFeature.properties.time_end)
                : "",
            binding: normalizeFeatureBindingIds(selectedFeature).join(", "),
        });
        // Only clear status when switching to a different geometry, not when patching metadata/bindings
        // on the same selected geometry (otherwise messages will blink).
        if (lastSelectedFeatureIdRef.current !== currentId) {
            setEntityFormStatus(null);
        }
        lastSelectedFeatureIdRef.current = currentId;
    }, [
        selectedFeature,
        setEntityFormStatus,
        setGeometryMetaForm,
        setSelectedGeometryEntityIds,
    ]);

    // Hiển thị status form entity trong thời gian ngắn, tự clear timer cũ.
    const flashEntityFormStatus = useCallback((msg: string | null, timeoutMs = 3000) => {
        if (entityFormStatusTimeoutRef.current) {
            window.clearTimeout(entityFormStatusTimeoutRef.current);
            entityFormStatusTimeoutRef.current = null;
        }
        setEntityFormStatus(msg);
        if (msg && timeoutMs > 0) {
            entityFormStatusTimeoutRef.current = window.setTimeout(() => {
                setEntityFormStatus(null);
                entityFormStatusTimeoutRef.current = null;
            }, timeoutMs);
        }
    }, [setEntityFormStatus]);

    // Hiển thị status binding geometry trong thời gian ngắn, tự clear timer cũ.
    const flashGeoBindingStatus = useCallback((msg: string | null, timeoutMs = 3000) => {
        if (geoBindingStatusTimeoutRef.current) {
            window.clearTimeout(geoBindingStatusTimeoutRef.current);
            geoBindingStatusTimeoutRef.current = null;
        }
        setGeoBindingStatus(msg);
        if (msg && timeoutMs > 0) {
            geoBindingStatusTimeoutRef.current = window.setTimeout(() => {
                setGeoBindingStatus(null);
                geoBindingStatusTimeoutRef.current = null;
            }, timeoutMs);
        }
    }, [setGeoBindingStatus]);

    useEffect(() => {
        setBackgroundVisibility(loadBackgroundLayerVisibilityFromStorage());
        setIsBackgroundVisibilityReady(true);
    }, [setBackgroundVisibility, setIsBackgroundVisibilityReady]);

    // Thêm entity backend vào snapshot project dưới dạng reference.
    const handleAddEntityRefToProject = useCallback((entity: Entity) => {
        const id = String(entity.id || "").trim();
        if (!id) return;
        editor.setSnapshotEntities((prev) => {
            if (prev.some((e) => String(e.id) === id)) return prev;
            return [
                {
                    id,
                    source: "ref",
                    operation: "reference",
                    name: entity.name,
                    description: entity.description ?? null,
                    time_start: entity.time_start ?? null,
                    time_end: entity.time_end ?? null,
                },
                ...prev,
            ];
        }, `Thêm entity ref #${id}`);
        // Keep entity catalog centralized as a single in-memory list.
        setEntityCatalog((prev) => {
            const byId = new globalThis.Map<string, Entity>();
            for (const row of prev || []) {
                if (!row?.id) continue;
                byId.set(String(row.id), row);
            }
            byId.set(id, entity);
            return Array.from(byId.values());
        });
    }, [editor, setEntityCatalog]);

    // Cập nhật metadata entity trong snapshot project, có undo qua editor state.
    const handleUpdateEntityInProject = useCallback((entityId: string, payload: { name: string; description: string | null; time_start: string; time_end: string }) => {
        const id = String(entityId || "").trim();
        if (!id) return;
        const nextName = String(payload?.name || "").trim();
        if (!nextName.length) {
            flashEntityFormStatus("Ten entity la bat buoc.");
            return;
        }
        const nextDescription = payload?.description == null ? null : String(payload.description);
        let nextTimeStart: number | undefined;
        let nextTimeEnd: number | undefined;
        try {
            nextTimeStart = parseOptionalEntityYearInput(payload.time_start, "time_start");
            nextTimeEnd = parseOptionalEntityYearInput(payload.time_end, "time_end");
            if (nextTimeStart != null && nextTimeEnd != null && nextTimeStart > nextTimeEnd) {
                flashEntityFormStatus("time_start phải <= time_end.");
                return;
            }
        } catch (err) {
            flashEntityFormStatus(err instanceof Error ? err.message : "Năm entity không hợp lệ.");
            return;
        }

        editor.setSnapshotEntities((prev) => prev.map((e) => {
            if (!e || String(e.id) !== id) return e;
            const source = e.source === "inline" ? "inline" : "ref";
            const operation =
                source === "ref"
                    ? "reference"
                    : e.operation === "create"
                        ? "create"
                        : "update";
            return {
                ...e,
                id,
                source,
                operation,
                name: nextName,
                description: nextDescription,
                time_start: nextTimeStart,
                time_end: nextTimeEnd,
            };
        }), `Cap nhat entity #${id}`);
        flashEntityFormStatus("Da cap nhat entity. Commit khi san sang.", 3000);
    }, [editor, flashEntityFormStatus]);

    // Bind/unbind entity vào toàn bộ selected geometry hợp lệ.
    const handleToggleBindEntityForSelectedGeometry = useCallback((entityId: string, nextChecked: boolean) => {
        if (!selectedFeatures || selectedFeatures.length === 0) {
            flashEntityFormStatus("Chưa chọn geometry để bind entity.");
            return;
        }
        if (!isMultiEditValid) {
            flashEntityFormStatus("Không thể bind entity cho nhiều geometry khác loại.");
            return;
        }
        const id = String(entityId || "").trim();
        if (!id) return;
        const nextEntityIds = (() => {
            const prev = selectedGeometryEntityIds;
            const has = prev.includes(id);
            if (nextChecked) {
                if (has) return prev;
                return uniqueEntityIds([...prev, id]);
            }
            if (!has) return prev;
            return prev.filter((x) => x !== id);
        })();

        setIsEntitySubmitting(true);
        flashEntityFormStatus(null, 0);
        try {
            editor.patchFeaturePropertiesBatch(
                selectedFeatures.map((feature) => ({
                    id: feature.properties.id,
                    patch: buildFeatureEntityPatch(feature, nextEntityIds, entities),
                })),
                nextChecked ? "Bind entity vào GEO" : "Unbind entity khỏi GEO"
            );
            setSelectedGeometryEntityIds(nextEntityIds);
            flashEntityFormStatus(
                nextChecked
                    ? "Đã bind entity vào geometry. Commit khi sẵn sàng."
                    : "Đã unbind entity khỏi geometry. Commit khi sẵn sàng.",
                3000
            );
        } finally {
            setIsEntitySubmitting(false);
        }
    }, [
        editor,
        entities,
        flashEntityFormStatus,
        selectedFeatures,
        isMultiEditValid,
        selectedGeometryEntityIds,
        setIsEntitySubmitting,
        setSelectedGeometryEntityIds,
    ]);

    // Bind/unbind geometry id vào trường binding của selected geometry.
    const handleToggleBindGeometryForSelectedGeometry = useCallback((geoId: string, nextChecked: boolean) => {
        if (!selectedFeatures || selectedFeatures.length === 0) {
            flashGeoBindingStatus("Chưa chọn geometry để bind.");
            return;
        }
        if (!isMultiEditValid) {
            flashGeoBindingStatus("Không thể bind geometry cho nhiều geometry khác loại.");
            return;
        }
        const id = String(geoId || "").trim();
        if (!id) return;
        if (selectedFeatures.some(f => String(f.properties.id) === id)) return;



        setIsEntitySubmitting(true);
        flashGeoBindingStatus(null, 0);
        try {
            const bindingPatches = selectedFeatures.map((feature) => {
                const prevBindingIds = normalizeFeatureBindingIds(feature);
                const has = prevBindingIds.includes(id);
                const nextBindingIds = (() => {
                    if (nextChecked) {
                        if (has) return prevBindingIds;
                        return [...prevBindingIds, id];
                    }
                    if (!has) return prevBindingIds;
                    return prevBindingIds.filter((x) => x !== id);
                })();
                return {
                    id: feature.properties.id,
                    patch: { binding: nextBindingIds },
                };
            });
            editor.patchFeaturePropertiesBatch(
                bindingPatches,
                nextChecked ? "Bind geometry vào GEO" : "Unbind geometry khỏi GEO"
            );

            // Assume selectedFeature (the first one) reflects the representative binding in UI
            const firstFeaturePrevBindings = normalizeFeatureBindingIds(selectedFeatures[0]);
            const firstFeatureHas = firstFeaturePrevBindings.includes(id);
            const nextBindingIdsForUI = (() => {
                if (nextChecked) return firstFeatureHas ? firstFeaturePrevBindings : [...firstFeaturePrevBindings, id];
                return firstFeatureHas ? firstFeaturePrevBindings.filter(x => x !== id) : firstFeaturePrevBindings;
            })();
            setGeometryMetaForm((prev) => ({ ...prev, binding: nextBindingIdsForUI.join(", ") }));
            flashGeoBindingStatus(
                nextChecked
                    ? "Đã bind geometry vào binding. Commit khi sẵn sàng."
                    : "Đã gỡ binding geometry. Commit khi sẵn sàng.",
                3000
            );
        } finally {
            setIsEntitySubmitting(false);
        }
    }, [
        editor,
        flashGeoBindingStatus,
        selectedFeatures,
        isMultiEditValid,
        setGeometryMetaForm,
        setIsEntitySubmitting,
    ]);

    // Bind nhiều geometries vào target geometry.
    const handleBindGeometries = useCallback((targetId: string | number, sourceIds: (string | number)[]) => {
        const idStr = String(targetId).trim();
        if (!idStr) return;

        const targetFeature = editor.draft.features.find((f) => String(f.properties.id) === idStr);
        if (!targetFeature) {
            flashGeoBindingStatus("Không tìm thấy geometry đích.");
            return;
        }

        const prevBindingIds = normalizeFeatureBindingIds(targetFeature);
        
        // Merge prevBindingIds with sourceIds (which are strings of selected features)
        // filter out targetId itself (we can't bind a geometry to itself)
        const newSources = sourceIds.map(String).filter((x) => x !== idStr);
        const merged = Array.from(new Set([...prevBindingIds, ...newSources]));

        editor.patchFeaturePropertiesBatch(
            [{
                id: targetFeature.properties.id,
                patch: { binding: merged },
            }],
            "Bind các geometry đã chọn vào GEO"
        );

        setSelectedFeatureIds([targetFeature.properties.id]);
        flashGeoBindingStatus(`Đã bind ${newSources.length} geometry vào GEO này. Commit khi sẵn sàng.`, 3000);
    }, [editor, flashGeoBindingStatus, setSelectedFeatureIds]);

    // Focus/zoom tới geometry từ binding panel; nếu geo có time_start thì kéo year filter về năm đó.
    const handleFocusGeometryFromBindingPanel = useCallback((geoId: string) => {
        const id = String(geoId || "").trim();
        if (!id) return;

        const feature = editor.draft.features.find((item) => String(item.properties.id) === id) || null;
        if (!feature) {
            flashGeoBindingStatus("Không tìm thấy geometry để zoom.");
            return;
        }

        const geoTimeStart = feature.properties.time_start;
        if (typeof geoTimeStart === "number" && Number.isFinite(geoTimeStart)) {
            setTimelineDraftYear(clampYearToFixedRange(Math.trunc(geoTimeStart)));
        }

        setSelectedFeatureIds([feature.properties.id]);
        setGeometryFocusRequest((prev) => ({
            key: (prev?.key ?? 0) + 1,
            collection: {
                type: "FeatureCollection",
                features: [feature],
            },
        }));
    }, [
        editor.draft.features,
        flashGeoBindingStatus,
        setGeometryFocusRequest,
        setSelectedFeatureIds,
        setTimelineDraftYear,
    ]);

    const handleHideGeometryLocal = useCallback((geoId: string | number) => {
        const id = String(geoId || "").trim();
        if (!id) return;
        setGeometryVisibility((prev) => ({
            ...prev,
            [id]: false,
        }));
        setSelectedFeatureIds((prev) => prev.filter((item) => String(item) !== id));
    }, [setGeometryVisibility, setSelectedFeatureIds]);

    // Thêm wiki backend vào snapshot project dưới dạng reference.
    const handleAddWikiRefToProject = useCallback((wiki: Wiki) => {
        const id = String(wiki.id || "").trim();
        if (!id) return;
        const title = (wiki.title || "").trim() || "Untitled wiki";
        editor.setSnapshotWikis((prev) => {
            if (prev.some((w) => w.id === id)) return prev;
            return [
                {
                    id,
                    source: "ref",
                    operation: "reference",
                    title,
                    doc: null,
                },
                ...prev,
            ];
        }, `Thêm wiki ref #${id}`);
        setRequestedActiveWikiId(id);
    }, [editor, setRequestedActiveWikiId]);

    // Tạo image overlay từ file local, mặc định phủ theo viewport map hiện tại.
    const handlePickImageOverlay = useCallback((file: File | null) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setEntityStatus("File overlay phải là ảnh.");
            return;
        }

        const map = getCurrentMapInstance();
        if (!map) {
            setEntityStatus("Map chưa sẵn sàng để thêm ảnh overlay.");
            return;
        }

        const nextUrl = URL.createObjectURL(file);
        void readImageAspectRatio(nextUrl)
            .then((aspectRatio) => {
                const previousUrl = imageOverlayObjectUrlRef.current;
                imageOverlayObjectUrlRef.current = nextUrl;
                setImageOverlay((prev) => ({
                    url: nextUrl,
                    name: file.name || "Trace image",
                    opacity: prev?.opacity ?? 0.55,
                    aspectRatio,
                    coordinates: getViewportImageCoordinates(map, aspectRatio),
                }));
                if (previousUrl) {
                    URL.revokeObjectURL(previousUrl);
                }
            })
            .catch((err) => {
                console.error("Read image size failed", err);
                URL.revokeObjectURL(nextUrl);
                setEntityStatus("Không đọc được kích thước ảnh overlay.");
            });
    }, [getCurrentMapInstance, setEntityStatus]);

    // Đọc ảnh trực tiếp từ clipboard và dùng làm overlay trace.
    const handlePasteImageOverlay = useCallback(async () => {
        if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
            setEntityStatus("Trình duyệt không hỗ trợ paste ảnh từ clipboard.");
            return;
        }

        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find((type) => type.startsWith("image/"));
                if (!imageType) continue;
                const blob = await item.getType(imageType);
                const extension = imageType.split("/")[1] || "png";
                const file = new File([blob], `clipboard-image.${extension}`, { type: imageType });
                handlePickImageOverlay(file);
                return;
            }
            setEntityStatus("Clipboard không có ảnh để paste.");
        } catch (err) {
            console.error("Paste image overlay failed", err);
            setEntityStatus("Không paste được ảnh. Hãy cấp quyền clipboard hoặc dùng nút Thêm ảnh.");
        }
    }, [handlePickImageOverlay, setEntityStatus]);

    // Chỉnh opacity của image overlay mà không đổi vị trí/ảnh.
    const handleImageOverlayOpacityChange = useCallback((opacity: number) => {
        const nextOpacity = Number.isFinite(opacity)
            ? Math.max(0, Math.min(1, opacity))
            : 0.55;
        setImageOverlay((prev) => prev ? { ...prev, opacity: nextOpacity } : prev);
    }, []);

    // Xóa image overlay khỏi map và revoke object URL local.
    const handleRemoveImageOverlay = useCallback(() => {
        if (imageOverlayObjectUrlRef.current) {
            URL.revokeObjectURL(imageOverlayObjectUrlRef.current);
            imageOverlayObjectUrlRef.current = null;
        }
        setImageOverlay(null);
        setImageOverlayKeyboardEnabled(false);
    }, []);

    // Import geometry từ kết quả search GEO vào draft hiện tại và bind entity liên quan.
    const handleImportGeoFromSearch = useCallback((
        entityItem: EntityGeometriesSearchItem,
        geo: EntityGeometrySearchGeo
    ) => {
        const geoId = String(geo?.id || "").trim();
        if (!geoId) return;

        // Ensure the geometry stays selectable even if it doesn't match the current timeline year.
        setTimelineFilterEnabled(false);

        const importedEntity: Entity = {
            id: entityItem.entity_id,
            name: (entityItem.name || "").trim() || entityItem.entity_id,
            description: (entityItem.description || "").trim() || null,
            geometry_count: 0,
        };

        const existing = editor.draft.features.find((f) => String(f.properties.id) === geoId) || null;
        if (existing) {
            // Keep entity store consistent: importing/selecting a geo implies the entity should exist in snapshot + catalog.
            handleAddEntityRefToProject(importedEntity);
            setSelectedFeatureIds([existing.properties.id]);
            flashEntityFormStatus("Đã chọn geometry từ kết quả search.", 3000);
            return;
        }

        const geometry = normalizeGeoSearchGeometry(geo.draw_geometry);
        if (!geometry) {
            flashEntityFormStatus("Không import được: draw_geometry không hợp lệ.", 3000);
            return;
        }

        const bindingIds = normalizeGeoSearchBindingIds(geo.binding);
        const typeKey = geo.type || null;

        const feature: Feature = {
            type: "Feature",
            properties: {
                id: geoId,
                type: typeKey,
                time_start: typeof geo.time_start === "number" ? geo.time_start : null,
                time_end: typeof geo.time_end === "number" ? geo.time_end : null,
                binding: bindingIds.length ? bindingIds : undefined,
                entity_id: entityItem.entity_id,
                entity_ids: [entityItem.entity_id],
                entity_name: (entityItem.name || "").trim() || entityItem.entity_id,
                entity_names: [(entityItem.name || "").trim() || entityItem.entity_id],
            },
            geometry,
        };

        editor.createFeatureWithSnapshotEntities(
            feature,
            (prev) => {
                if (prev.some((e) => String(e.id) === importedEntity.id)) return prev;
                return [
                    {
                        id: importedEntity.id,
                        source: "ref",
                        operation: "reference",
                        name: importedEntity.name,
                        description: importedEntity.description ?? null,
                    },
                    ...prev,
                ];
            },
            `Import GEO #${geoId}`
        );
        setEntityCatalog((prev) => {
            const byId = new globalThis.Map<string, Entity>();
            for (const row of prev || []) {
                if (!row?.id) continue;
                byId.set(String(row.id), row);
            }
            byId.set(importedEntity.id, importedEntity);
            return Array.from(byId.values());
        });
        setSelectedFeatureIds([feature.properties.id]);
        flashEntityFormStatus("Đã import geometry từ search GEO. Commit khi sẵn sàng.", 3000);
    }, [
        editor,
        flashEntityFormStatus,
        handleAddEntityRefToProject,
        setEntityCatalog,
        setSelectedFeatureIds,
        setTimelineFilterEnabled,
    ]);

    // Commands thao tác metadata/entity binding cho feature đang chọn.
    const featureCommands = useFeatureCommands({
        editor,
        selectedFeatures,
        geometryMetaForm,
        setGeometryMetaForm,
        selectedGeometryEntityIds,
        setSelectedGeometryEntityIds,
        entities,
        setIsEntitySubmitting,
        setEntityFormStatus,
    });

    // Tạo entity inline chỉ trong snapshot local, chưa gọi backend cho tới khi commit.
    const handleCreateEntityOnly = async () => {
        const name = entityForm.name.trim();
        if (!name) {
            setEntityFormStatus("Tên entity là bắt buộc.");
            return;
        }

        const description = entityForm.description.trim() || null;
        let timeStart: number | undefined;
        let timeEnd: number | undefined;
        try {
            timeStart = parseOptionalEntityYearInput(entityForm.time_start, "time_start");
            timeEnd = parseOptionalEntityYearInput(entityForm.time_end, "time_end");
            if (timeStart != null && timeEnd != null && timeStart > timeEnd) {
                setEntityFormStatus("time_start phải <= time_end.");
                return;
            }
        } catch (err) {
            setEntityFormStatus(err instanceof Error ? err.message : "Năm entity không hợp lệ.");
            return;
        }
        const normalizedName = name.toLowerCase();
        const duplicatedName = entities.some((entity) => entity.name.trim().toLowerCase() === normalizedName);
        if (duplicatedName) {
            setEntityFormStatus("Tên entity đã tồn tại.");
            return;
        }

        const entityId = buildClientEntityId();
        const createdEntity: Entity = {
            id: entityId,
            name,
            description,
            time_start: timeStart ?? null,
            time_end: timeEnd ?? null,
            geometry_count: 0,
        };

        setIsEntitySubmitting(true);
        setEntityFormStatus(null);
        try {
            editor.setSnapshotEntities((prev) => {
                if (prev.some((e) => String(e.id) === entityId)) return prev;
                return [
                    {
                        id: entityId,
                        source: "inline",
                        operation: "create",
                        name,
                        description,
                        time_start: timeStart,
                        time_end: timeEnd,
                    },
                    ...prev,
                ];
            }, `Tạo entity #${entityId}`);
            localCreatedEntityIdsRef.current.add(entityId);
            setEntityCatalog((prev) => {
                const byId = new globalThis.Map<string, Entity>();
                for (const row of prev || []) {
                    if (!row?.id) continue;
                    byId.set(String(row.id), row);
                }
                byId.set(entityId, createdEntity);
                return Array.from(byId.values());
            });

            setEntityForm((prev) => ({
                ...prev,
                name: "",
                description: "",
                time_start: "",
                time_end: "",
            }));
            setEntityStatus(null);
            setEntityFormStatus("Đã tạo entity mới (local). Commit khi sẵn sàng.");
        } finally {
            setIsEntitySubmitting(false);
        }
    };

    // Commit head hiện tại để hiển thị label lịch sử.
    const headCommit = projectState?.head_commit_id
        ? sectionCommits.find((commit) => commit.id === projectState.head_commit_id) || null
        : null;

    // Tạo geometry từ map engine rồi select ngay geometry mới.
    const handleCreateFeature = (feature: Feature) => {
        editor.createFeature(feature);
        setSelectedFeatureIds([feature.properties.id]);
    };

    // Draft nguồn dùng để render label trong map khi preview đang dùng draft đóng băng.
    const mapLabelSourceDraft = isReplayPreviewMode
        ? previewSession?.draft || EMPTY_FEATURE_COLLECTION
        : editor.draft;
    const mapLabelContextDraft = useMemo(
        () => buildEntityLabelContextDraft(mapLabelSourceDraft, entities),
        [entities, mapLabelSourceDraft]
    );

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {!isReplayEditMode && !isReplayPreviewMode ? (
                <>
                    <Editor
                        mode={mode}
                        setMode={setMode}
                        entityStatus={entityStatus}
                        onUndo={editor.undo}
                        onCommit={commitSection}
                        onSubmit={submitCurrentSection}
                        onRestoreCommit={restoreCommit}
                        isSaving={isSaving}
                        isSubmitting={isSubmitting}
                        sectionTitle={activeSection?.title || "Đang tải project"}
                        projectStatus={projectState?.status || "editing"}
                        commitTitle={commitTitle}
                        onCommitTitleChange={setCommitTitle}
                        commitCount={sectionCommits.length}
                        hasHeadCommit={Boolean(projectState?.head_commit_id)}
                        headCommitId={projectState?.head_commit_id || null}
                        latestCommitLabel={headCommit ? `Head: ${formatCommitTitle(headCommit)}` : null}
                        commits={sectionCommits}
                        changesCount={pendingSaveCount}
                        undoStack={editor.undoStack}
                        width={leftPanelWidth}
                    />

                    <ResizeHandle
                        title="Resize left panel"
                        onDrag={(deltaX) => {
                            setLeftPanelWidth((prev) => clampNumber(prev + deltaX, 220, 520));
                        }}
                    />
                </>
            ) : isReplayEditMode ? (
                <>
                    <ReplayTimelineSidebar
                        width={leftPanelWidth}
                        replay={editor.activeReplayDraft}
                        selectedStageId={replaySelection.stageId}
                        selectedStepIndex={replaySelection.stepIndex}
                        pendingSaveCount={pendingSaveCount}
                        replayUndoStack={editor.replayUndoStack}
                        canUndoReplay={editor.canUndoReplay}
                        onSelectStep={handleReplaySelectionChange}
                        onMutateReplay={editor.mutateActiveReplay}
                        onUndoReplay={editor.undo}
                        onExitReplay={() => setMode("select")}
                        isPreviewPlaying={false}
                        previewPlaybackSpeed={1}
                        onPlayPreviewFromStart={() => openReplayPreview("start")}
                        onPlayPreviewFromSelection={() => openReplayPreview("selection")}
                        onStopPreview={() => {}}
                        onResetPreview={() => {}}
                    />
                    <ResizeHandle
                        title="Resize left panel"
                        onDrag={(deltaX) => {
                            setLeftPanelWidth((prev) => clampNumber(prev + deltaX, 220, 520));
                        }}
                    />
                </>
            ) : null}

            {blockedPendingSubmissionId ? (
                <div style={{ flex: 1, minHeight: "100vh", background: "#0b1220", color: "white", padding: "24px" }}>
                    <div style={{ maxWidth: 720 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Editor dang bi khoa</h2>
                        <div style={{ marginTop: 10, fontSize: 13, color: "#cbd5e1" }}>
                            Project nay dang co submission o trang thai <b>PENDING</b> (id:{" "}
                            <code style={{ color: "white" }}>{blockedPendingSubmissionId}</code>). Theo BE moi, khi
                            submission dang pending thi khong duoc tao submission/commit moi va khong duoc vao editor.
                        </div>
                        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
                            <button
                                onClick={unlockByDeletingPendingSubmission}
                                disabled={isOpeningSection}
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 6,
                                    border: "1px solid #334155",
                                    background: isOpeningSection ? "#334155" : "#ef4444",
                                    color: "white",
                                    cursor: isOpeningSection ? "not-allowed" : "pointer",
                                }}
                            >
                                Xoa submission pending de unlock
                            </button>
                            <button
                                onClick={() => router.push("/user/projects")}
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 6,
                                    border: "1px solid #334155",
                                    background: "#111827",
                                    color: "white",
                                    cursor: "pointer",
                                }}
                            >
                                Quay lai danh sach projects
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {!blockedPendingSubmissionId ? (
                <div style={{ flex: 1, position: "relative", minHeight: "100vh" }}>
                    {isBackgroundVisibilityReady ? (
                        <Map
                            ref={mapHandleRef}
                            mode={mode}
                            onSetMode={setMode}
                            draft={timelineVisibleDraft}
                            labelContextDraft={mapLabelContextDraft}
                            labelTimelineYear={activeTimelineFilterEnabled ? activeTimelineYear : null}
                            selectedFeatureIds={selectedFeatureIds}
                            onSelectFeatureIds={setSelectedFeatureIds}
                            onCreateFeature={handleCreateFeature}
                            onDeleteFeature={editor.deleteFeature}
                            onHideFeature={handleHideGeometryLocal}
                            onUpdateFeature={editor.updateFeature}
                            backgroundVisibility={backgroundVisibility}
                            geometryVisibility={effectiveGeometryVisibility}
                            respectBindingFilter={isReplayEditMode || isReplayPreviewMode ? false : geometryBindingFilterEnabled}
                            highlightFeatures={null}
                            focusFeatureCollection={geometryFocusRequest?.collection || null}
                            focusRequestKey={geometryFocusRequest?.key ?? null}
                            focusPadding={96}
                            imageOverlay={imageOverlay}
                            onImageOverlayChange={setImageOverlay}
                            onBindGeometries={handleBindGeometries}
                        />
                    ) : (
                        <div style={{ width: "100%", height: "100%", background: "#0b1220" }} />
                    )}
                    {isReplayPreviewMode ? (
                        <ReplayPreviewOverlay
                            isPreviewMode={true}
                            isPlaying={replayPreview.isPlaying}
                            title={replayPreview.title}
                            descriptions={replayPreview.descriptions}
                            subtitle={replayPreview.subtitle}
                            dialog={replayPreview.dialog}
                            image={replayPreview.image}
                            toasts={replayPreview.toasts}
                            sidebarOpen={replayPreview.sidebarOpen}
                            playbackSpeed={replayPreview.playbackSpeed}
                            activeStepLabel={replayPreviewActiveStepLabel}
                            activeStepNumber={replayPreview.activeStepNumber}
                            totalSteps={replayPreview.totalSteps}
                            onPlayPreview={replayPreview.playFromStart}
                            onStopPreview={replayPreview.stopPreview}
                            onResetPreview={replayPreview.resetPreview}
                            onExitPreview={exitReplayPreview}
                        />
                    ) : null}
                    {isReplayPreviewMode && replayPreview.sidebarOpen ? (
                        <aside
                            style={{
                                position: "absolute",
                                top: 16,
                                right: 16,
                                bottom: 16,
                                width: 420,
                                maxWidth: "calc(100vw - 2rem)",
                                zIndex: 16,
                            }}
                        >
                            <PublicWikiSidebar
                                entity={null}
                                wiki={replayPreviewActiveWiki}
                                isLoading={isPreviewWikiLoading}
                                error={replayPreview.activeWikiId ? previewWikiError : "Chưa có wiki được chọn trong step này."}
                                onClose={() => {
                                    setPreviewWikiError(null);
                                    replayPreview.closeWikiPanel();
                                }}
                                onWikiLinkRequest={handleReplayPreviewWikiLinkRequest}
                            />
                        </aside>
                    ) : null}
                    {!isReplayPreviewMode || replayPreview.timelineVisible ? (
                        <TimelineBar
                            year={activeTimelineYear}
                            onYearChange={
                                isReplayPreviewMode
                                    ? replayPreview.setTimelineYear
                                    : handleTimelineYearChange
                            }
                            isLoading={false}
                            disabled={false}
                            statusText={null}
                            filterEnabled={activeTimelineFilterEnabled}
                            onFilterEnabledChange={
                                isReplayPreviewMode
                                    ? replayPreview.setTimelineFilterEnabled
                                    : setTimelineFilterEnabled
                            }
                        />
                    ) : null}
                </div>
            ) : null}

            {!isReplayEditMode && !isReplayPreviewMode ? (
                <>
                    <ResizeHandle
                        title="Resize right panel"
                        onDrag={(deltaX) => {
                            // dragging handle (between map and right panel): moving right increases right panel width
                            setRightPanelWidth((prev) => clampNumber(prev - deltaX, 260, 720));
                        }}
                    />

                    <BackgroundLayersPanel
                        width={rightPanelWidth}
                        topContent={
                            <div style={{ display: "grid", gap: "12px" }}>
                                <EditorSearchResults
                                    searchKind={searchKind}
                                    onSearchKindChange={(next) => {
                                        setSearchKind(next);
                                        setSearchQuery("");
                                        setSearchQueryDraft("");
                                    }}
                                    searchQuery={searchQuery}
                                    onSearchQueryChange={setSearchQuery}
                                    onLocalSearchQueryChange={setSearchQueryDraft}
                                    searchQueryDraft={searchQueryDraft}
                                    entitySearchResults={entitySearchResults}
                                    isEntitySearchLoading={isEntitySearchLoading}
                                    onAddEntityRefToProject={handleAddEntityRefToProject}
                                    wikiSearchResults={wikiSearchResults}
                                    isWikiSearching={isWikiSearching}
                                    onAddWikiRefToProject={handleAddWikiRefToProject}
                                    geoSearchResults={geoSearchResults}
                                    isGeoSearching={isGeoSearching}
                                    onImportGeoFromSearch={handleImportGeoFromSearch}
                                />
                                <ImageOverlayPanel
                                    overlay={imageOverlay}
                                    onPickImage={handlePickImageOverlay}
                                    onPasteImage={handlePasteImageOverlay}
                                    keyboardEnabled={imageOverlayKeyboardEnabled}
                                    onKeyboardEnabledChange={setImageOverlayKeyboardEnabled}
                                    onOpacityChange={handleImageOverlayOpacityChange}
                                    onRemove={handleRemoveImageOverlay}
                                />
                                <GeometryBindingPanel
                                    geometries={geometryChoices}
                                    selectedGeometryId={selectedFeature ? String(selectedFeature.properties.id) : null}
                                    selectedGeometryBindingIds={selectedGeometryBindingIds}
                                    onToggleBindGeometryForSelectedGeometry={handleToggleBindGeometryForSelectedGeometry}
                                    onFocusGeometry={handleFocusGeometryFromBindingPanel}
                                />

                                <ProjectEntityRefsPanel
                                    onCreateEntityOnly={handleCreateEntityOnly}
                                    onUpdateEntity={handleUpdateEntityInProject}
                                    hasSelectedGeometry={Boolean(selectedFeature)}
                                    selectedGeometryTime={selectedGeometryTime}
                                    onToggleBindEntityForSelectedGeometry={handleToggleBindEntityForSelectedGeometry}
                                />

                                <WikiSidebarPanel
                                    projectId={projectId}
                                    setWikis={setSnapshotWikisUndoable}
                                />

                                <EntityWikiBindingsPanel
                                    setLinks={setSnapshotEntityWikiLinksUndoable}
                                />
                                {selectedFeature ? (
                                    <SelectedGeometryPanel
                                        selectedFeatures={selectedFeatures}
                                        onApplyGeometryMetadata={featureCommands.applyGeometryMetadata}
                                        changeCount={editor.changeCount}
                                        onReplayEdit={(id) => setMode("replay", id)}
                                    />
                                ) : null}
                            </div>
                        }
                    />
                </>
            ) : isReplayEditMode ? (
                <>
                    <ResizeHandle
                        title="Resize right panel"
                        onDrag={(deltaX) => {
                            setRightPanelWidth((prev) => clampNumber(prev - deltaX, 260, 720));
                        }}
                    />
                    <ReplayEffectsSidebar
                        width={rightPanelWidth}
                        replay={editor.activeReplayDraft}
                        selectedStageId={replaySelection.stageId}
                        selectedStepIndex={replaySelection.stepIndex}
                        selectedFeatureIds={selectedFeatureIds.map((id) => String(id))}
                        currentTimelineYear={timelineDraftYear}
                        geometryChoices={geometryChoices}
                        wikiChoices={wikiChoices}
                        getCurrentMapViewState={getCurrentMapViewState}
                        onMutateReplay={editor.mutateActiveReplay}
                    />
                </>
            ) : null}
        </div>
    );
}

function readImageAspectRatio(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!width || !height) {
                reject(new Error("Image has invalid dimensions."));
                return;
            }
            resolve(width / height);
        };
        image.onerror = () => reject(new Error("Image load failed."));
        image.src = url;
    });
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function buildEntityLabelContextDraft(draft: FeatureCollection, entities: Entity[]): FeatureCollection {
    if (!draft.features.length) return draft;

    const entityById = new globalThis.Map<string, Entity>();
    for (const entity of entities || []) {
        const id = String(entity?.id || "").trim();
        if (!id) continue;
        entityById.set(id, entity);
    }

    return {
        ...draft,
        features: draft.features.map((feature) => {
            const entityIds = normalizeFeatureEntityIds(feature);
            if (!entityIds.length) return feature;

            const candidates = entityIds.map((id) => {
                const entity = entityById.get(id) || null;
                const name = String(entity?.name || id).trim();
                if (!name) return null;
                return {
                    id,
                    name,
                    time_start: entity?.time_start ?? null,
                    time_end: entity?.time_end ?? null,
                };
            }).filter((candidate) => candidate !== null);

            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    entity_name: candidates[0]?.name || null,
                    entity_names: candidates.map((candidate) => candidate.name),
                    entity_label_candidates: candidates,
                },
            };
        }),
    };
}

function parseOptionalEntityYearInput(value: string, fieldName: string): number | undefined {
    const trimmed = String(value || "").trim();
    if (!trimmed.length) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new Error(`${fieldName} phải là số nguyên.`);
    }
    return parsed;
}
