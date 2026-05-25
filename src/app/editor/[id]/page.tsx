"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import Map, { type MapFeaturePayload, type MapHandle } from "@/uhm/components/Map";
import Editor from "@/uhm/components/Editor";
import BackgroundLayersPanel from "@/uhm/components/editor/BackgroundLayersPanel";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import SelectedGeometryPanel from "@/uhm/components/editor/SelectedGeometryPanel";
import ReplayTimelineSidebar from "@/uhm/components/editor/ReplayTimelineSidebar";
import ReplayEffectsSidebar from "@/uhm/components/editor/ReplayEffectsSidebar";
import ReplayPreviewOverlay from "@/uhm/components/editor/ReplayPreviewOverlay";
import ReplayPreviewLayerPanel from "@/uhm/components/editor/ReplayPreviewLayerPanel";
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
import { searchGeometriesByEntityName, fetchGeometriesByBBox, type EntityGeometriesSearchItem, type EntityGeometrySearchGeo } from "@/uhm/api/geometries";
import { WORLD_BBOX } from "@/uhm/lib/map/geo/constants";
import {
    Feature,
    FeatureCollection,
    useEditorState,
} from "@/uhm/lib/editor/state/useEditorState";
import { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";
import {
    getDefaultTypeIdForFeature,
    normalizeFeatureEntityIds,
    uniqueEntityIds,
} from "@/uhm/lib/editor/snapshot/editorSnapshot";
import {
    getDirectGeometryChildIds,
    normalizeFeatureBoundWith,
    wouldCreateGeometryBoundWithCycle,
} from "@/uhm/lib/editor/geometry/geometryBinding";
import {
    buildClientEntityId,
    mergeEntitySearchResults,
} from "@/uhm/lib/editor/entity/entityBinding";
import { buildFeatureEntityPatch } from "@/uhm/lib/editor/entity/entityBinding";
import { newId } from "@/uhm/lib/utils/id";
import {
    loadBackgroundLayerVisibilityFromStorage,
    persistBackgroundLayerVisibility,
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
import { FIXED_TIMELINE_RANGE, clampYearToFixedRange, normalizeTimelineYearValue } from "@/uhm/lib/utils/timeline";
import { useFeatureCommands } from "@/uhm/lib/editor/geometry/useFeatureCommands";
import { deleteSubmission } from "@/uhm/api/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { BattleReplay, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import {
    EditorStoreProvider,
    useEditorStore,
    useEditorStoreApi,
} from "@/uhm/store/editorStore";
import { EditorSearchResults } from "@/uhm/components/editor/EditorSearchResults";
import { ResizeHandle } from "@/uhm/components/ui/ResizeHandle";
import {
    clampNumber,
    formatCommitTitle,
    isFeatureVisibleAtYear,
    normalizeEntitiesForCompare,
    normalizeEntityWikiLinksForCompare,
    normalizeGeoSearchBoundWith,
    normalizeGeoSearchGeometry,
    normalizeReplaysForCompare,
    normalizeWikisForCompare,
} from "@/uhm/lib/editor/editorPageUtils";

const CURRENT_YEAR = new Date().getUTCFullYear();
const DEFAULT_EDITOR_USER_ID = "local-editor";

type ReplayPreviewSession = {
    replay: BattleReplay | null;
    replays: BattleReplay[];
    draft: FeatureCollection;
    entities: Entity[];
    wikis: WikiSnapshot[];
    entityWikiLinks: EntityWikiLinkSnapshot[];
    selectedStageId: number | null;
    selectedStepIndex: number | null;
    timelineYear: number;
    timelineFilterEnabled: boolean;
    mapViewState: ReturnType<MapHandle["getViewState"]>;
};

type PreviewRelationIndex = {
    entitiesById: Record<string, Entity>;
    entityGeometriesById: Record<string, FeatureCollection>;
    entityWikisById: Record<string, Wiki[]>;
    geometryEntityIds: Record<string, string[]>;
    wikiEntityIdsById: Record<string, string[]>;
    wikiEntityIdsBySlug: Record<string, string[]>;
    wikiById: Record<string, Wiki>;
    wikiBySlug: Record<string, Wiki>;
};

type PreviewLinkEntityPopupState = {
    slug: string;
    entities: Entity[];
    top: number;
    left: number;
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
    const editorOriginalMapViewStateRef = useRef<ReturnType<MapHandle["getViewState"]> | null>(null);
    // State chính của editor nằm trong zustand store để các panel con đọc cùng source-of-truth.
    const {
        mode,
        internalSetMode,
        baselineFeatureCollection,
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
        snapshotEntityRows,
        setSnapshotEntityRows,
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
        baselineFeatureCollection: state.baselineFeatureCollection,
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
        snapshotEntityRows: state.snapshotEntityRows,
        setSnapshotEntityRows: state.setSnapshotEntityRows,
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
    const snapshotEntityRowsRef = useRef(snapshotEntityRows);
    const snapshotWikisRef = useRef(snapshotWikis);
    const snapshotEntityWikiLinksRef = useRef(snapshotEntityWikiLinks);
    useEffect(() => {
        snapshotEntityRowsRef.current = snapshotEntityRows;
    }, [snapshotEntityRows]);
    useEffect(() => {
        snapshotWikisRef.current = snapshotWikis;
    }, [snapshotWikis]);
    useEffect(() => {
        snapshotEntityWikiLinksRef.current = snapshotEntityWikiLinks;
    }, [snapshotEntityWikiLinks]);

    // Hook quản lý draft/changes/undo cho main editor và replay editor.
    const editor = useEditorState(baselineFeatureCollection, {
        snapshotUndo: {
            snapshotEntityRowsRef,
            setSnapshotEntityRows,
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
    // Xóa wiki là một thay đổi snapshot kép: wiki row + các binding entity-wiki trỏ tới wiki đó.
    const removeSnapshotWikiUndoable = useCallback(
        (wikiId: string) => {
            const id = String(wikiId || "").trim();
            if (!id) return;
            editor.setSnapshotWikisAndEntityWikiLinks(
                (prev) => prev.filter((wiki) => wiki.id !== id),
                (prev) => prev.filter((link) => String(link.wiki_id) !== id),
                `Xóa wiki #${id}`
            );
        },
        [editor]
    );
    // Chuyển entity snapshot local thành entity catalog row để search/binding dùng chung.
    const snapshotEntityRowsAsEntities = useMemo(() => {
        const rows = snapshotEntityRows || [];
        return rows
            .filter((e) => e && e.operation !== "delete")
            .map((e) => ({
                id: String(e.id || ""),
                name: String(e.name || "").trim() || String(e.id || ""),
                description: e.description ?? null,
                time_start: normalizeTimelineYearValue(e.time_start),
                time_end: normalizeTimelineYearValue(e.time_end),
                geometry_count: 0,
            }))
            .filter((e) => e.id.length > 0 && e.name.length > 0);
    }, [snapshotEntityRows]);

    // Entity list hợp nhất giữa backend catalog và snapshot local.
    const entities = useMemo(
        () => mergeEntitySearchResults(entityCatalog, snapshotEntityRowsAsEntities),
        [entityCatalog, snapshotEntityRowsAsEntities]
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
    const [previewFeaturePopupAnchor, setPreviewFeaturePopupAnchor] = useState<MapFeaturePayload | null>(null);
    const [previewExpandedEntityId, setPreviewExpandedEntityId] = useState<string | null>(null);
    const [previewActiveEntityId, setPreviewActiveEntityId] = useState<string | null>(null);
    const [isPreviewEntitySidebarOpen, setIsPreviewEntitySidebarOpen] = useState(false);

    const [viewMode, setViewMode] = useState<"local" | "global">("local");
    const [globalGeometries, setGlobalGeometries] = useState<FeatureCollection>({
        type: "FeatureCollection",
        features: [],
    });
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);
    const [previewLinkEntityPopup, setPreviewLinkEntityPopup] = useState<PreviewLinkEntityPopupState | null>(null);
    const [previewEntityFocusToken, setPreviewEntityFocusToken] = useState(0);
    const [previewSidebarWidth, setPreviewSidebarWidth] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("public-wiki-sidebar-width");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!Number.isNaN(parsed) && parsed >= 320 && parsed <= 800) {
                    return parsed;
                }
            }
        }
        return 420;
    });
    // State ảnh overlay local-only để vẽ trace theo ảnh mẫu.
    const [imageOverlay, setImageOverlay] = useState<MapImageOverlay | null>(null);
    // Bật/tắt điều khiển ảnh overlay bằng phím mũi tên và W/S.
    const [imageOverlayKeyboardEnabled, setImageOverlayKeyboardEnabled] = useState(false);
    // Ref giữ object URL hiện tại để revoke khi đổi/xóa ảnh, tránh leak bộ nhớ.
    const imageOverlayObjectUrlRef = useRef<string | null>(null);
    const previewLinkEntityPopupRef = useRef<HTMLDivElement | null>(null);
    // Cập nhật stage/step được chọn trong sidebar replay.
    const handleReplaySelectionChange = useCallback((stageId: number | null, stepIndex: number | null) => {
        setReplaySelection({ stageId, stepIndex });
    }, []);
    // Helper đọc MapLibre instance hiện tại cho replay dispatcher.
    const getCurrentMapInstance = useCallback(() => mapHandleRef.current?.getMap() ?? null, []);
    // Helper đọc camera/view hiện tại để lưu vào replay preview.
    const getCurrentMapViewState = useCallback(() => mapHandleRef.current?.getViewState() ?? null, []);
    const restoreEditorOriginalMapState = useCallback(() => {
        const map = getCurrentMapInstance();
        const savedViewState = editorOriginalMapViewStateRef.current;
        if (map && savedViewState) {
            mapHandleRef.current?.setGlobeProjection(savedViewState.projection === "globe");
            map.easeTo({
                center: savedViewState.center,
                zoom: savedViewState.zoom,
                pitch: savedViewState.pitch,
                bearing: savedViewState.bearing,
                duration: 650,
            });
        }
        editorOriginalMapViewStateRef.current = null;
    }, [getCurrentMapInstance]);
    const isReplayEditMode = mode === "replay";
    const isViewerPreviewMode = mode === "preview";
    const isReplayPreviewMode = mode === "replay_preview";
    const isAnyPreviewMode = isViewerPreviewMode || isReplayPreviewMode;
    const previewReturnModeRef = useRef<EditorMode>("select");
    const replayPreviewReturnRef = useRef<{
        mode: "replay" | "preview";
        session: ReplayPreviewSession | null;
    }>({ mode: "replay", session: null });
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

        const snapshotIds = new Set((snapshotEntityRows || []).map((entity) => String(entity.id || "")));
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
    }, [snapshotEntityRows, setEntityCatalog]);

    // Clamp năm timeline vào range cố định trước khi đưa vào store.
    const handleTimelineYearChange = useCallback((nextYear: number) => {
        setTimelineDraftYear(clampYearToFixedRange(Math.trunc(nextYear)));
    }, [setTimelineDraftYear]);

    const handleViewerPreviewTimelineYearChange = useCallback((nextYear: number) => {
        setPreviewSession((prev) =>
            prev
                ? {
                    ...prev,
                    timelineYear: clampYearToFixedRange(Math.trunc(nextYear)),
                }
                : prev
        );
    }, []);

    const handleViewerPreviewTimelineFilterChange = useCallback((enabled: boolean) => {
        setPreviewSession((prev) =>
            prev
                ? {
                    ...prev,
                    timelineFilterEnabled: enabled,
                }
                : prev
        );
    }, []);

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
        onSelectStep: () => { },
        setMapProjection: useCallback((type: "globe" | "mercator") => {
            mapHandleRef.current?.setGlobeProjection(type === "globe");
        }, []),
    });
    const {
        hiddenGeometryIds: replayPreviewHiddenGeometryIds,
        timelineYear: replayPreviewTimelineYear,
        timelineFilterEnabled: replayPreviewTimelineFilterEnabled,
        resetPreview: resetReplayPreview,
        playFromSelection: playReplayPreviewFromSelection,
        playFromStart: playReplayPreviewFromStart,
        activeCursor: replayPreviewActiveCursor,
        activeWikiId: replayPreviewActiveWikiId,
        sidebarOpen: replayPreviewSidebarOpen,
        openWikiPanelById: openReplayPreviewWikiPanelById,
        closeWikiPanel: closeReplayPreviewWikiPanel,
    } = replayPreview;

    // Draft hiển thị trong preview có thể ẩn bớt geometry theo action replay.
    const replayPreviewDraft = useMemo(() => {
        const sourceDraft = previewSession?.draft || EMPTY_FEATURE_COLLECTION;
        if (!isReplayPreviewMode || replayPreviewHiddenGeometryIds.length === 0) {
            return sourceDraft;
        }
        const hiddenIds = new Set(replayPreviewHiddenGeometryIds);
        return {
            ...sourceDraft,
            features: sourceDraft.features.filter(
                (feature) => !hiddenIds.has(String(feature.properties.id))
            ),
        };
    }, [isReplayPreviewMode, previewSession?.draft, replayPreviewHiddenGeometryIds]);

    const activeTimelineYear = isReplayPreviewMode
        ? replayPreviewTimelineYear
        : isViewerPreviewMode
            ? previewSession?.timelineYear ?? timelineDraftYear
            : timelineDraftYear;
    const activeTimelineFilterEnabled = isReplayPreviewMode
        ? replayPreviewTimelineFilterEnabled
        : isViewerPreviewMode
            ? previewSession?.timelineFilterEnabled ?? timelineFilterEnabled
            : timelineFilterEnabled;

    // Render draft is the only FeatureCollection that decides what appears on the map.
    // It may be timeline-filtered, replay-filtered, or preview-filtered, but it is not the edit source.
    // Fetch global geometries when viewMode is "global", timeline year changes, or timeline filter state changes
    useEffect(() => {
        if (viewMode !== "global") {
            return;
        }

        let disposed = false;
        setIsGlobalLoading(true);

        const timeVal = activeTimelineFilterEnabled
            ? clampYearToFixedRange(Math.trunc(activeTimelineYear))
            : undefined;

        const loadGlobalData = async () => {
            try {
                // 1. Fetch all geometries in a single fast query
                const baseFc = await fetchGeometriesByBBox({
                    ...WORLD_BBOX,
                    time: timeVal,
                    timeRange: activeTimelineFilterEnabled ? 0 : undefined,
                });

                if (disposed) return;
                setGlobalGeometries(baseFc);

                // 2. Concurrently fetch per-entity to build the geometry-to-entity mapping
                const geoToEntities: Record<string, { entity_id: string; entity_name: string; entity_ids: string[] }> = {};
                
                const concurrency = 6;
                const items = [...entities];
                let nextIndex = 0;

                await Promise.all(
                    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
                        while (true) {
                            if (disposed) return;
                            const idx = nextIndex++;
                            if (idx >= items.length) return;
                            const entity = items[idx];

                            try {
                                const fc = await fetchGeometriesByBBox({
                                    ...WORLD_BBOX,
                                    entity_id: entity.id,
                                    time: timeVal,
                                    timeRange: activeTimelineFilterEnabled ? 0 : undefined,
                                });

                                if (disposed) return;

                                for (const feature of fc.features) {
                                    const gid = String(feature.properties?.id);
                                    if (!geoToEntities[gid]) {
                                        geoToEntities[gid] = {
                                            entity_id: entity.id,
                                            entity_name: entity.name,
                                            entity_ids: [entity.id],
                                        };
                                    } else {
                                        if (!geoToEntities[gid].entity_ids.includes(entity.id)) {
                                            geoToEntities[gid].entity_ids.push(entity.id);
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error(`Error loading geometry mapping for entity ${entity.id}`, e);
                            }
                        }
                    })
                );

                if (disposed) return;

                // 3. Update the global geometries with the enriched properties
                setGlobalGeometries((prev) => {
                    return {
                        ...prev,
                        features: prev.features.map((feature) => {
                            const gid = String(feature.properties?.id);
                            const mapping = geoToEntities[gid];
                            if (mapping) {
                                return {
                                    ...feature,
                                    properties: {
                                        ...feature.properties,
                                        entity_id: mapping.entity_id,
                                        entity_name: mapping.entity_name,
                                        entity_ids: mapping.entity_ids,
                                    },
                                };
                            }
                            return feature;
                        }),
                    };
                });
            } catch (err) {
                console.error("Load global geometries failed", err);
            } finally {
                if (!disposed) {
                    setIsGlobalLoading(false);
                }
            }
        };

        loadGlobalData();

        return () => {
            disposed = true;
        };
    }, [viewMode, activeTimelineYear, activeTimelineFilterEnabled, entities]);

    // Render draft is the only FeatureCollection that decides what appears on the map.
    // It may be timeline-filtered, replay-filtered, or preview-filtered, but it is not the edit source.
    const mapRenderDraft = useMemo(() => {
        const activeDraft = isReplayPreviewMode
            ? replayPreviewDraft
            : isViewerPreviewMode
                ? previewSession?.draft || editor.mainDraft
                : isReplayEditMode
                    ? editor.replayDraft
                    : editor.mainDraft;

        const filteredDraft = activeTimelineFilterEnabled
            ? {
                  ...activeDraft,
                  features: activeDraft.features.filter((feature) =>
                      isFeatureVisibleAtYear(feature, clampYearToFixedRange(Math.trunc(activeTimelineYear)))
                  ),
              }
            : activeDraft;

        if (viewMode === "local") {
            return filteredDraft;
        }

        // We want to ignore any database geometries whose IDs are present in either the active local features
        // or the baseline features (since those are owned by the local session/commit context).
        const localFeatureIds = new Set<string>();
        for (const f of filteredDraft.features) {
            if (f.properties?.id != null) {
                localFeatureIds.add(String(f.properties.id));
            }
        }
        for (const f of baselineFeatureCollection.features) {
            if (f.properties?.id != null) {
                localFeatureIds.add(String(f.properties.id));
            }
        }

        const mergedFeatures = [...filteredDraft.features];

        // Add global features that are not owned/modified/deleted by the local session
        for (const globalFeature of globalGeometries.features) {
            const globalId = globalFeature.properties?.id != null ? String(globalFeature.properties.id) : null;
            if (globalId === null || !localFeatureIds.has(globalId)) {
                mergedFeatures.push(globalFeature);
            }
        }

        return {
            ...filteredDraft,
            features: mergedFeatures,
        };
    }, [
        activeTimelineFilterEnabled,
        activeTimelineYear,
        editor,
        isReplayEditMode,
        isReplayPreviewMode,
        isViewerPreviewMode,
        previewSession?.draft,
        replayPreviewDraft,
        viewMode,
        baselineFeatureCollection.features,
        globalGeometries.features,
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
            time_start: normalizeTimelineYearValue(selectedFeature.properties.time_start),
            time_end: normalizeTimelineYearValue(selectedFeature.properties.time_end),
        };
    }, [selectedFeature]);

    // Choices cho panel bind geometry, gồm cả marker geometry mới tạo local.
    const geometryChoices = useMemo(() => {
        const createdGeometryIds = new Set<string>();
        for (const [id, change] of editor.changes.entries()) {
            if (change.action === "create") createdGeometryIds.add(String(id));
        }
        const mapRenderGeometryIds = new Set(
            mapRenderDraft.features.map((feature) => String(feature.properties.id))
        );

        const rows = (editor.draft.features || [])
            .filter((f) => f && f.properties && (typeof f.properties.id === "string" || typeof f.properties.id === "number"))
            .map((f) => {
                const id = String(f.properties.id);
                const semantic = String(f.properties.type || getDefaultTypeIdForFeature(f) || "").trim();
                const label = semantic.length ? `${semantic} (${f.geometry.type})` : "Geometry";
                const timeStart = normalizeTimelineYearValue(f.properties.time_start);
                const timeEnd = normalizeTimelineYearValue(f.properties.time_end);
                const hasStart = timeStart !== null;
                const hasEnd = timeEnd !== null;
                const timeStatus: "missing" | "partial" | "complete" =
                    !hasStart && !hasEnd
                        ? "missing"
                        : !hasStart || !hasEnd
                            ? "partial"
                            : "complete";
                const isTimelineVisible = mapRenderGeometryIds.has(id);
                const timelineStatus: "off" | "visible" | "filteredOut" = !activeTimelineFilterEnabled
                    ? "off"
                    : isTimelineVisible
                        ? "visible"
                        : "filteredOut";
                return {
                    id,
                    label,
                    time_start: timeStart,
                    time_end: timeEnd,
                    isTimelineVisible,
                    isOrphan: normalizeFeatureEntityIds(f).length === 0,
                    timeStatus,
                    timelineStatus,
                    isNew: createdGeometryIds.has(id) || !editor.hasPersistedFeature(f.properties.id),
                };
            });
        rows.sort((a, b) => a.id.localeCompare(b.id));
        return rows;
    }, [activeTimelineFilterEnabled, editor, mapRenderDraft.features]);

    // Child ids bound to the selected geometry via child.properties.bound_with.
    const selectedGeometryChildIds = useMemo(() => {
        if (!selectedFeature) return [];
        return getDirectGeometryChildIds(editor.draft, selectedFeature.properties.id);
    }, [editor.draft, selectedFeature]);

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
        const next = normalizeEntitiesForCompare(snapshotEntityRows);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [baselineSnapshot?.entities, snapshotEntityRows]);

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

    const clearPreviewViewerState = useCallback(() => {
        setPreviewActiveEntityId(null);
        setIsPreviewEntitySidebarOpen(false);
        setPreviewFeaturePopupAnchor(null);
        setPreviewLinkEntityPopup(null);
        setPreviewWikiError(null);
        closeReplayPreviewWikiPanel();
        setSelectedFeatureIds([]);
    }, [closeReplayPreviewWikiPanel, setSelectedFeatureIds]);

    const openViewerPreview = useCallback(() => {
        if (mode === "preview" || mode === "replay_preview" || mode === "replay") return;
        previewReturnModeRef.current = mode === "idle" ? "select" : mode;
        editorOriginalMapViewStateRef.current = getCurrentMapViewState();
        setPreviewSession({
            replay: null,
            replays: deepClone(editor.effectiveReplays),
            draft: deepClone(editor.mainDraft),
            entities: deepClone(entities),
            wikis: deepClone(snapshotWikis),
            entityWikiLinks: deepClone(snapshotEntityWikiLinks),
            selectedStageId: null,
            selectedStepIndex: null,
            timelineYear: timelineDraftYear,
            timelineFilterEnabled,
            mapViewState: getCurrentMapViewState(),
        });
        setPreviewAutoplayMode(null);
        clearPreviewViewerState();
        internalSetMode("preview");
    }, [
        clearPreviewViewerState,
        editor.effectiveReplays,
        editor.mainDraft,
        entities,
        getCurrentMapViewState,
        internalSetMode,
        mode,
        snapshotEntityWikiLinks,
        snapshotWikis,
        timelineDraftYear,
        timelineFilterEnabled,
    ]);

    const exitViewerPreview = useCallback(() => {
        restoreEditorOriginalMapState();
        setPreviewAutoplayMode(null);
        setPreviewSession(null);
        clearPreviewViewerState();
        internalSetMode(previewReturnModeRef.current || "select");
    }, [clearPreviewViewerState, internalSetMode, restoreEditorOriginalMapState]);

    // Thoát replay preview. Nếu replay được mở từ preview thường thì quay lại preview thường.
    const exitReplayPreview = useCallback(() => {
        resetReplayPreview();
        setPreviewAutoplayMode(null);
        const returnState = replayPreviewReturnRef.current;
        replayPreviewReturnRef.current = { mode: "replay", session: null };

        if (returnState.mode === "preview" && returnState.session) {
            setPreviewSession(deepClone(returnState.session));
            clearPreviewViewerState();
            internalSetMode("preview");
            return;
        }

        restoreEditorOriginalMapState();
        setPreviewSession(null);
        clearPreviewViewerState();
        internalSetMode("replay");
    }, [clearPreviewViewerState, internalSetMode, resetReplayPreview, restoreEditorOriginalMapState]);

    // Đóng băng draft/replay hiện tại thành session preview để phát thử.
    const openReplayPreview = useCallback((autoplayMode: "start" | "selection") => {
        if (!editor.activeReplayDraft) return;

        replayPreviewReturnRef.current = { mode: "replay", session: null };
        editorOriginalMapViewStateRef.current = getCurrentMapViewState();
        setPreviewSession({
            replay: deepClone(editor.activeReplayDraft),
            replays: deepClone(editor.effectiveReplays),
            draft: deepClone(editor.replayDraft),
            entities: deepClone(entities),
            wikis: deepClone(snapshotWikis),
            entityWikiLinks: deepClone(snapshotEntityWikiLinks),
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
        editor.effectiveReplays,
        editor.replayDraft,
        entities,
        getCurrentMapViewState,
        internalSetMode,
        replaySelection.stageId,
        replaySelection.stepIndex,
        setSelectedFeatureIds,
        snapshotEntityWikiLinks,
        snapshotWikis,
        timelineDraftYear,
        timelineFilterEnabled,
    ]);

    const viewerPreviewSelectedReplay = useMemo(() => {
        if (!isViewerPreviewMode || !selectedFeatureIds.length) return null;
        const selectedGeometryId = String(selectedFeatureIds[0] ?? "").trim();
        if (!selectedGeometryId.length) return null;
        return (previewSession?.replays || []).find(
            (replay) =>
                String(replay?.geometry_id || "").trim() === selectedGeometryId &&
                hasPlayableReplaySteps(replay)
        ) || null;
    }, [isViewerPreviewMode, previewSession?.replays, selectedFeatureIds]);

    const openSelectedViewerReplayPreview = useCallback(() => {
        if (!isViewerPreviewMode || !previewSession || !viewerPreviewSelectedReplay) return;

        const returnSession = deepClone(previewSession);
        const selectedReplay = deepClone(viewerPreviewSelectedReplay);
        replayPreviewReturnRef.current = {
            mode: "preview",
            session: returnSession,
        };
        setPreviewSession({
            ...returnSession,
            replay: selectedReplay,
            draft: buildReplayPreviewDraftFromSource(returnSession.draft, selectedReplay),
            selectedStageId: null,
            selectedStepIndex: null,
            timelineYear: activeTimelineYear,
            timelineFilterEnabled: activeTimelineFilterEnabled,
            mapViewState: getCurrentMapViewState(),
        });
        setPreviewAutoplayMode("start");
        clearPreviewViewerState();
        internalSetMode("replay_preview");
    }, [
        activeTimelineFilterEnabled,
        activeTimelineYear,
        clearPreviewViewerState,
        getCurrentMapViewState,
        internalSetMode,
        isViewerPreviewMode,
        previewSession,
        viewerPreviewSelectedReplay,
    ]);

    // State machine chuyển mode editor, xử lý riêng preview/replay để không mất draft.
    const setMode = useCallback((m: EditorMode, featureId?: string | number) => {
        if (m === "preview" || m === "replay_preview") {
            return;
        }

        if (mode === "preview") {
            setPreviewAutoplayMode(null);
            setPreviewSession(null);
            clearPreviewViewerState();
            internalSetMode(m);
            return;
        }

        if (mode === "replay_preview") {
            resetReplayPreview();
            setPreviewAutoplayMode(null);
            setPreviewSession(null);
            clearPreviewViewerState();

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
            const finalSelectedIds = Array.from(new Set([...selectedFeatureIds, featureId]));
            const triggerId = selectedFeatureIds.length > 0 ? selectedFeatureIds[0] : featureId;

            setReplayFeatureId(triggerId);
            setReplaySelection({ stageId: null, stepIndex: null });
            editor.switchReplayContext(triggerId, finalSelectedIds);
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
        clearPreviewViewerState,
        editor,
        internalSetMode,
        mode,
        resetReplayPreview,
        restoreEditorOriginalMapState,
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
            playReplayPreviewFromSelection();
        } else {
            playReplayPreviewFromStart();
        }
        setPreviewAutoplayMode(null);
    }, [
        isReplayPreviewMode,
        playReplayPreviewFromSelection,
        playReplayPreviewFromStart,
        previewAutoplayMode,
        previewSession,
    ]);

    useEffect(() => {
        setPreviewWikiCache({});
        setPreviewWikiError(null);
        setIsPreviewWikiLoading(false);
    }, [previewSession]);

    // Label ngắn cho overlay preview tại step đang phát.
    const replayPreviewActiveStepLabel = useMemo(() => {
        if (
            replayPreviewActiveCursor.stageId == null ||
            replayPreviewActiveCursor.stepIndex == null
        ) {
            return null;
        }
        return `Stage #${replayPreviewActiveCursor.stageId} · Step ${replayPreviewActiveCursor.stepIndex + 1}`;
    }, [replayPreviewActiveCursor.stageId, replayPreviewActiveCursor.stepIndex]);

    const replayPreviewWikiRows = useMemo(
        () => previewSession?.wikis || [],
        [previewSession?.wikis]
    );
    const previewRelations = useMemo(
        () => buildPreviewRelationIndex({
            draft: previewSession?.draft || EMPTY_FEATURE_COLLECTION,
            entities: previewSession?.entities || [],
            wikis: replayPreviewWikiRows,
            entityWikiLinks: previewSession?.entityWikiLinks || [],
            wikiCache: previewWikiCache,
            projectId,
        }),
        [
            previewSession?.draft,
            previewSession?.entities,
            previewSession?.entityWikiLinks,
            previewWikiCache,
            projectId,
            replayPreviewWikiRows,
        ]
    );
    const previewFeaturePopupEntityIds = useMemo(() => {
        if (!previewFeaturePopupAnchor) return [];
        return previewRelations.geometryEntityIds[String(previewFeaturePopupAnchor.featureId)] || [];
    }, [previewFeaturePopupAnchor, previewRelations.geometryEntityIds]);
    const previewFeaturePopupEntities = useMemo(
        () => previewFeaturePopupEntityIds
            .map((entityId) => previewRelations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity)),
        [previewFeaturePopupEntityIds, previewRelations.entitiesById]
    );

    useEffect(() => {
        setPreviewExpandedEntityId(null);
    }, [previewFeaturePopupAnchor]);
    // Wiki snapshot đang được step preview yêu cầu mở.
    const replayPreviewActiveWikiSnapshot = useMemo(() => {
        if (!replayPreviewActiveWikiId) return null;
        return replayPreviewWikiRows.find((item) => item.id === replayPreviewActiveWikiId) || null;
    }, [replayPreviewActiveWikiId, replayPreviewWikiRows]);

    useEffect(() => {
        if (!isAnyPreviewMode || !replayPreviewSidebarOpen) {
            setPreviewWikiError(null);
            setIsPreviewWikiLoading(false);
            return;
        }

        const activeWikiId = String(replayPreviewActiveWikiId || "").trim();
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
        isAnyPreviewMode,
        previewWikiCache,
        replayPreviewActiveWikiId,
        replayPreviewSidebarOpen,
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

    const replayPreviewActiveEntityId = useMemo(() => {
        const activeWikiEntityIds = replayPreviewActiveWikiId
            ? previewRelations.wikiEntityIdsById[String(replayPreviewActiveWikiId)] || []
            : [];

        if (
            previewActiveEntityId &&
            (!activeWikiEntityIds.length || activeWikiEntityIds.includes(previewActiveEntityId))
        ) {
            return previewActiveEntityId;
        }

        return activeWikiEntityIds[0] || previewActiveEntityId;
    }, [previewActiveEntityId, previewRelations.wikiEntityIdsById, replayPreviewActiveWikiId]);

    const replayPreviewActiveEntity = replayPreviewActiveEntityId
        ? previewRelations.entitiesById[replayPreviewActiveEntityId] || null
        : null;
    const replayPreviewActiveEntityGeometries = replayPreviewActiveEntityId
        ? previewRelations.entityGeometriesById[replayPreviewActiveEntityId] || EMPTY_FEATURE_COLLECTION
        : EMPTY_FEATURE_COLLECTION;
    const isReplayPreviewWikiSidebarOpen = isAnyPreviewMode && (replayPreviewSidebarOpen || isPreviewEntitySidebarOpen);

    const closeReplayPreviewSidebar = useCallback(() => {
        closeReplayPreviewWikiPanel();
        setPreviewActiveEntityId(null);
        setIsPreviewEntitySidebarOpen(false);
        setPreviewWikiError(null);
        setPreviewLinkEntityPopup(null);
        setSelectedFeatureIds([]);
    }, [closeReplayPreviewWikiPanel, setSelectedFeatureIds]);

    const selectReplayPreviewEntity = useCallback((
        entityId: string,
        options?: {
            sourceFeatureId?: string | number | null;
            preferredWikiId?: string | null;
            preferredWikiSlug?: string | null;
            focusMap?: boolean;
            selectGeometry?: boolean;
        }
    ) => {
        const id = String(entityId || "").trim();
        const entity = previewRelations.entitiesById[id] || null;
        if (!entity) return;

        const linkedWikis = previewRelations.entityWikisById[id] || [];
        const preferredWikiId = String(options?.preferredWikiId || "").trim();
        const preferredWikiSlug = String(options?.preferredWikiSlug || "").trim();
        const nextWiki =
            linkedWikis.find((wiki) => preferredWikiId && wiki.id === preferredWikiId) ||
            linkedWikis.find((wiki) => preferredWikiSlug && String(wiki.slug || "").trim() === preferredWikiSlug) ||
            linkedWikis[0] ||
            null;

        setPreviewActiveEntityId(id);
        setIsPreviewEntitySidebarOpen(true);
        setPreviewWikiError(null);
        setPreviewLinkEntityPopup(null);

        if (options?.focusMap !== false) {
            setPreviewEntityFocusToken((prev) => prev + 1);
        }
        if (options?.selectGeometry && options.sourceFeatureId != null) {
            setSelectedFeatureIds([options.sourceFeatureId]);
        }
        if (nextWiki) {
            openReplayPreviewWikiPanelById(nextWiki.id);
        }
    }, [
        openReplayPreviewWikiPanelById,
        previewRelations.entitiesById,
        previewRelations.entityWikisById,
        setSelectedFeatureIds,
    ]);

    const handlePreviewMapFeatureClick = useCallback((payload: MapFeaturePayload | null) => {
        if (!isAnyPreviewMode) return;
        setPreviewFeaturePopupAnchor(payload);
        setPreviewLinkEntityPopup(null);
    }, [isAnyPreviewMode]);

    useEffect(() => {
        if (!previewLinkEntityPopup) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setPreviewLinkEntityPopup(null);
        };
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && previewLinkEntityPopupRef.current?.contains(target)) return;
            setPreviewLinkEntityPopup(null);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [previewLinkEntityPopup]);

    // Điều hướng link wiki nội bộ trong preview nhưng chỉ trong phạm vi snapshot preview.
    const handleReplayPreviewWikiLinkRequest = useCallback(({ slug, rect }: { slug: string; rect: DOMRect }) => {
        const nextSlug = String(slug || "").trim();
        if (!nextSlug.length) return;
        const match = replayPreviewWikiRows.find((item) => String(item.slug || "").trim() === nextSlug) || null;
        if (!match) {
            setPreviewWikiError(`Wiki /wiki/${nextSlug} không có trong snapshot preview.`);
            return;
        }

        const linkedEntityIds = previewRelations.wikiEntityIdsBySlug[nextSlug] || [];
        const linkedEntities = linkedEntityIds
            .map((entityId) => previewRelations.entitiesById[entityId] || null)
            .filter((entity): entity is Entity => Boolean(entity));

        if (linkedEntities.length === 1) {
            selectReplayPreviewEntity(linkedEntities[0].id, {
                preferredWikiId: match.id,
                preferredWikiSlug: nextSlug,
            });
            return;
        }

        if (linkedEntities.length > 1) {
            const popupWidth = 240;
            const popupHeight = Math.min(240, linkedEntities.length * 44 + 20);
            const { top, left } = computeFixedPopupPosition(rect, popupWidth, popupHeight);
            setPreviewLinkEntityPopup({
                slug: nextSlug,
                entities: linkedEntities,
                top,
                left,
            });
            return;
        }

        setPreviewWikiError(null);
        openReplayPreviewWikiPanelById(match.id);
    }, [
        openReplayPreviewWikiPanelById,
        previewRelations.entitiesById,
        previewRelations.wikiEntityIdsBySlug,
        replayPreviewWikiRows,
        selectReplayPreviewEntity,
    ]);

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
        const confirmed = window.confirm("Bạn chắc chắn muốn xóa Submition? - việc này không làm hỏng project của bạn");
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
            editor.draft.features.some(feature => String(feature.properties.id) === String(id))
        );
        if (stillExistIds.length !== selectedFeatureIds.length) {
            setSelectedFeatureIds(stillExistIds);
        }
    }, [editor.draft.features, selectedFeatureIds, setSelectedFeatureIds]);

    useEffect(() => {
        if (!selectedFeature) {
            setSelectedGeometryEntityIds([]);
            setGeometryMetaForm({
                type_key: "",
                time_start: "",
                time_end: "",
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
        const timeStart = normalizeTimelineYearValue(selectedFeature.properties.time_start);
        const timeEnd = normalizeTimelineYearValue(selectedFeature.properties.time_end);
        setSelectedGeometryEntityIds(featureEntityIds);
        setGeometryMetaForm({
            type_key: nextTypeKey,
            time_start: timeStart != null ? String(timeStart) : "",
            time_end: timeEnd != null ? String(timeEnd) : "",
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
        editor.setSnapshotEntityRows((prev) => {
            if (prev.some((e) => String(e.id) === id)) return prev;
            return [
                {
                    id,
                    source: "ref",
                    operation: "reference",
                    name: entity.name,
                    description: entity.description ?? null,
                    time_start: normalizeTimelineYearValue(entity.time_start),
                    time_end: normalizeTimelineYearValue(entity.time_end),
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

        editor.setSnapshotEntityRows((prev) => prev.map((e) => {
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

    const handleDeleteEntity = useCallback((entityId: string) => {
        const id = String(entityId || "").trim();
        if (!id) return;
        const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa thực thể này khỏi dự án? Hành động này cũng sẽ gỡ bỏ tất cả liên kết hình học và wiki của thực thể.`);
        if (!confirmed) return;
        editor.deleteEntityAndRelations(id, `Xóa thực thể #${id}`);
        setSelectedGeometryEntityIds((prev) => prev.filter((x) => x !== id));
        flashEntityFormStatus(`Đã xóa thực thể #${id}.`, 3000);
    }, [editor, flashEntityFormStatus, setSelectedGeometryEntityIds]);

    // Bind/unbind geometry con vào selected geometry qua field child.bound_with.
    const handleToggleBindGeometryForSelectedGeometry = useCallback((geoId: string, nextChecked: boolean) => {
        if (!selectedFeatures || selectedFeatures.length === 0) {
            flashGeoBindingStatus("Chưa chọn geometry để bind.");
            return;
        }
        if (selectedFeatures.length !== 1 || !selectedFeature) {
            flashGeoBindingStatus("Chỉ bind geometry-geometry khi chọn đúng một geometry cha.");
            return;
        }
        if (!isMultiEditValid) {
            flashGeoBindingStatus("Không thể bind geometry cho nhiều geometry khác loại.");
            return;
        }
        const id = String(geoId || "").trim();
        if (!id) return;
        const parentId = String(selectedFeature.properties.id);
        if (parentId === id) return;
        const childFeature = editor.draft.features.find((f) => String(f.properties.id) === id);
        if (!childFeature) {
            flashGeoBindingStatus("Không tìm thấy geometry con.");
            return;
        }
        if (nextChecked && wouldCreateGeometryBoundWithCycle(editor.draft.features, id, parentId)) {
            flashGeoBindingStatus("Không thể bind vì sẽ tạo vòng lặp bound_with.");
            return;
        }

        setIsEntitySubmitting(true);
        flashGeoBindingStatus(null, 0);
        try {
            const currentParentId = normalizeFeatureBoundWith(childFeature);
            const nextBoundWith = nextChecked
                ? parentId
                : currentParentId === parentId
                    ? null
                    : currentParentId;
            editor.patchFeaturePropertiesBatch(
                [{
                    id: childFeature.properties.id,
                    patch: { bound_with: nextBoundWith },
                }],
                nextChecked ? "Bind geometry vào GEO" : "Unbind geometry khỏi GEO"
            );

            flashGeoBindingStatus(
                nextChecked
                    ? "Đã set bound_with cho geometry con. Commit khi sẵn sàng."
                    : "Đã gỡ bound_with khỏi geometry con. Commit khi sẵn sàng.",
                3000
            );
        } finally {
            setIsEntitySubmitting(false);
        }
    }, [
        editor,
        flashGeoBindingStatus,
        selectedFeature,
        selectedFeatures,
        isMultiEditValid,
        setIsEntitySubmitting,
    ]);

    // Bind nhiều geometries con vào target geometry.
    const handleBindGeometries = useCallback((targetId: string | number, sourceIds: (string | number)[]) => {
        const idStr = String(targetId).trim();
        if (!idStr) return;

        const targetFeature = editor.draft.features.find((f) => String(f.properties.id) === idStr);
        if (!targetFeature) {
            flashGeoBindingStatus("Không tìm thấy geometry đích.");
            return;
        }

        const sourceFeatures = sourceIds
            .map((sourceId) => editor.draft.features.find((f) => String(f.properties.id) === String(sourceId)))
            .filter((feature): feature is Feature => Boolean(feature))
            .filter((feature) => String(feature.properties.id) !== idStr)
            .filter((feature) => !wouldCreateGeometryBoundWithCycle(editor.draft.features, feature.properties.id, idStr));

        if (!sourceFeatures.length) {
            flashGeoBindingStatus("Không có geometry con hợp lệ để bind.");
            return;
        }

        editor.patchFeaturePropertiesBatch(
            sourceFeatures.map((feature) => ({
                id: feature.properties.id,
                patch: { bound_with: idStr },
            })),
            "Bind các geometry đã chọn vào GEO"
        );

        setSelectedFeatureIds([targetFeature.properties.id]);
        flashGeoBindingStatus(`Đã set bound_with cho ${sourceFeatures.length} geometry con. Commit khi sẵn sàng.`, 3000);
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

        const geoTimeStart = normalizeTimelineYearValue(feature.properties.time_start);
        if (geoTimeStart !== null) {
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

        const boundWith = normalizeGeoSearchBoundWith(geo.bound_with);
        const typeKey = geo.type || null;

        const feature: Feature = {
            type: "Feature",
            properties: {
                id: geoId,
                source: "ref",
                type: typeKey,
                time_start: normalizeTimelineYearValue(geo.time_start),
                time_end: normalizeTimelineYearValue(geo.time_end),
                bound_with: boundWith,
                entity_id: entityItem.entity_id,
                entity_ids: [entityItem.entity_id],
                entity_name: (entityItem.name || "").trim() || entityItem.entity_id,
                entity_names: [(entityItem.name || "").trim() || entityItem.entity_id],
            },
            geometry,
        };

        editor.createFeatureWithSnapshotEntityRows(
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

    const handleRerollGeometryId = useCallback((oldId: string | number) => {
        const nextId = newId();
        editor.changeFeatureId(oldId, nextId);
        setSelectedFeatureIds((prev) => prev.map((id) => String(id) === String(oldId) ? nextId : id));
    }, [editor, setSelectedFeatureIds]);

    const handleRerollEntityId = useCallback((oldId: string, nextId: string) => {
        const activeEntity = entities.find(e => e.id === oldId);
        if (!activeEntity) return;

        // 1. Update snapshotEntityRows
        editor.setSnapshotEntityRows((prev) => prev.map((e) => {
            if (e && String(e.id) === oldId) {
                return { ...e, id: nextId };
            }
            return e;
        }), `Reroll Entity ID #${oldId} -> #${nextId}`);

        // 2. Update entityCatalog
        setEntityCatalog((prev) => prev.map((e) => {
            if (e && String(e.id) === oldId) {
                return { ...e, id: nextId };
            }
            return e;
        }));

        // 3. Update selectedGeometryEntityIds
        setSelectedGeometryEntityIds((prev) => prev.map((id) => id === oldId ? nextId : id));

        // 4. Update features bound to this entity ID
        const featuresToPatch = editor.draft.features.filter((feature) => {
            const entityIds = feature.properties.entity_ids || [];
            return feature.properties.entity_id === oldId || entityIds.includes(oldId);
        });
        if (featuresToPatch.length > 0) {
            editor.patchFeaturePropertiesBatch(
                featuresToPatch.map((feature) => {
                    const prevEntityIds = feature.properties.entity_ids || [];
                    const nextEntityIds = prevEntityIds.map((id) => id === oldId ? nextId : id);
                    return {
                        id: feature.properties.id,
                        patch: buildFeatureEntityPatch(feature, nextEntityIds, [
                            ...entities.filter(e => e.id !== oldId),
                            { id: nextId, name: activeEntity.name, time_start: activeEntity.time_start ?? null, time_end: activeEntity.time_end ?? null }
                        ])
                    };
                }),
                "Cập nhật entity ID mới cho các GEO"
            );
        }
    }, [editor, entities, setEntityCatalog, setSelectedGeometryEntityIds]);

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
            editor.setSnapshotEntityRows((prev) => {
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

    // Base draft for label lookup only. It must not decide which geometry is rendered.
    const labelContextBaseDraft = useMemo(() => {
        const baseDraft = isAnyPreviewMode
            ? previewSession?.draft || EMPTY_FEATURE_COLLECTION
            : editor.draft;

        if (viewMode === "local") {
            return baseDraft;
        }

        const localFeatureIds = new Set<string>();
        for (const f of baseDraft.features) {
            if (f.properties?.id != null) {
                localFeatureIds.add(String(f.properties.id));
            }
        }
        for (const f of baselineFeatureCollection.features) {
            if (f.properties?.id != null) {
                localFeatureIds.add(String(f.properties.id));
            }
        }

        const mergedFeatures = [...baseDraft.features];
        for (const globalFeature of globalGeometries.features) {
            const globalId = globalFeature.properties?.id != null ? String(globalFeature.properties.id) : null;
            if (globalId === null || !localFeatureIds.has(globalId)) {
                mergedFeatures.push(globalFeature);
            }
        }

        return {
            ...baseDraft,
            features: mergedFeatures,
        };
    }, [viewMode, isAnyPreviewMode, previewSession?.draft, editor.draft, baselineFeatureCollection.features, globalGeometries.features]);

    // Enriched label context may contain geometries that mapRenderDraft filtered out.
    // Map rendering must still use mapRenderDraft above.
    const mapLabelContextDraft = useMemo(() => {
        const entitiesForLabel = isAnyPreviewMode
            ? previewSession?.entities || []
            : entities;
        return buildEntityLabelContextDraft(labelContextBaseDraft, entitiesForLabel);
    }, [entities, isAnyPreviewMode, labelContextBaseDraft, previewSession?.entities]);

    if (blockedPendingSubmissionId) {
        return (
            <div style={{ display: "flex", minHeight: "100vh", width: "100vw", background: "#0b1220", color: "white", padding: "40px", alignItems: "center", justifyContent: "center" }}>
                <div style={{ maxWidth: 640, width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 32, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <svg style={{ width: 28, height: 28, color: "#ef4444" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28" height="28">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Editor đang bị khóa</h2>
                    </div>
                    <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: "1.6" }}>
                        Project này đang có submission ở trạng thái <b style={{ color: "#ef4444" }}>PENDING</b> (id: <code style={{ color: "#f1f5f9", background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>{blockedPendingSubmissionId}</code>). Theo quy trình làm việc, khi submission đang pending thì không được tạo submission/commit mới và không được vào editor.
                    </div>
                    <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                        <button
                            onClick={unlockByDeletingPendingSubmission}
                            disabled={isOpeningSection}
                            style={{
                                padding: "10px 16px",
                                borderRadius: 6,
                                border: "none",
                                background: isOpeningSection ? "#334155" : "#ef4444",
                                color: "white",
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: isOpeningSection ? "not-allowed" : "pointer",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => { if (!isOpeningSection) e.currentTarget.style.background = "#dc2626"; }}
                            onMouseLeave={(e) => { if (!isOpeningSection) e.currentTarget.style.background = "#ef4444"; }}
                        >
                            Xóa submission pending để unlock
                        </button>
                        <button
                            onClick={() => router.push("/user/projects")}
                            style={{
                                padding: "10px 16px",
                                borderRadius: 6,
                                border: "1px solid #334155",
                                background: "#1e293b",
                                color: "#f1f5f9",
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: "pointer",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#334155"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "#1e293b"}
                        >
                            Quay lại danh sách projects
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isOpeningSection || !activeSection) {
        return (
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", width: "100vw", background: "#0b1220", color: "white", alignItems: "center", justifyContent: "center", gap: "16px" }}>
                {!activeSection && !isOpeningSection ? (
                    <div style={{ maxWidth: 480, textAlign: "center", padding: "20px" }}>
                        <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", color: "#ef4444" }}>Lỗi tải Project</h2>
                        <div style={{ fontSize: "14px", color: "#94a3b8", marginBottom: "20px" }}>
                            {entityStatus || "Không thể tải thông tin dự án. Vui lòng thử lại hoặc quay lại danh sách."}
                        </div>
                        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                            <button
                                onClick={openProject}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: 6,
                                    background: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    fontWeight: "600",
                                    cursor: "pointer"
                                }}
                            >
                                Thử lại
                            </button>
                            <button
                                onClick={() => router.push("/user/projects")}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: 6,
                                    background: "#1e293b",
                                    color: "#f1f5f9",
                                    border: "1px solid #334155",
                                    fontWeight: "600",
                                    cursor: "pointer"
                                }}
                            >
                                Quay lại
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="premium-spinner" style={{
                            width: "40px",
                            height: "40px",
                            border: "3px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "50%",
                            borderTopColor: "#3b82f6",
                            animation: "spin 1s linear infinite"
                        }} />
                        <style>{`
                            @keyframes spin {
                                to { transform: rotate(360deg); }
                            }
                        `}</style>
                        <div style={{ fontSize: "15px", fontWeight: "500", color: "#94a3b8" }}>
                            Đang tải dữ liệu bản đồ...
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {!isReplayEditMode && !isAnyPreviewMode ? (
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
                        sectionTitle={activeSection.title || "Đang tải project"}
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
                        onStopPreview={() => { }}
                        onResetPreview={() => { }}
                    />
                    <ResizeHandle
                        title="Resize left panel"
                        onDrag={(deltaX) => {
                            setLeftPanelWidth((prev) => clampNumber(prev + deltaX, 220, 520));
                        }}
                    />
                </>
            ) : null}

            <div style={{ flex: 1, position: "relative", minHeight: "100vh" }}>
                {isBackgroundVisibilityReady ? (
                    <Map
                        ref={mapHandleRef}
                        mode={mode}
                        onSetMode={setMode}
                        renderDraft={mapRenderDraft}
                        labelContextDraft={mapLabelContextDraft}
                        labelTimelineYear={activeTimelineFilterEnabled ? activeTimelineYear : null}
                        selectedFeatureIds={selectedFeatureIds}
                        onSelectFeatureIds={setSelectedFeatureIds}
                        onCreateFeature={handleCreateFeature}
                        onDeleteFeature={(id) => {
                            if (Array.isArray(id)) {
                                editor.deleteFeatures(id);
                            } else {
                                editor.deleteFeature(id);
                            }
                        }}
                        onHideFeature={handleHideGeometryLocal}
                        onUpdateFeature={editor.updateFeature}
                        allowGeometryEditing={!isAnyPreviewMode}
                        backgroundVisibility={backgroundVisibility}
                        geometryVisibility={effectiveGeometryVisibility}
                        applyGeometryBindingFilter={
                            isReplayEditMode || isReplayPreviewMode
                                ? false
                                : isViewerPreviewMode
                                    ? true
                                    : geometryBindingFilterEnabled
                        }
                        onFeatureClick={isAnyPreviewMode ? handlePreviewMapFeatureClick : undefined}

                        focusFeatureCollection={
                            isAnyPreviewMode
                                ? replayPreviewActiveEntityGeometries
                                : geometryFocusRequest?.collection || null
                        }
                        focusRequestKey={
                            isAnyPreviewMode
                                ? (replayPreviewActiveEntity ? previewEntityFocusToken : null)
                                : geometryFocusRequest?.key ?? null
                        }
                        focusPadding={
                            isAnyPreviewMode
                                ? {
                                    top: 84,
                                    right: isReplayPreviewWikiSidebarOpen ? previewSidebarWidth + 80 : 84,
                                    bottom: 116,
                                    left: 84,
                                }
                                : 96
                        }
                        imageOverlay={imageOverlay}
                        onImageOverlayChange={setImageOverlay}
                        onBindGeometries={handleBindGeometries}
                        showViewportControls={!isReplayPreviewMode || replayPreview.zoomPanelVisible}
                        isPreviewMode={isAnyPreviewMode}
                        onEnterPreview={!isReplayEditMode && !isAnyPreviewMode ? openViewerPreview : undefined}
                        onExitPreview={isReplayPreviewMode ? exitReplayPreview : isViewerPreviewMode ? exitViewerPreview : undefined}
                        onPlayPreviewReplay={isViewerPreviewMode && viewerPreviewSelectedReplay ? openSelectedViewerReplayPreview : undefined}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                    />
                ) : (
                    <div style={{ width: "100%", height: "100%", background: "#0b1220" }} />
                )}
                {isReplayPreviewMode ? (
                    <ReplayPreviewOverlay
                        isPreviewMode={true}
                        isPlaying={replayPreview.isPlaying}
                        dialog={replayPreview.dialog}
                        toasts={replayPreview.toasts}
                        sidebarOpen={isReplayPreviewWikiSidebarOpen}
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
                {isAnyPreviewMode && isReplayPreviewWikiSidebarOpen ? (
                    <aside
                        style={{
                            position: "absolute",
                            top: 16,
                            right: 16,
                            bottom: 16,
                            maxWidth: "calc(100vw - 2rem)",
                            zIndex: 20,
                        }}
                    >
                        <PublicWikiSidebar
                            entity={replayPreviewActiveEntity}
                            wiki={replayPreviewActiveWiki}
                            isLoading={isPreviewWikiLoading}
                            error={replayPreview.activeWikiId || replayPreviewActiveEntity ? previewWikiError : "Chưa có wiki được chọn trong step này."}
                            onClose={closeReplayPreviewSidebar}
                            onWikiLinkRequest={handleReplayPreviewWikiLinkRequest}
                            sidebarWidth={previewSidebarWidth}
                            onSidebarWidthChange={setPreviewSidebarWidth}
                            maxDragWidth={typeof window !== "undefined" ? Math.min(800, window.innerWidth - 340) : 800}
                        />
                    </aside>
                ) : null}
                {isAnyPreviewMode ? (
                    <aside
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: 18,
                            transform: "translateY(-50%)",
                            zIndex: 16,
                            pointerEvents: "auto",
                        }}
                    >
                        <ReplayPreviewLayerPanel
                            backgroundVisibility={backgroundVisibility}
                            geometryVisibility={effectiveGeometryVisibility}
                            onToggleBackground={(id) =>
                                setBackgroundVisibility((prev) => {
                                    const next = { ...prev, [id]: !prev[id] };
                                    persistBackgroundLayerVisibility(next);
                                    return next;
                                })
                            }
                            onToggleGeometry={(typeKey) =>
                                setGeometryVisibility((prev) => ({
                                    ...prev,
                                    [typeKey]: prev[typeKey] === false,
                                }))
                            }
                        />
                    </aside>
                ) : null}
                {isAnyPreviewMode && previewFeaturePopupAnchor && previewFeaturePopupEntities.length > 0 ? (
                    <div
                        className="absolute z-30 w-[320px] max-w-[calc(100vw-2rem)]"
                        style={{
                            left: clampNumber(previewFeaturePopupAnchor.point.x + 18, 16, typeof window !== "undefined" ? window.innerWidth - 340 : previewFeaturePopupAnchor.point.x + 18),
                            top: clampNumber(previewFeaturePopupAnchor.point.y - 8, 16, typeof window !== "undefined" ? window.innerHeight - 280 : previewFeaturePopupAnchor.point.y - 8),
                        }}
                    >
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur">
                            {(() => {
                                // 1. Expanded entity (nested wiki selection)
                                if (previewExpandedEntityId) {
                                    const entity = previewRelations.entitiesById[previewExpandedEntityId];
                                    if (!entity) return null;
                                    const wikis = previewRelations.entityWikisById[previewExpandedEntityId] || [];
                                    return (
                                        <div className="p-3">
                                            <div className="flex items-center gap-2 mb-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewExpandedEntityId(null)}
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-xs text-slate-300 hover:bg-white/[0.08]"
                                                >
                                                    &larr;
                                                </button>
                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[180px]">
                                                    {entity.name}
                                                </span>
                                            </div>
                                            <div className="text-sm font-bold text-white mb-2">Chọn Wiki bài viết:</div>
                                            <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-1">
                                                {wikis.map((wiki) => (
                                                    <button
                                                        key={wiki.id}
                                                        type="button"
                                                        onClick={() => {
                                                            selectReplayPreviewEntity(entity.id, {
                                                                sourceFeatureId: previewFeaturePopupAnchor.featureId,
                                                                preferredWikiId: wiki.id,
                                                                focusMap: true,
                                                                selectGeometry: true,
                                                            });
                                                            setPreviewFeaturePopupAnchor(null);
                                                            setPreviewExpandedEntityId(null);
                                                        }}
                                                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-sky-400/40 hover:bg-sky-500/10"
                                                    >
                                                        📄 {wiki.title}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }

                                // 2. Case 1: Exactly 1 entity bound to geometry
                                if (previewFeaturePopupEntities.length === 1) {
                                    const singleEntity = previewFeaturePopupEntities[0];
                                    const entityWikis = previewRelations.entityWikisById[singleEntity.id] || [];
                                    if (entityWikis.length === 1) {
                                        const singleWiki = entityWikis[0];
                                        const blockquoteMatch = singleWiki.content
                                            ? singleWiki.content.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/)
                                            : null;
                                        let previewSummary = blockquoteMatch ? blockquoteMatch[1].trim() : "";

                                        if (!previewSummary) {
                                            const pMatch = singleWiki.content
                                                ? singleWiki.content.match(/<p[^>]*>([\s\S]*?)<\/p>/)
                                                : null;
                                            previewSummary = pMatch ? pMatch[1].trim() : "";
                                        }

                                        if (!previewSummary) {
                                            previewSummary = singleEntity.description || "Không có mô tả hay tóm tắt.";
                                        }
                                        const cleanSummaryText = previewSummary
                                            .replace(/<[^>]*>/g, "")
                                            .replace(/&nbsp;/gi, " ")
                                            .replace(/\u00a0/g, " ")
                                            .replace(/&amp;/gi, "&")
                                            .replace(/&lt;/gi, "<")
                                            .replace(/&gt;/gi, ">")
                                            .replace(/&quot;/gi, '"')
                                            .replace(/&#39;/g, "'")
                                            .trim();

                                        return (
                                            <div className="p-4 flex flex-col gap-3">
                                                <div>
                                                    <div className="text-base font-bold text-white mt-1">
                                                        {singleEntity.name}
                                                    </div>
                                                </div>
                                                <div
                                                    className="text-sm text-slate-300 italic pl-3 leading-relaxed pr-1"
                                                    style={{
                                                        borderLeft: "3px solid rgba(56, 189, 248, 0.4)",
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 4,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                        whiteSpace: "normal",
                                                    }}
                                                >
                                                    {cleanSummaryText}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        selectReplayPreviewEntity(singleEntity.id, {
                                                            sourceFeatureId: previewFeaturePopupAnchor.featureId,
                                                            focusMap: true,
                                                            selectGeometry: true,
                                                        });
                                                        setPreviewFeaturePopupAnchor(null);
                                                    }}
                                                    className="w-full rounded-lg bg-sky-500 hover:bg-sky-600 px-3 py-2 text-center text-xs font-semibold text-white transition shadow-lg shadow-sky-500/20"
                                                >
                                                    Xem chi tiết Wiki &rarr;
                                                </button>
                                            </div>
                                        );
                                    } else if (entityWikis.length > 1) {
                                        return (
                                            <div className="p-3">
                                                <div className="border-b border-white/10 pb-2 mb-2">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        Entity
                                                    </div>
                                                    <div className="text-base font-bold text-white">
                                                        {singleEntity.name}
                                                    </div>
                                                    <div className="text-xs text-slate-400 mt-1">
                                                        Thực thể này có nhiều Wiki liên kết. Chọn để đọc:
                                                    </div>
                                                </div>
                                                <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-1">
                                                    {entityWikis.map((wiki) => (
                                                        <button
                                                            key={wiki.id}
                                                            type="button"
                                                            onClick={() => {
                                                                selectReplayPreviewEntity(singleEntity.id, {
                                                                    sourceFeatureId: previewFeaturePopupAnchor.featureId,
                                                                    preferredWikiId: wiki.id,
                                                                    focusMap: true,
                                                                    selectGeometry: true,
                                                                });
                                                                setPreviewFeaturePopupAnchor(null);
                                                            }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-sky-400/40 hover:bg-sky-500/10"
                                                        >
                                                            📄 {wiki.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                }

                                // 3. Case 2: Multiple entities bound to geometry
                                return (
                                    <div>
                                        <div className="border-b border-white/10 px-4 py-3">
                                            <div className="text-sm font-semibold text-white">Related Entities</div>
                                            <div className="mt-1 text-xs text-slate-400">
                                                Geometry #{String(previewFeaturePopupAnchor.featureId)}
                                            </div>
                                        </div>
                                        <div className="max-h-[252px] overflow-y-auto">
                                            <div className="grid gap-2 p-3">
                                                {previewFeaturePopupEntities.map((entity) => {
                                                    const entityWikis = previewRelations.entityWikisById[entity.id] || [];
                                                    return (
                                                        <button
                                                            key={entity.id}
                                                            type="button"
                                                            onClick={() => {
                                                                if (entityWikis.length > 1) {
                                                                    setPreviewExpandedEntityId(entity.id);
                                                                } else {
                                                                    selectReplayPreviewEntity(entity.id, {
                                                                        sourceFeatureId: previewFeaturePopupAnchor.featureId,
                                                                        focusMap: true,
                                                                        selectGeometry: true,
                                                                    });
                                                                    setPreviewFeaturePopupAnchor(null);
                                                                }
                                                            }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="truncate text-sm font-semibold text-white">
                                                                    {entity.name}
                                                                </div>
                                                                {entityWikis.length > 1 ? (
                                                                    <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full font-medium">
                                                                        {entityWikis.length} Wikis
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div
                                                                className="mt-1 text-xs leading-5 text-slate-400"
                                                                style={{
                                                                    display: "-webkit-box",
                                                                    WebkitLineClamp: 2,
                                                                    WebkitBoxOrient: "vertical",
                                                                    overflow: "hidden",
                                                                }}
                                                            >
                                                                {entity.description?.trim() || "Không có mô tả."}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                ) : null}
                {!isReplayPreviewMode || replayPreview.timelineVisible ? (
                    <TimelineBar
                        year={activeTimelineYear}
                        onYearChange={
                            isReplayPreviewMode
                                ? replayPreview.setTimelineYear
                                : isViewerPreviewMode
                                    ? handleViewerPreviewTimelineYearChange
                                    : handleTimelineYearChange
                        }
                        isLoading={false}
                        disabled={false}
                        statusText={null}
                        filterEnabled={activeTimelineFilterEnabled}
                        onFilterEnabledChange={
                            isReplayPreviewMode
                                ? replayPreview.setTimelineFilterEnabled
                                : isViewerPreviewMode
                                    ? handleViewerPreviewTimelineFilterChange
                                    : setTimelineFilterEnabled
                        }
                        style={
                            isAnyPreviewMode && isReplayPreviewWikiSidebarOpen
                                ? { right: `${previewSidebarWidth + 32}px` }
                                : undefined
                        }
                    />
                ) : null}
                {isAnyPreviewMode && previewLinkEntityPopup ? (
                    <div
                        ref={previewLinkEntityPopupRef}
                        className="fixed z-[60] w-[240px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
                        style={{ top: previewLinkEntityPopup.top, left: previewLinkEntityPopup.left }}
                    >
                        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Related Entities
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                /wiki/{previewLinkEntityPopup.slug}
                            </div>
                        </div>
                        <div className="max-h-[220px] overflow-y-auto p-2">
                            <div className="grid gap-1">
                                {previewLinkEntityPopup.entities.map((entity) => (
                                    <button
                                        key={entity.id}
                                        type="button"
                                        onClick={() => {
                                            selectReplayPreviewEntity(entity.id, { preferredWikiSlug: previewLinkEntityPopup.slug });
                                            setPreviewLinkEntityPopup(null);
                                        }}
                                        className="rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.04] dark:hover:text-white"
                                    >
                                        {entity.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {!isReplayEditMode && !isAnyPreviewMode ? (
                <>
                    <ResizeHandle
                        title="Resize right panel"
                        onDrag={(deltaX) => {
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
                                    selectedGeometryChildIds={selectedGeometryChildIds}
                                    onToggleBindGeometryForSelectedGeometry={handleToggleBindGeometryForSelectedGeometry}
                                    onFocusGeometry={handleFocusGeometryFromBindingPanel}
                                />

                                <ProjectEntityRefsPanel
                                    onCreateEntityOnly={handleCreateEntityOnly}
                                    onUpdateEntity={handleUpdateEntityInProject}
                                    hasSelectedGeometry={Boolean(selectedFeature)}
                                    selectedGeometryTime={selectedGeometryTime}
                                    onToggleBindEntityForSelectedGeometry={handleToggleBindEntityForSelectedGeometry}
                                    onRerollEntityId={handleRerollEntityId}
                                    onDeleteEntity={handleDeleteEntity}
                                />

                                <WikiSidebarPanel
                                    projectId={projectId}
                                    setWikis={setSnapshotWikisUndoable}
                                    onRemoveWiki={removeSnapshotWikiUndoable}
                                />

                                <EntityWikiBindingsPanel
                                    setLinks={setSnapshotEntityWikiLinksUndoable}
                                />
                                {selectedFeatures.length > 0 ? (
                                    <SelectedGeometryPanel
                                        selectedFeatures={selectedFeatures}
                                        onApplyGeometryMetadata={featureCommands.applyGeometryMetadata}
                                        onDeleteFeatures={(ids) => {
                                            editor.deleteFeatures(ids);
                                            setSelectedFeatureIds([]);
                                        }}
                                        onDeselectAll={() => setSelectedFeatureIds([])}
                                        changeCount={editor.changeCount}
                                        onReplayEdit={(id) => setMode("replay", id)}
                                        onRerollGeometryId={handleRerollGeometryId}
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

function hasPlayableReplaySteps(replay: BattleReplay | null | undefined) {
    return Boolean(
        replay?.detail?.some((stage) => Array.isArray(stage?.steps) && stage.steps.length > 0)
    );
}

function buildReplayPreviewDraftFromSource(sourceDraft: FeatureCollection, replay: BattleReplay): FeatureCollection {
    const targetIds = normalizeReplayPreviewTargetGeometryIds(replay);
    return {
        type: "FeatureCollection",
        features: targetIds
            .map((id) =>
                sourceDraft.features.find((feature) => String(feature.properties.id) === id) || null
            )
            .filter((feature): feature is Feature => Boolean(feature))
            .map((feature) => ({
                ...deepClone(feature),
                properties: {
                    ...deepClone(feature.properties),
                    bound_with: null,
                },
            })),
    };
}

function normalizeReplayPreviewTargetGeometryIds(replay: BattleReplay) {
    const orderedIds: string[] = [];
    const seen = new Set<string>();
    const pushId = (rawId: string | number | null | undefined) => {
        if (rawId == null) return;
        const id = String(rawId).trim();
        if (!id.length || seen.has(id)) return;
        seen.add(id);
        orderedIds.push(id);
    };

    pushId(replay.geometry_id);
    for (const rawId of replay.target_geometry_ids || []) pushId(rawId);
    return orderedIds;
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

function buildPreviewRelationIndex(options: {
    draft: FeatureCollection;
    entities: Entity[];
    wikis: WikiSnapshot[];
    entityWikiLinks: EntityWikiLinkSnapshot[];
    wikiCache: Record<string, Wiki>;
    projectId: string;
}): PreviewRelationIndex {
    const next: PreviewRelationIndex = {
        entitiesById: {},
        entityGeometriesById: {},
        entityWikisById: {},
        geometryEntityIds: {},
        wikiEntityIdsById: {},
        wikiEntityIdsBySlug: {},
        wikiById: {},
        wikiBySlug: {},
    };

    for (const entity of options.entities || []) {
        const id = String(entity?.id || "").trim();
        if (!id) continue;
        next.entitiesById[id] = entity;
    }

    for (const wikiSnapshot of options.wikis || []) {
        if (!wikiSnapshot || wikiSnapshot.operation === "delete") continue;
        const wiki = snapshotWikiToWiki(wikiSnapshot, options.wikiCache, options.projectId);
        if (!wiki?.id) continue;
        next.wikiById[wiki.id] = wiki;
        const slug = String(wiki.slug || "").trim();
        if (slug) next.wikiBySlug[slug] = wiki;
    }

    for (const feature of options.draft.features || []) {
        const geometryId = String(feature.properties.id);
        for (const entityId of normalizeFeatureEntityIds(feature)) {
            if (!next.entitiesById[entityId]) {
                next.entitiesById[entityId] = { id: entityId, name: entityId };
            }
            pushUniqueString(next.geometryEntityIds, geometryId, entityId);
            if (!next.entityGeometriesById[entityId]) {
                next.entityGeometriesById[entityId] = { type: "FeatureCollection", features: [] };
            }
            if (!next.entityGeometriesById[entityId].features.some((item) => String(item.properties.id) === geometryId)) {
                next.entityGeometriesById[entityId].features.push(feature);
            }
        }
    }

    for (const link of options.entityWikiLinks || []) {
        if (!link || link.operation === "delete") continue;
        const entityId = String(link.entity_id || "").trim();
        const wikiId = String(link.wiki_id || "").trim();
        const entity = next.entitiesById[entityId] || null;
        const wiki = next.wikiById[wikiId] || null;
        if (!entity || !wiki) continue;

        if (!next.entityWikisById[entityId]) next.entityWikisById[entityId] = [];
        if (!next.entityWikisById[entityId].some((item) => item.id === wiki.id)) {
            next.entityWikisById[entityId].push(wiki);
        }

        pushUniqueString(next.wikiEntityIdsById, wiki.id, entityId);
        const slug = String(wiki.slug || "").trim();
        if (slug) pushUniqueString(next.wikiEntityIdsBySlug, slug, entityId);
    }

    normalizeRelationArrays(next.geometryEntityIds);
    normalizeRelationArrays(next.wikiEntityIdsById);
    normalizeRelationArrays(next.wikiEntityIdsBySlug);
    return next;
}

function snapshotWikiToWiki(snapshot: WikiSnapshot, wikiCache: Record<string, Wiki>, projectId: string): Wiki {
    if (typeof snapshot.doc === "string") {
        return {
            id: snapshot.id,
            project_id: projectId,
            title: snapshot.title,
            slug: snapshot.slug ?? null,
            content: snapshot.doc || "",
        };
    }

    return wikiCache[snapshot.id] || {
        id: snapshot.id,
        project_id: projectId,
        title: snapshot.title,
        slug: snapshot.slug ?? null,
        content: "",
    };
}

function pushUniqueString(target: Record<string, string[]>, key: string, value: string) {
    if (!target[key]) {
        target[key] = [value];
        return;
    }
    if (!target[key].includes(value)) {
        target[key].push(value);
    }
}

function normalizeRelationArrays(target: Record<string, string[]>) {
    for (const key of Object.keys(target)) {
        target[key] = Array.from(new Set(target[key]));
    }
}

function computeFixedPopupPosition(rect: DOMRect, width: number, height: number) {
    const margin = 12;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
    const preferredLeft = rect.right + margin;
    const maxLeft = Math.max(margin, viewportWidth - width - margin);
    const left = Math.min(preferredLeft, maxLeft);

    const preferredTop = rect.top;
    const maxTop = Math.max(margin, viewportHeight - height - margin);
    const top = Math.max(margin, Math.min(preferredTop, maxTop));

    return { top, left };
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
                    time_start: normalizeTimelineYearValue(entity?.time_start),
                    time_end: normalizeTimelineYearValue(entity?.time_end),
                };
            }).filter((candidate) => candidate !== null);

            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    entity_id: entityIds[0] || null,
                    entity_ids: entityIds,
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
