"use client";

import {
    createContext,
    useContext,
    useState,
    type ReactNode,
    type SetStateAction,
} from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { EntityGeometriesSearchItem } from "@/uhm/api/geometries";
import type { Wiki } from "@/uhm/api/wikis";
import type { FeatureCollection, FeatureId } from "@/uhm/types/geo";
import type { Entity, EntitySnapshot } from "@/uhm/types/entities";
import type { EntityWikiLinkSnapshot, EditorSnapshot, Project, ProjectCommit, ProjectState } from "@/uhm/types/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type {
    EditorMode,
    EntityFormState,
    GeometryMetaFormState,
    TimelineRange,
} from "@/uhm/lib/editor/session/sessionTypes";
import type { UnifiedSearchKind } from "@/uhm/components/ui/UnifiedSearchBar";
import {
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
    type BackgroundLayerVisibility,
} from "@/uhm/lib/map/styles/backgroundLayers";
import { GEO_TYPE_KEYS } from "@/uhm/lib/map/geo/geoTypeMap";
import { clampYearValue } from "@/uhm/lib/utils/timeline";

export type GeometryFocusRequest = {
    key: number;
    collection: FeatureCollection;
};

type EditorStoreValues = {
    // Editor mode + baseline FeatureCollection used to seed/reset useEditorState.
    mode: EditorMode;
    baselineFeatureCollection: FeatureCollection;
    // Task flags; setTaskFlag ensures only one blocking task is active at a time.
    isSaving: boolean;
    isSubmitting: boolean;
    isOpeningSection: boolean;
    // Project/commit state loaded from backend.
    availableSections: Project[];
    selectedProjectId: string;
    newSectionTitle: string;
    commitTitle: string;
    editorUserIdInput: string;
    activeSection: Project | null;
    projectState: ProjectState | null;
    sectionCommits: ProjectCommit[];
    baselineSnapshot: EditorSnapshot | null;
    // Entity state: backend catalog plus snapshot-local rows and form/search status.
    entityCatalog: Entity[];
    snapshotEntityRows: EntitySnapshot[];
    entityStatus: string | null;
    selectedFeatureIds: FeatureId[];
    entityForm: EntityFormState;
    selectedGeometryEntityIds: string[];
    geometryMetaForm: GeometryMetaFormState;
    isEntitySubmitting: boolean;
    entityFormStatus: string | null;
    entitySearchResults: Entity[];
    isEntitySearchLoading: boolean;
    // Timeline + background layer state for map filtering/rendering.
    timelineDraftYear: number;
    backgroundVisibility: BackgroundLayerVisibility;
    isBackgroundVisibilityReady: boolean;
    // Wiki state and entity-wiki relationship snapshot.
    snapshotWikis: WikiSnapshot[];
    snapshotEntityWikiLinks: EntityWikiLinkSnapshot[];
    blockedPendingSubmissionId: string | null;
    // Unified search state shared by entity/wiki/geo search UI.
    searchKind: UnifiedSearchKind;
    searchQuery: string;
    searchQueryDraft: string;
    wikiSearchResults: Wiki[];
    isWikiSearching: boolean;
    geoSearchResults: EntityGeometriesSearchItem[];
    isGeoSearching: boolean;
    requestedActiveWikiId: string | null;
    // Layout sizing and panel filter state.
    leftPanelWidth: number;
    rightPanelWidth: number;
    timelineFilterEnabled: boolean;
    geometryBindingFilterEnabled: boolean;
    geoBindingStatus: string | null;
    hoveredGeometryId: string | null;
    // Map focus/replay visibility state.
    geometryFocusRequest: GeometryFocusRequest | null;
    replayFeatureId: string | number | null;
    hideOutside: boolean;
    // Map visibility overrides keyed by either a geometry id or a semantic geo type key.
    geometryVisibility: Record<string, boolean>;
};

