"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Map from "@/uhm/components/Map";
import Editor from "@/uhm/components/Editor";
import BackgroundLayersPanel from "@/uhm/components/editor/BackgroundLayersPanel";
import TimelineBar from "@/uhm/components/ui/TimelineBar";
import SelectedGeometryPanel from "@/uhm/components/editor/SelectedGeometryPanel";
import WikiSidebarPanel from "@/uhm/components/wiki/WikiSidebarPanel";
import ProjectEntityRefsPanel from "@/uhm/components/editor/ProjectEntityRefsPanel";
import EntityWikiBindingsPanel from "@/uhm/components/editor/EntityWikiBindingsPanel";
import GeometryBindingPanel from "@/uhm/components/editor/GeometryBindingPanel";
import { Entity, fetchEntities, searchEntitiesByName } from "@/uhm/api/entities";
import { ApiError } from "@/uhm/api/http";
import { fetchCurrentUser } from "@/uhm/api/auth";
import { ProjectCommit } from "@/uhm/api/projects";
import { searchWikisByTitle, type Wiki } from "@/uhm/api/wikis";
import { searchGeometriesByEntityName, type EntityGeometriesSearchItem, type EntityGeometrySearchGeo } from "@/uhm/api/geometries";
import type { EntitySnapshot } from "@/uhm/types/entities";
import {
    Feature,
    FeatureCollection,
    Geometry,
    useEditorState,
} from "@/uhm/lib/editor/state/useEditorState";
import { GEO_TYPE_KEYS, geoTypeCodeToTypeKey } from "@/uhm/lib/map/geo/geoTypeMap";
import {
    BackgroundLayerId,
    BackgroundLayerVisibility,
    DEFAULT_BACKGROUND_LAYER_VISIBILITY,
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/map/styles/backgroundLayers";
import {
    GEOMETRY_TYPE_OPTIONS,
} from "@/uhm/lib/map/geo/geometryTypeOptions";
import {
    EntityFormState,
    GeometryMetaFormState,
    useEditorSessionState,
} from "@/uhm/lib/editor/state/useEditorSessionState";
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
    persistBackgroundLayerVisibility,
} from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { useProjectCommands } from "@/uhm/lib/editor/project/useProjectCommands";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/map/geo/constants";
import { FIXED_TIMELINE_RANGE, clampYearToFixedRange } from "@/uhm/lib/utils/timeline";
import { useFeatureCommands } from "./featureCommands";
import { deleteSubmission } from "@/uhm/api/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import UnifiedSearchBar, { type UnifiedSearchKind } from "@/uhm/components/ui/UnifiedSearchBar";

const CURRENT_YEAR = new Date().getUTCFullYear();
const DEFAULT_EDITOR_USER_ID = "local-editor";