type EditorStoreActions = {
    setMode: (next: SetStateAction<EditorMode>) => void;
    setBaselineFeatureCollection: (next: SetStateAction<FeatureCollection>) => void;
    setIsSaving: (next: SetStateAction<boolean>) => void;
    setIsSubmitting: (next: SetStateAction<boolean>) => void;
    setIsOpeningSection: (next: SetStateAction<boolean>) => void;
    setAvailableSections: (next: SetStateAction<Project[]>) => void;
    setSelectedProjectId: (next: SetStateAction<string>) => void;
    setNewSectionTitle: (next: SetStateAction<string>) => void;
    setCommitTitle: (next: SetStateAction<string>) => void;
    setEditorUserIdInput: (next: SetStateAction<string>) => void;
    setActiveSection: (next: SetStateAction<Project | null>) => void;
    setProjectState: (next: SetStateAction<ProjectState | null>) => void;
    setProjectCommits: (next: SetStateAction<ProjectCommit[]>) => void;
    setBaselineSnapshot: (next: SetStateAction<EditorSnapshot | null>) => void;
    setEntityCatalog: (next: SetStateAction<Entity[]>) => void;
    setSnapshotEntityRows: (next: SetStateAction<EntitySnapshot[]>) => void;
    setEntityStatus: (next: SetStateAction<string | null>) => void;
    setSelectedFeatureIds: (next: SetStateAction<FeatureId[]>) => void;
    setEntityForm: (next: SetStateAction<EntityFormState>) => void;
    setSelectedGeometryEntityIds: (next: SetStateAction<string[]>) => void;
    setGeometryMetaForm: (next: SetStateAction<GeometryMetaFormState>) => void;
    setIsEntitySubmitting: (next: SetStateAction<boolean>) => void;
    setEntityFormStatus: (next: SetStateAction<string | null>) => void;
    setEntitySearchResults: (next: SetStateAction<Entity[]>) => void;
    setIsEntitySearchLoading: (next: SetStateAction<boolean>) => void;
    setTimelineDraftYear: (next: SetStateAction<number>) => void;
    setBackgroundVisibility: (next: SetStateAction<BackgroundLayerVisibility>) => void;
    setIsBackgroundVisibilityReady: (next: SetStateAction<boolean>) => void;
    setSnapshotWikis: (next: SetStateAction<WikiSnapshot[]>) => void;
    setSnapshotEntityWikiLinks: (next: SetStateAction<EntityWikiLinkSnapshot[]>) => void;
    setBlockedPendingSubmissionId: (next: SetStateAction<string | null>) => void;
    setSearchKind: (next: SetStateAction<UnifiedSearchKind>) => void;
    setSearchQuery: (next: SetStateAction<string>) => void;
    setSearchQueryDraft: (next: SetStateAction<string>) => void;
    setWikiSearchResults: (next: SetStateAction<Wiki[]>) => void;
    setIsWikiSearching: (next: SetStateAction<boolean>) => void;
    setGeoSearchResults: (next: SetStateAction<EntityGeometriesSearchItem[]>) => void;
    setIsGeoSearching: (next: SetStateAction<boolean>) => void;
    setRequestedActiveWikiId: (next: SetStateAction<string | null>) => void;
    setLeftPanelWidth: (next: SetStateAction<number>) => void;
    setRightPanelWidth: (next: SetStateAction<number>) => void;
    setTimelineFilterEnabled: (next: SetStateAction<boolean>) => void;
    setGeometryBindingFilterEnabled: (next: SetStateAction<boolean>) => void;
    setGeoBindingStatus: (next: SetStateAction<string | null>) => void;
    setHoveredGeometryId: (next: SetStateAction<string | null>) => void;
    setGeometryFocusRequest: (next: SetStateAction<GeometryFocusRequest | null>) => void;
    setReplayFeatureId: (next: SetStateAction<string | number | null>) => void;
    setHideOutside: (next: SetStateAction<boolean>) => void;
    setGeometryVisibility: (next: SetStateAction<Record<string, boolean>>) => void;
};

export type EditorStoreState = EditorStoreValues & EditorStoreActions;
export type EditorStoreApi = StoreApi<EditorStoreState>;

export type EditorStoreOptions = {
    emptyFeatureCollection: FeatureCollection;
    defaultEditorUserId: string;
    fallbackTimelineRange: TimelineRange;
    currentYear: number;
};

// Hỗ trợ setter nhận cả value trực tiếp và updater function giống React setState.
function resolveNextState<T>(next: SetStateAction<T>, prev: T): T {
    return typeof next === "function" ? (next as (prevState: T) => T)(prev) : next;
}

// Khởi tạo visibility mặc định cho từng geo type trong map.
function buildInitialGeometryVisibility() {
    const next: Record<string, boolean> = {};
    for (const key of GEO_TYPE_KEYS) {
        next[key] = true;
    }
    return next;
}