export default function Page() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = String(params.id || "");
    const openedProjectIdRef = useRef<string | null>(null);
    const autoOpenWiki = searchParams.get("only") === "wiki";
    const wikiOnly = autoOpenWiki;
    const [blockedPendingSubmissionId, setBlockedPendingSubmissionId] = useState<string | null>(null);
    const [searchKind, setSearchKind] = useState<UnifiedSearchKind>("entity");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchQueryDraft, setSearchQueryDraft] = useState("");
    const [wikiSearchResults, setWikiSearchResults] = useState<Wiki[]>([]);
    const [isWikiSearching, setIsWikiSearching] = useState(false);
    const [geoSearchResults, setGeoSearchResults] = useState<EntityGeometriesSearchItem[]>([]);
    const [isGeoSearching, setIsGeoSearching] = useState(false);
    const [requestedActiveWikiId, setRequestedActiveWikiId] = useState<string | null>(null);
    const [leftPanelWidth, setLeftPanelWidth] = useState(280);
    const [rightPanelWidth, setRightPanelWidth] = useState(420);
    const [timelineFilterEnabled, setTimelineFilterEnabled] = useState(true);
    const [geometryBindingFilterEnabled, setGeometryBindingFilterEnabled] = useState(true);
    const entityFormStatusTimeoutRef = useRef<number | null>(null);
    const geoBindingStatusTimeoutRef = useRef<number | null>(null);
    const [geoBindingStatus, setGeoBindingStatus] = useState<string | null>(null);
    const [geometryFocusRequest, setGeometryFocusRequest] = useState<{
        key: number;
        collection: FeatureCollection;
    } | null>(null);
    const lastSelectedFeatureIdRef = useRef<string | null>(null);

    const {
        mode,
        setMode,
        initialData,
        setInitialData,
        isSaving,
        setIsSaving,
        isSubmitting,
        setIsSubmitting,
        isOpeningSection,
        setIsOpeningSection,
        setAvailableSections,
        selectedProjectId,
        setSelectedProjectId,
        newSectionTitle,
        setNewSectionTitle,
        commitTitle,
        setCommitTitle,
        editorUserIdInput,
        activeSection,
        setActiveSection,
        projectState,
        setProjectState,
        sectionCommits,
        setProjectCommits,
        baselineSnapshot,
        setBaselineSnapshot,
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
        isEntitySubmitting,
        setIsEntitySubmitting,
        entityFormStatus,
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
    } = useEditorSessionState({
        emptyFeatureCollection: EMPTY_FEATURE_COLLECTION,
        defaultEditorUserId: DEFAULT_EDITOR_USER_ID,
        fallbackTimelineRange: FIXED_TIMELINE_RANGE,
        currentYear: CURRENT_YEAR,
    });
    // Counter để bỏ qua response cũ khi user gõ search entity liên tục.
    const entitySearchRequestRef = useRef(0);
    const wikiSearchRequestRef = useRef(0);
    const geoSearchRequestRef = useRef(0);

    const [geometryVisibility, setGeometryVisibility] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const key of GEO_TYPE_KEYS) init[key] = true;
        return init;
    });

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

    const editor = useEditorState(initialData, {
        snapshotEntitiesRef,
        setSnapshotEntities,
        snapshotWikisRef,
        setSnapshotWikis,
        snapshotEntityWikiLinksRef,
        setSnapshotEntityWikiLinks,
    });
    const setSnapshotWikisUndoable = useCallback(
        (next: SetStateAction<WikiSnapshot[]>) => {
            editor.setSnapshotWikis(next, "Cập nhật wiki");
        },
        [editor]
    );
    const setSnapshotEntityWikiLinksUndoable = useCallback(
        (next: SetStateAction<EntityWikiLinkSnapshot[]>) => {
            editor.setSnapshotEntityWikiLinks(next, "Cập nhật entity-wiki");
        },
        [editor]
    );
    const editorUserId = normalizeEditorUserId(editorUserIdInput);
    const snapshotEntitiesAsEntities = useMemo(() => {
        const rows = snapshotEntities || [];
        return rows
            .filter((e) => e && e.operation !== "delete")
            .map((e) => ({
                id: String(e.id || ""),
                name: String(e.name || "").trim() || String(e.id || ""),
                description: e.description ?? null,
                status: typeof e.status === "number" ? e.status : 1,
                geometry_count: 0,
            }))
            .filter((e) => e.id.length > 0 && e.name.length > 0);
    }, [snapshotEntities]);

    const entities = useMemo(
        () => mergeEntitySearchResults(entityCatalog, snapshotEntitiesAsEntities),
        [entityCatalog, snapshotEntitiesAsEntities]
    );
    const entitiesRef = useRef(entities);
    useEffect(() => {
        entitiesRef.current = entities;
    }, [entities]);

    const snapshotEntitiesVisible = useMemo(() => {
        const byId = new globalThis.Map<string, EntitySnapshot>();
        for (const ref of snapshotEntities || []) {
            const id = String(ref?.id || "").trim();
            if (!id || byId.has(id)) continue;
            if (ref.operation === "delete") continue;
            byId.set(id, ref);
        }
        return Array.from(byId.values());
    }, [snapshotEntities]);

    // Timeline filter: only affects persisted snapshot features.
    // New features created in the current session remain visible regardless of time range.
    const timelineVisibleDraft = useMemo(() => {
        if (!timelineFilterEnabled) return editor.draft;
        const year = clampYearToFixedRange(Math.trunc(timelineDraftYear));
        return {
            ...editor.draft,
            features: editor.draft.features.filter((feature) => {
                if (!editor.hasPersistedFeature(feature.properties.id)) return true;
                return isFeatureVisibleAtYear(feature, year);
            }),
        };
    }, [editor, timelineDraftYear, timelineFilterEnabled]);

    const projectEntityChoices = useMemo(() => {
        const ids = new Set<string>();
        for (const ref of snapshotEntitiesVisible) ids.add(String(ref.id));
        const rows = Array.from(ids).map((id) => {
            const found = entities.find((e) => e.id === id) || null;
            return { id, name: found?.name || id };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        return rows;
    }, [entities, snapshotEntitiesVisible]);
    const selectedFeatures = useMemo(() => {
        if (!selectedFeatureIds || selectedFeatureIds.length === 0) return [];
        return selectedFeatureIds
            .map(id => editor.draft.features.find(f => String(f.properties.id) === String(id)))
            .filter(Boolean) as Feature[];
    }, [selectedFeatureIds, editor.draft.features]);

    const isMultiEditValid = useMemo(() => {
        if (selectedFeatures.length <= 1) return true;
        const firstShape = selectedFeatures[0].geometry.type;
        return selectedFeatures.every(f => f.geometry.type === firstShape);
    }, [selectedFeatures]);

    const selectedFeature = selectedFeatures.length > 0 && isMultiEditValid ? selectedFeatures[0] : null;

    const geometryChoices = useMemo(() => {
        const createdGeometryIds = new Set<string>();
        for (const [id, change] of editor.changes.entries()) {
            if (change.action === "create") createdGeometryIds.add(String(id));
        }

        const rows = (editor.draft.features || [])
            .filter((f) => f && f.properties && (typeof f.properties.id === "string" || typeof f.properties.id === "number"))
            .map((f) => {
                const id = String(f.properties.id);
                const semantic = String(f.properties.type || getDefaultTypeIdForFeature(f) || "").trim();
                const label = semantic.length ? `${semantic} (${f.geometry.type})` : f.geometry.type;
                return {
                    id,
                    label,
                    isNew: createdGeometryIds.has(id) || !editor.hasPersistedFeature(f.properties.id),
                };
            });
        rows.sort((a, b) => a.id.localeCompare(b.id));
        return rows;
    }, [editor]);

    const selectedGeometryBindingIds = useMemo(() => {
        if (!selectedFeature) return [];
        return normalizeFeatureBindingIds(selectedFeature);
    }, [selectedFeature]);

    const createdEntities = useMemo(() => {
        return (snapshotEntities || [])
            .filter((e) => e && e.source === "inline" && e.operation === "create")
            .map((e) => ({
                id: String(e.id || ""),
                name: String(e.name || "").trim() || String(e.id || ""),
            }))
            .filter((e) => e.id.length > 0 && e.name.length > 0);
    }, [snapshotEntities]);

    const createdGeometries = useMemo(() => {
        const rows: Array<{
            id: string | number;
            geometryType: string;
            semanticType?: string | null;
            entityNames: string[];
        }> = [];

        for (const change of editor.changes.values()) {
            if (change.action !== "create") continue;
            const feature = change.feature;
            const entityNames = normalizeFeatureEntityIds(feature)
                .map((entityId) => entities.find((entity) => entity.id === entityId)?.name || entityId);

            rows.push({
                id: feature.properties.id,
                geometryType: feature.geometry.type,
                semanticType: feature.properties.type || getDefaultTypeIdForFeature(feature),
                entityNames,
            });
        }

        return rows;
    }, [editor.changes, entities]);

    const wikiDirty = useMemo(() => {
        const prev = normalizeWikisForCompare(baselineSnapshot?.wikis);
        const next = normalizeWikisForCompare(snapshotWikis);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [baselineSnapshot?.wikis, snapshotWikis]);

    const entitiesDirty = useMemo(() => {
        const prev = normalizeEntitiesForCompare(baselineSnapshot?.entities);
        const next = normalizeEntitiesForCompare(snapshotEntities);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [baselineSnapshot?.entities, snapshotEntities]);

    const entityWikiDirty = useMemo(() => {
        const prev = normalizeEntityWikiLinksForCompare(baselineSnapshot?.entity_wiki);
        const next = normalizeEntityWikiLinksForCompare(snapshotEntityWikiLinks);
        try {
            return JSON.stringify(prev) !== JSON.stringify(next);
        } catch {
            return true;
        }
    }, [snapshotEntityWikiLinks, baselineSnapshot?.entity_wiki]);

    const pendingSaveCount =
        editor.changeCount
        + (wikiDirty ? 1 : 0)
        + (entitiesDirty ? 1 : 0)
        + (entityWikiDirty ? 1 : 0);

    const sectionCommands = useProjectCommands({
        editor,
        editorUserId,
        emptyFeatureCollection: EMPTY_FEATURE_COLLECTION,
        activeSection,
        projectState,
        selectedProjectId,
        newSectionTitle,
        pendingSaveCount,
        snapshotEntities,
        snapshotWikis,
        snapshotEntityWikiLinks,
        baselineSnapshot,
        commitTitle,
        setActiveSection,
        setSelectedProjectId,
        setProjectState,
        setBaselineSnapshot,
        setInitialData,
        setProjectCommits,
        setSnapshotEntities,
        setSnapshotWikis,
        setSnapshotEntityWikiLinks,
        setEntityFormStatus,
        setSelectedFeatureIds,
        setEntityStatus,
        setIsSaving,
        setIsSubmitting,
        setIsOpeningSection,
        setAvailableSections,
        setNewSectionTitle,
        setCommitTitle,
    });
    const {
        openSectionForEditing,
        commitSection,
        submitCurrentSection,
        restoreCommit,
    } = sectionCommands;

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
    }, [openSectionForEditing, projectId, router, setEntityStatus, setIsOpeningSection]);

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
    }, [blockedPendingSubmissionId, openProject, setEntityStatus, setIsOpeningSection]);

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
    }, [searchKind, searchQuery]);

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
    }, [geoSearchRequestRef, searchKind, searchQuery]);

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

    const updateBackgroundVisibility = (
        updater: (prev: BackgroundLayerVisibility) => BackgroundLayerVisibility
    ) => {
        setBackgroundVisibility((prev) => {
            const next = updater(prev);
            persistBackgroundLayerVisibility(next);
            return next;
        });
    };

    const handleToggleBackgroundLayer = (id: BackgroundLayerId) => {
        updateBackgroundVisibility((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const handleShowAllBackgroundLayers = () => {
        updateBackgroundVisibility(() => ({ ...DEFAULT_BACKGROUND_LAYER_VISIBILITY }));
    };

    const handleHideAllBackgroundLayers = () => {
        updateBackgroundVisibility(() => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY }));
    };

    const handleTimelineYearChange = (nextYear: number) => {
        setTimelineDraftYear(clampYearToFixedRange(Math.trunc(nextYear)));
    };

    const handleEntityFormChange = (key: keyof EntityFormState, value: string) => {
        setEntityForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleGeometryMetaFormChange = (key: keyof GeometryMetaFormState, value: string) => {
        setGeometryMetaForm((prev) => ({ ...prev, [key]: value }));
    };

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

    const handleUpdateEntityInProject = useCallback((entityId: string, payload: { name: string; description: string | null }) => {
        const id = String(entityId || "").trim();
        if (!id) return;
        const nextName = String(payload?.name || "").trim();
        if (!nextName.length) {
            flashEntityFormStatus("Ten entity la bat buoc.");
            return;
        }
        const nextDescription = payload?.description == null ? null : String(payload.description);

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
            };
        }), `Cap nhat entity #${id}`);
        flashEntityFormStatus("Da cap nhat entity. Commit khi san sang.", 3000);
    }, [editor, flashEntityFormStatus]);

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
            for (const feature of selectedFeatures) {
                editor.patchFeatureProperties(
                    feature.properties.id,
                    buildFeatureEntityPatch(feature, nextEntityIds, entities)
                );
            }
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
            for (const feature of selectedFeatures) {
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
                editor.patchFeatureProperties(feature.properties.id, { binding: nextBindingIds });
            }
            
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

    const handleFocusGeometryFromBindingPanel = useCallback((geoId: string) => {
        const id = String(geoId || "").trim();
        if (!id) return;

        const feature = editor.draft.features.find((item) => String(item.properties.id) === id) || null;
        if (!feature) {
            flashGeoBindingStatus("Không tìm thấy geometry để zoom.");
            return;
        }

        const visibleInCurrentTimeline = timelineVisibleDraft.features.some(
            (item) => String(item.properties.id) === id
        );
        if (timelineFilterEnabled && !visibleInCurrentTimeline) {
            setTimelineFilterEnabled(false);
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
        setSelectedFeatureIds,
        setTimelineFilterEnabled,
        timelineFilterEnabled,
        timelineVisibleDraft.features,
    ]);

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
                    updated_at: wiki.updated_at,
                },
                ...prev,
            ];
        }, `Thêm wiki ref #${id}`);
        setRequestedActiveWikiId(id);
    }, [editor, setRequestedActiveWikiId]);

    const handleImportGeoFromSearch = useCallback((
        entityItem: EntityGeometriesSearchItem,
        geo: EntityGeometrySearchGeo
    ) => {
        const geoId = String(geo?.id || "").trim();
        if (!geoId) return;

        // Ensure the geometry stays selectable even if it doesn't match the current timeline year.
        setTimelineFilterEnabled(false);

        // Keep entity store consistent: importing a geo implies the entity should exist in snapshot + catalog.
        handleAddEntityRefToProject({
            id: entityItem.entity_id,
            name: (entityItem.name || "").trim() || entityItem.entity_id,
            description: (entityItem.description || "").trim() || null,
            status: 1,
            geometry_count: 0,
        });

        const existing = editor.draft.features.find((f) => String(f.properties.id) === geoId) || null;
        if (existing) {
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
        const typeKey = geoTypeCodeToTypeKey(Number(geo.geo_type)) || null;

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

        editor.createFeature(feature);
        setSelectedFeatureIds([feature.properties.id]);
        flashEntityFormStatus("Đã import geometry từ search GEO. Commit khi sẵn sàng.", 3000);
    }, [
        editor,
        flashEntityFormStatus,
        handleAddEntityRefToProject,
        setSelectedFeatureIds,
        setTimelineFilterEnabled,
    ]);

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

    const handleCreateEntityOnly = async () => {
        const name = entityForm.name.trim();
        if (!name) {
            setEntityFormStatus("Tên entity là bắt buộc.");
            return;
        }

        const description = entityForm.description.trim() || null;
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
            status: 1,
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
                        slug: null,
                        description,
                        status: 1,
                    },
                    ...prev,
                ];
            }, `Tạo entity #${entityId}`);
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
            }));
            setEntityStatus(null);
            setEntityFormStatus("Đã tạo entity mới (local). Commit khi sẵn sàng.");
        } finally {
            setIsEntitySubmitting(false);
        }
    };

    const headCommit = projectState?.head_commit_id
        ? sectionCommits.find((commit) => commit.id === projectState.head_commit_id) || null
        : null;

    const handleCreateFeature = (feature: Feature) => {
        editor.createFeature(feature);
        setSelectedFeatureIds([feature.properties.id]);
    };

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
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
                createdEntities={createdEntities}
                createdGeometries={createdGeometries}
                width={leftPanelWidth}
            />

            <ResizeHandle
                title="Resize left panel"
                onDrag={(deltaX) => {
                    setLeftPanelWidth((prev) => clampNumber(prev + deltaX, 220, 520));
                }}
            />

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

            {!wikiOnly && !blockedPendingSubmissionId ? (
                <div style={{ flex: 1, position: "relative", minHeight: "100vh" }}>
                    {isBackgroundVisibilityReady ? (
                        <Map
                            mode={mode}
                            draft={timelineVisibleDraft}
                            labelContextDraft={editor.draft}
                            selectedFeatureIds={selectedFeatureIds}
                            onSelectFeatureIds={setSelectedFeatureIds}
                            onCreateFeature={handleCreateFeature}
                            onDeleteFeature={editor.deleteFeature}
                            onUpdateFeature={editor.updateFeature}
                            backgroundVisibility={backgroundVisibility}
                            geometryVisibility={geometryVisibility}
                            respectBindingFilter={geometryBindingFilterEnabled}
                            focusFeatureCollection={geometryFocusRequest?.collection || null}
                            focusRequestKey={geometryFocusRequest?.key ?? null}
                            focusPadding={96}
                        />
                    ) : (
                        <div style={{ width: "100%", height: "100%", background: "#0b1220" }} />
                    )}
                    <TimelineBar
                        year={timelineDraftYear}
                        onYearChange={handleTimelineYearChange}
                        isLoading={false}
                        disabled={false}
                        statusText={null}
                        filterEnabled={timelineFilterEnabled}
                        onFilterEnabledChange={setTimelineFilterEnabled}
                    />
                </div>
            ) : blockedPendingSubmissionId ? null : (
                // Wiki-only mode: avoid mounting Map/Timeline (WebGL + geometry fetching) to reduce lag.
                <div style={{ flex: 1, minHeight: "100vh", background: "#0b1220" }} />
            )}

            <ResizeHandle
                title="Resize right panel"
                onDrag={(deltaX) => {
                    // dragging handle (between map and right panel): moving right increases right panel width
                    setRightPanelWidth((prev) => clampNumber(prev - deltaX, 260, 720));
                }}
            />

            <BackgroundLayersPanel
                visibility={backgroundVisibility}
                onToggleLayer={handleToggleBackgroundLayer}
                onShowAll={handleShowAllBackgroundLayers}
                onHideAll={handleHideAllBackgroundLayers}
                geometryVisibility={geometryVisibility}
                onToggleGeometryType={(typeKey) => {
                    setGeometryVisibility((prev) => ({ ...prev, [typeKey]: prev[typeKey] === false }));
                }}
                width={rightPanelWidth}
                topContent={
                    <div style={{ display: "grid", gap: "12px" }}>
                        <UnifiedSearchBar
                            kind={searchKind}
                            onKindChange={(next) => {
                                setSearchKind(next);
                                setSearchQuery("");
                                setSearchQueryDraft("");
                            }}
                            query={searchQuery}
                            onQueryChange={setSearchQuery}
                            onLocalQueryChange={setSearchQueryDraft}
                        />

                        {searchKind === "entity" && searchQueryDraft.trim().length > 0 ? (
                            <div style={{ padding: 10, background: "#0b1220", borderRadius: 8, border: "1px solid #1f2937" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: "white" }}>Entity Results</div>
                                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                        {isEntitySearchLoading ? "Searching…" : `${entitySearchResults.length} results`}
                                    </div>
                                </div>
                                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                                    {entitySearchResults.slice(0, 8).map((e) => (
                                        <div
                                            key={e.id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: 8,
                                                borderRadius: 6,
                                                border: "1px solid #1f2937",
                                                background: "transparent",
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: "#e5e7eb", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {e.name}
                                                </div>
                                                <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {e.id}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAddEntityRefToProject(e)}
                                                style={{
                                                    border: "none",
                                                    background: "#111827",
                                                    color: "#93c5fd",
                                                    cursor: "pointer",
                                                    borderRadius: 6,
                                                    padding: "6px 8px",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                }}
                                                title="Add entity ref to project snapshot"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    ))}
                                    {!isEntitySearchLoading && entitySearchResults.length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#94a3b8" }}>No results.</div>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {searchKind === "wiki" && searchQueryDraft.trim().length > 0 ? (
                            <div style={{ padding: 10, background: "#0b1220", borderRadius: 8, border: "1px solid #1f2937" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: "white" }}>Wiki Results</div>
                                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                        {isWikiSearching ? "Searching…" : `${wikiSearchResults.length} results`}
                                    </div>
                                </div>
                                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                                    {wikiSearchResults.slice(0, 8).map((w) => (
                                        <div
                                            key={w.id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: 8,
                                                borderRadius: 6,
                                                border: "1px solid #1f2937",
                                                background: "transparent",
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: "#e5e7eb", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {(w.title || "").trim() || "Untitled wiki"}
                                                </div>
                                                <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {w.id}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAddWikiRefToProject(w)}
                                                style={{
                                                    border: "none",
                                                    background: "#111827",
                                                    color: "#93c5fd",
                                                    cursor: "pointer",
                                                    borderRadius: 6,
                                                    padding: "6px 8px",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                }}
                                                title="Add wiki ref to project snapshot"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    ))}
                                    {!isWikiSearching && wikiSearchResults.length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#94a3b8" }}>No results.</div>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {searchKind === "geo" && searchQueryDraft.trim().length > 0 ? (
                            <div style={{ padding: 10, background: "#0b1220", borderRadius: 8, border: "1px solid #1f2937" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: "white" }}>Geo Results</div>
                                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                        {isGeoSearching ? "Searching…" : `${geoSearchResults.length} entities`}
                                    </div>
                                </div>
                                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                                    {geoSearchResults.slice(0, 6).map((item) => (
                                        <div
                                            key={item.entity_id}
                                            style={{
                                                padding: 8,
                                                borderRadius: 6,
                                                border: "1px solid #1f2937",
                                                background: "transparent",
                                                display: "grid",
                                                gap: 6,
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {item.name?.trim() || item.entity_id}
                                                    </div>
                                                    <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {item.entity_id}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 12, color: "#94a3b8", flex: "0 0 auto" }}>
                                                    {Array.isArray(item.geometries) ? item.geometries.length : 0} geos
                                                </div>
                                            </div>
                                            {item.description?.trim() ? (
                                                <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.35 }}>
                                                    {item.description.trim()}
                                                </div>
                                            ) : null}
                                            {Array.isArray(item.geometries) && item.geometries.length ? (
                                                <div style={{ display: "grid", gap: 6, maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
                                                    {item.geometries.map((geo) => (
                                                        <div
                                                            key={geo.id}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "space-between",
                                                                gap: 8,
                                                                padding: 8,
                                                                borderRadius: 6,
                                                                border: "1px solid #243244",
                                                                background: "#0f172a",
                                                            }}
                                                        >
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ color: "#e5e7eb", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                    #{geo.id}
                                                                </div>
                                                                <div style={{ color: "#94a3b8", fontSize: 11 }}>
                                                                    type: {String(geo.geo_type)}{" "}
                                                                    {geo.time_start != null || geo.time_end != null
                                                                        ? `| time: ${geo.time_start ?? "?"} → ${geo.time_end ?? "?"}`
                                                                        : ""}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleImportGeoFromSearch(item, geo)}
                                                                style={{
                                                                    border: "none",
                                                                    background: "#111827",
                                                                    color: "#93c5fd",
                                                                    cursor: "pointer",
                                                                    borderRadius: 6,
                                                                    padding: "6px 8px",
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                    flex: "0 0 auto",
                                                                }}
                                                                title="Import geometry into current editor draft"
                                                            >
                                                                Import
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                                    No geometry linked.
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {!isGeoSearching && geoSearchResults.length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#94a3b8" }}>No results.</div>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                        <GeometryBindingPanel
                            geometries={geometryChoices}
                            selectedGeometryId={selectedFeature ? String(selectedFeature.properties.id) : null}
                            selectedGeometryBindingIds={selectedGeometryBindingIds}
                            onToggleBindGeometryForSelectedGeometry={handleToggleBindGeometryForSelectedGeometry}
                            onFocusGeometry={handleFocusGeometryFromBindingPanel}
                            statusText={geoBindingStatus}
                            bindingFilterEnabled={geometryBindingFilterEnabled}
                            onBindingFilterEnabledChange={setGeometryBindingFilterEnabled}
                        />

                        <ProjectEntityRefsPanel
                            entityRefs={snapshotEntitiesVisible}
                            entityForm={entityForm}
                            onEntityFormChange={handleEntityFormChange}
                            isEntitySubmitting={isEntitySubmitting}
                            onCreateEntityOnly={handleCreateEntityOnly}
                            onUpdateEntity={handleUpdateEntityInProject}
                            entityFormStatus={entityFormStatus}
                            hasSelectedGeometry={Boolean(selectedFeature)}
                            selectedGeometryEntityIds={selectedGeometryEntityIds}
                            onToggleBindEntityForSelectedGeometry={handleToggleBindEntityForSelectedGeometry}
                        />

                        <WikiSidebarPanel
                            projectId={projectId}
                            wikis={snapshotWikis}
                            setWikis={setSnapshotWikisUndoable}
                            autoOpen={autoOpenWiki}
                            requestedActiveId={requestedActiveWikiId}
                        />

                        <EntityWikiBindingsPanel
                            entities={projectEntityChoices}
                            wikis={snapshotWikis}
                            links={snapshotEntityWikiLinks}
                            setLinks={setSnapshotEntityWikiLinksUndoable}
                        />
                        {!wikiOnly && selectedFeature ? (
                            <SelectedGeometryPanel
                                selectedFeatures={selectedFeatures}
                                entityTypeOptions={GEOMETRY_TYPE_OPTIONS}
                                geometryMetaForm={geometryMetaForm}
                                onGeometryMetaFormChange={handleGeometryMetaFormChange}
                                isEntitySubmitting={isEntitySubmitting}
                                onApplyGeometryMetadata={featureCommands.applyGeometryMetadata}
                                changeCount={editor.changeCount}
                            />
                        ) : null}
                    </div>
                }
            />
        </div>
    );
}

function ResizeHandle({
    onDrag,
    title,
}: {
    onDrag: (deltaX: number) => void;
    title: string;
}) {
    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        // Only horizontal resize
        event.preventDefault();
        const startX = event.clientX;
        let lastX = startX;

        const onMove = (e: PointerEvent) => {
            const dx = e.clientX - lastX;
            if (dx !== 0) {
                onDrag(dx);
                lastX = e.clientX;
            }
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            title={title}
            onPointerDown={handlePointerDown}
            style={{
                width: 6,
                cursor: "col-resize",
                background: "rgba(148, 163, 184, 0.08)",
                borderLeft: "1px solid rgba(148, 163, 184, 0.18)",
                borderRight: "1px solid rgba(148, 163, 184, 0.18)",
                flex: "0 0 auto",
            }}
        />
    );
}

function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function normalizeEditorUserId(value: string): string {
    const normalized = value.trim();
    return normalized || DEFAULT_EDITOR_USER_ID;
}

function formatCommitTitle(commit: ProjectCommit): string {
    return commit.edit_summary?.trim() || `Commit ${commit.id.slice(0, 8)}`;
}

function isFeatureVisibleAtYear(feature: Feature, year: number): boolean {
    const start = feature.properties.time_start;
    const end = feature.properties.time_end;
    if (typeof start === "number" && Number.isFinite(start) && year < start) return false;
    if (typeof end === "number" && Number.isFinite(end) && year > end) return false;
    return true;
}

function normalizeWikisForCompare(input: WikiSnapshot[] | null | undefined) {
    const list = Array.isArray(input) ? input : [];
    const normalized = list
        .filter((w) => w && typeof w.id === "string" && w.id.trim().length > 0)
        .filter((w) => {
            if (w.source === "ref") return true;
            if (w.operation === "create" || w.operation === "update" || w.operation === "delete") return true;
            const title = typeof w.title === "string" ? w.title.trim() : "";
            const doc = typeof w.doc === "string" ? w.doc.trim() : "";
            return title.length > 0 || (w.doc !== null && doc.length > 0);
        })
        .map((w) => ({
            id: w.id,
            source: w.source,
            title: typeof w.title === "string" ? w.title.trim() : "",
            slug: typeof w.slug === "string" ? w.slug : null,
            doc: w.doc === null ? null : typeof w.doc === "string" ? w.doc.trim() : null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return normalized;
}

function normalizeEntitiesForCompare(input: EntitySnapshot[] | null | undefined) {
    const list = Array.isArray(input) ? input : [];
    const normalized = list
        .filter((e) => e && (typeof e.id === "string" || typeof e.id === "number"))
        .map((e) => ({
            id: String(e.id),
            source: e.source,
            name: typeof e.name === "string" ? e.name.trim() : "",
            slug: typeof e.slug === "string" ? e.slug : null,
            description: e.description == null ? null : String(e.description),
            status: typeof e.status === "number" ? e.status : null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return normalized;
}

function normalizeEntityWikiLinksForCompare(input: Array<{ entity_id: string; wiki_id: string; operation?: string }> | null | undefined) {
    const list = Array.isArray(input) ? input : [];
    const normalized = list
        .filter((l) => l && typeof l.entity_id === "string" && typeof l.wiki_id === "string")
        .map((l) => ({
            entity_id: l.entity_id,
            wiki_id: l.wiki_id,
            operation: l.operation === "delete" ? "delete" : "binding",
        }))
        .sort((a, b) => (a.entity_id + a.wiki_id).localeCompare(b.entity_id + b.wiki_id));
    return normalized;
}

function normalizeGeoSearchGeometry(value: unknown): Geometry | null {
    if (!value || typeof value !== "object") return null;
    const g = value as Record<string, unknown>;
    if (typeof g.type !== "string") return null;
    if (!("coordinates" in g)) return null;
    return value as Geometry;
}

function normalizeGeoSearchBindingIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawId of value) {
        if (typeof rawId !== "string" && typeof rawId !== "number") continue;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }
    return deduped;
}