export function createEditorStore(options: EditorStoreOptions): EditorStoreApi {
    // Năm timeline ban đầu luôn nằm trong fixed range để slider/map nhất quán.
    const initialTimelineYear = clampYearValue(
        options.currentYear,
        options.fallbackTimelineRange.min,
        options.fallbackTimelineRange.max
    );

    return createStore<EditorStoreState>()((set) => {
        // Setter generic để tránh lặp boilerplate cho từng field trong store.
        const setValue = <K extends keyof EditorStoreValues>(
            key: K,
            next: SetStateAction<EditorStoreValues[K]>
        ) => {
            set((state) => {
                const nextValue = resolveNextState(next, state[key]);
                if (Object.is(nextValue, state[key])) return state;
                return {
                    [key]: nextValue,
                } as Pick<EditorStoreValues, K>;
            });
        };

        // Setter riêng cho task flags vì saving/submitting/opening không nên đồng thời true.
        const setTaskFlag = (
            task: "saving" | "submitting" | "opening-project",
            next: SetStateAction<boolean>
        ) => {
            set((state) => {
                const currentValue =
                    task === "saving"
                        ? state.isSaving
                        : task === "submitting"
                            ? state.isSubmitting
                            : state.isOpeningSection;
                const nextValue = resolveNextState(next, currentValue);

                if (nextValue) {
                    return {
                        isSaving: task === "saving",
                        isSubmitting: task === "submitting",
                        isOpeningSection: task === "opening-project",
                    };
                }

                if (!currentValue) {
                    return {};
                }

                if (task === "saving") return { isSaving: false };
                if (task === "submitting") return { isSubmitting: false };
                return { isOpeningSection: false };
            });
        };

        return {
            mode: "idle",
            baselineFeatureCollection: options.emptyFeatureCollection,
            isSaving: false,
            isSubmitting: false,
            isOpeningSection: false,
            availableSections: [],
            selectedProjectId: "",
            newSectionTitle: "",
            commitTitle: "",
            editorUserIdInput: options.defaultEditorUserId,
            activeSection: null,
            projectState: null,
            sectionCommits: [],
            baselineSnapshot: null,
            entityCatalog: [],
            snapshotEntityRows: [],
            entityStatus: null,
            selectedFeatureIds: [],
            entityForm: {
                name: "",
                description: "",
                time_start: "",
                time_end: "",
            },
            selectedGeometryEntityIds: [],
            geometryMetaForm: {
                type_key: "",
                time_start: "",
                time_end: "",
            },
            isEntitySubmitting: false,
            entityFormStatus: null,
            entitySearchResults: [],
            isEntitySearchLoading: false,
            timelineDraftYear: initialTimelineYear,
            backgroundVisibility: { ...HIDDEN_BACKGROUND_LAYER_VISIBILITY },
            isBackgroundVisibilityReady: false,
            snapshotWikis: [],
            snapshotEntityWikiLinks: [],
            blockedPendingSubmissionId: null,
            searchKind: "entity",
            searchQuery: "",
            searchQueryDraft: "",
            wikiSearchResults: [],
            isWikiSearching: false,
            geoSearchResults: [],
            isGeoSearching: false,
            requestedActiveWikiId: null,
            leftPanelWidth: 280,
            rightPanelWidth: 420,
            timelineFilterEnabled: true,
            geometryBindingFilterEnabled: true,
            geoBindingStatus: null,
            hoveredGeometryId: null,
            geometryFocusRequest: null,
            replayFeatureId: null,
            hideOutside: false,
            geometryVisibility: buildInitialGeometryVisibility(),
            setMode: (next) => setValue("mode", next),
            setBaselineFeatureCollection: (next) => setValue("baselineFeatureCollection", next),
            setIsSaving: (next) => setTaskFlag("saving", next),
            setIsSubmitting: (next) => setTaskFlag("submitting", next),
            setIsOpeningSection: (next) => setTaskFlag("opening-project", next),
            setAvailableSections: (next) => setValue("availableSections", next),
            setSelectedProjectId: (next) => setValue("selectedProjectId", next),
            setNewSectionTitle: (next) => setValue("newSectionTitle", next),
            setCommitTitle: (next) => setValue("commitTitle", next),
            setEditorUserIdInput: (next) => setValue("editorUserIdInput", next),
            setActiveSection: (next) => setValue("activeSection", next),
            setProjectState: (next) => setValue("projectState", next),
            setProjectCommits: (next) => setValue("sectionCommits", next),
            setBaselineSnapshot: (next) => setValue("baselineSnapshot", next),
            setEntityCatalog: (next) => setValue("entityCatalog", next),
            setSnapshotEntityRows: (next) => setValue("snapshotEntityRows", next),
            setEntityStatus: (next) => setValue("entityStatus", next),
            setSelectedFeatureIds: (next) => setValue("selectedFeatureIds", next),
            setEntityForm: (next) => setValue("entityForm", next),
            setSelectedGeometryEntityIds: (next) => setValue("selectedGeometryEntityIds", next),
            setGeometryMetaForm: (next) => setValue("geometryMetaForm", next),
            setIsEntitySubmitting: (next) => setValue("isEntitySubmitting", next),
            setEntityFormStatus: (next) => setValue("entityFormStatus", next),
            setEntitySearchResults: (next) => setValue("entitySearchResults", next),
            setIsEntitySearchLoading: (next) => setValue("isEntitySearchLoading", next),
            setTimelineDraftYear: (next) => setValue("timelineDraftYear", next),
            setBackgroundVisibility: (next) => setValue("backgroundVisibility", next),
            setIsBackgroundVisibilityReady: (next) => setValue("isBackgroundVisibilityReady", next),
            setSnapshotWikis: (next) => setValue("snapshotWikis", next),
            setSnapshotEntityWikiLinks: (next) => setValue("snapshotEntityWikiLinks", next),
            setBlockedPendingSubmissionId: (next) => setValue("blockedPendingSubmissionId", next),
            setSearchKind: (next) => setValue("searchKind", next),
            setSearchQuery: (next) => setValue("searchQuery", next),
            setSearchQueryDraft: (next) => setValue("searchQueryDraft", next),
            setWikiSearchResults: (next) => setValue("wikiSearchResults", next),
            setIsWikiSearching: (next) => setValue("isWikiSearching", next),
            setGeoSearchResults: (next) => setValue("geoSearchResults", next),
            setIsGeoSearching: (next) => setValue("isGeoSearching", next),
            setRequestedActiveWikiId: (next) => setValue("requestedActiveWikiId", next),
            setLeftPanelWidth: (next) => setValue("leftPanelWidth", next),
            setRightPanelWidth: (next) => setValue("rightPanelWidth", next),
            setTimelineFilterEnabled: (next) => setValue("timelineFilterEnabled", next),
            setGeometryBindingFilterEnabled: (next) => setValue("geometryBindingFilterEnabled", next),
            setGeoBindingStatus: (next) => setValue("geoBindingStatus", next),
            setHoveredGeometryId: (next) => setValue("hoveredGeometryId", next),
            setGeometryFocusRequest: (next) => setValue("geometryFocusRequest", next),
            setReplayFeatureId: (next) => setValue("replayFeatureId", next),
            setHideOutside: (next) => setValue("hideOutside", next),
            setGeometryVisibility: (next) => setValue("geometryVisibility", next),
        };
    });
}

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

type EditorStoreProviderProps = {
    children: ReactNode;
    options: EditorStoreOptions;
};

export function EditorStoreProvider({ children, options }: EditorStoreProviderProps) {
    // State giữ store instance ổn định trong suốt vòng đời provider.
    const [store] = useState(() => createEditorStore(options));

    return (
        <EditorStoreContext.Provider value={store}>
            {children}
        </EditorStoreContext.Provider>
    );
}

export function useEditorStore<T>(selector: (state: EditorStoreState) => T) {
    // Hook đọc store bằng selector để component chỉ re-render theo slice cần thiết.
    const store = useContext(EditorStoreContext);
    if (!store) {
        throw new Error("useEditorStore must be used within EditorStoreProvider.");
    }

    return useStore(store, selector);
}

export function useEditorStoreApi() {
    // Hook lấy raw StoreApi cho command layer cần getState/setState ngoài render.
    const store = useContext(EditorStoreContext);
    if (!store) {
        throw new Error("useEditorStoreApi must be used within EditorStoreProvider.");
    }

    return store;
}
