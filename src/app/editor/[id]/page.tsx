"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Map from "@/uhm/components/Map";
import Editor from "@/uhm/components/Editor";
import BackgroundLayersPanel from "@/uhm/components/BackgroundLayersPanel";
import TimelineBar from "@/uhm/components/TimelineBar";
import SelectedGeometryPanel from "@/uhm/components/SelectedGeometryPanel";
import WikiSidebarPanel from "@/uhm/components/WikiSidebarPanel";
import ProjectEntityRefsPanel from "@/uhm/components/ProjectEntityRefsPanel";
import EntityWikiBindingsPanel from "@/uhm/components/EntityWikiBindingsPanel";
import { Entity, fetchEntities, searchEntitiesByName } from "@/uhm/api/entities";
import { ApiError } from "@/uhm/api/http";
import { fetchCurrentUser } from "@/uhm/api/auth";
import { fetchGeometriesByBBox } from "@/uhm/api/geometries";
import { SectionCommit } from "@/uhm/api/sections";
import {
    Feature,
    useEditorState,
} from "@/uhm/lib/useEditorState";
import {
    BackgroundLayerId,
    BackgroundLayerVisibility,
    DEFAULT_BACKGROUND_LAYER_VISIBILITY,
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/backgroundLayers";
import {
    DEFAULT_ENTITY_TYPE_ID,
    ENTITY_TYPE_OPTIONS,
    EntityTypeGroupId,
    findEntityTypeOption,
} from "@/uhm/lib/entityTypeOptions";
import {
    EntityFormState,
    PendingEntityCreate,
    useEditorSessionState,
} from "@/uhm/lib/useEditorSessionState";
import {
    getDefaultTypeIdForFeature,
    normalizeFeatureBindingIds,
    normalizeFeatureEntityIds,
    uniqueEntityIds,
} from "@/uhm/lib/editor/snapshot/editorSnapshot";
import {
    buildClientEntityId,
    formatEntityNamesForDisplay,
    mergeEntitiesWithPending,
    mergeEntitySearchResults,
} from "@/uhm/lib/editor/entity/entityBinding";
import {
    formatBindingIdsForDisplay,
} from "@/uhm/lib/editor/geometry/geometryMetadata";
import {
    loadBackgroundLayerVisibilityFromStorage,
    persistBackgroundLayerVisibility,
} from "@/uhm/lib/editor/background/backgroundVisibilityStorage";
import { useSectionCommands } from "@/uhm/lib/editor/section/useSectionCommands";
import { EMPTY_FEATURE_COLLECTION, WORLD_BBOX } from "@/uhm/lib/geo/constants";
import { FIXED_TIMELINE_RANGE, clampYearToFixedRange, TIMELINE_DEBOUNCE_MS } from "@/uhm/lib/timeline";
import { useFeatureCommands } from "./featureCommands";

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
        availableSections,
        setAvailableSections,
        selectedSectionId,
        setSelectedSectionId,
        newSectionTitle,
        setNewSectionTitle,
        commitTitle,
        setCommitTitle,
        commitNote,
        setCommitNote,
        editorUserIdInput,
        setEditorUserIdInput,
        activeSection,
        setActiveSection,
        sectionState,
        setSectionState,
        sectionCommits,
        setSectionCommits,
        lastSectionSnapshot,
        setLastSectionSnapshot,
        persistedEntities,
        setPersistedEntities,
        projectEntityRefs,
        setProjectEntityRefs,
        pendingEntityCreates,
        setPendingEntityCreates,
        createdEntities,
        setCreatedEntities,
        entityStatus,
        setEntityStatus,
        selectedFeatureId,
        setSelectedFeatureId,
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
        entitySearchQuery,
        setEntitySearchQuery,
        entitySearchResults,
        setEntitySearchResults,
        selectedSearchEntityId,
        setSelectedSearchEntityId,
        isEntitySearchLoading,
        setIsEntitySearchLoading,
        timelineYear,
        setTimelineYear,
        timelineDraftYear,
        setTimelineDraftYear,
        isTimelineLoading,
        setIsTimelineLoading,
        timelineStatus,
        setTimelineStatus,
        backgroundVisibility,
        setBackgroundVisibility,
        isBackgroundVisibilityReady,
        setIsBackgroundVisibilityReady,
        wikis,
        setWikis,
        entityWikiLinks,
        setEntityWikiLinks,
    } = useEditorSessionState({
        emptyFeatureCollection: EMPTY_FEATURE_COLLECTION,
        defaultEditorUserId: DEFAULT_EDITOR_USER_ID,
        fallbackTimelineRange: FIXED_TIMELINE_RANGE,
        currentYear: CURRENT_YEAR,
    });
    // Counter để bỏ qua response cũ khi user đổi timeline/section liên tục.
    const timelineFetchRequestRef = useRef(0);
    // Counter để bỏ qua response cũ khi user gõ search entity liên tục.
    const entitySearchRequestRef = useRef(0);

    const editor = useEditorState(initialData);
    const editorUserId = normalizeEditorUserId(editorUserIdInput);
    const entities = useMemo(
        () => mergeEntitiesWithPending(persistedEntities, pendingEntityCreates),
        [persistedEntities, pendingEntityCreates]
    );

    const projectEntityChoices = useMemo(() => {
        const ids = new Set<string>();
        for (const ref of projectEntityRefs) ids.add(String(ref.id));
        for (const feature of editor.draft.features) {
            for (const id of normalizeFeatureEntityIds(feature)) ids.add(id);
        }
        const rows = Array.from(ids).map((id) => {
            const found = entities.find((e) => e.id === id) || null;
            return { id, name: found?.name || id };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        return rows;
    }, [editor.draft.features, entities, projectEntityRefs]);
    const selectedFeature =
        selectedFeatureId === null
            ? null
            : editor.draft.features.find((feature) =>
                String(feature.properties.id) === String(selectedFeatureId)
            ) || null;

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
        const prev = lastSectionSnapshot?.wikis || [];
        try {
            return JSON.stringify(prev) !== JSON.stringify(wikis);
        } catch {
            return true;
        }
    }, [lastSectionSnapshot?.wikis, wikis]);

    const pendingSaveCount = editor.changeCount + pendingEntityCreates.length + (wikiDirty ? 1 : 0);

    const sectionCommands = useSectionCommands({
        editor,
        editorUserId,
        emptyFeatureCollection: EMPTY_FEATURE_COLLECTION,
        activeSection,
        sectionState,
        selectedSectionId,
        newSectionTitle,
        pendingSaveCount,
        pendingEntityCreates,
        projectEntityRefs,
        wikis,
        entityWikiLinks,
        lastSectionSnapshot,
        commitTitle,
        commitNote,
        setActiveSection,
        setSelectedSectionId,
        setSectionState,
        setLastSectionSnapshot,
        setInitialData,
        setSectionCommits,
        setPendingEntityCreates,
        setProjectEntityRefs,
        setCreatedEntities,
        setWikis,
        setEntityWikiLinks,
        setEntityFormStatus,
        setSelectedFeatureId,
        setEntityStatus,
        setIsSaving,
        setIsSubmitting,
        setIsOpeningSection,
        setAvailableSections,
        setNewSectionTitle,
        setCommitTitle,
        setCommitNote,
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
            await openSectionForEditing(projectId);
            setEntityStatus(null);
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 401 || err.status === 400) {
                    router.replace("/signin");
                    return;
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

    useEffect(() => {
        let disposed = false;

        async function ensureAuthenticated() {
            try {
                await fetchCurrentUser();
            } catch (err) {
                if (disposed) return;
                // Follow the same behavior as the rest of FrontEndAdmin: unauthenticated -> /signin.
                router.replace("/signin");
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
    }, [openProject]);

    useEffect(() => {
        let disposed = false;

        async function loadEntities() {
            try {
                const rows = await fetchEntities();
                if (disposed) return;

                setPersistedEntities(rows);
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
    }, [setEntityStatus, setPersistedEntities]);

    useEffect(() => {
        if (!selectedFeature) {
            setEntitySearchResults([]);
            setSelectedSearchEntityId(null);
            setIsEntitySearchLoading(false);
            return;
        }

        const keyword = entitySearchQuery.trim();
        if (!keyword.length) {
            setEntitySearchResults([]);
            setSelectedSearchEntityId(null);
            setIsEntitySearchLoading(false);
            return;
        }

        let disposed = false;
        const requestId = ++entitySearchRequestRef.current;
        const timeoutId = window.setTimeout(async () => {
            setIsEntitySearchLoading(true);
            try {
                const rows = await searchEntitiesByName(keyword, { limit: 30 });
                if (disposed || requestId !== entitySearchRequestRef.current) return;

                const pendingMatches = pendingEntityCreates
                    .filter((entity) =>
                        entity.name.toLowerCase().includes(keyword.toLowerCase()) ||
                        (entity.slug || "").toLowerCase().includes(keyword.toLowerCase())
                    )
                    .map<Entity>((entity) => ({
                        id: entity.id,
                        name: entity.name,
                        slug: entity.slug,
                        type_id: entity.type_id,
                        status: entity.status,
                        geometry_count: 0,
                    }));

                const mergedRows = mergeEntitySearchResults(rows, pendingMatches);
                setEntitySearchResults(mergedRows);
                setSelectedSearchEntityId((prev) =>
                    prev && mergedRows.some((entity) => entity.id === prev)
                        ? prev
                        : mergedRows[0]?.id || null
                );
            } catch (err) {
                if (disposed || requestId !== entitySearchRequestRef.current) return;
                console.error("Search entity by name failed", err);
                const pendingMatches = pendingEntityCreates
                    .filter((entity) =>
                        entity.name.toLowerCase().includes(keyword.toLowerCase()) ||
                        (entity.slug || "").toLowerCase().includes(keyword.toLowerCase())
                    )
                    .map<Entity>((entity) => ({
                        id: entity.id,
                        name: entity.name,
                        slug: entity.slug,
                        type_id: entity.type_id,
                        status: entity.status,
                        geometry_count: 0,
                    }));
                setEntitySearchResults(pendingMatches);
                setSelectedSearchEntityId(pendingMatches[0]?.id || null);
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
        entitySearchQuery,
        selectedFeature,
        pendingEntityCreates,
        setEntitySearchResults,
        setIsEntitySearchLoading,
        setSelectedSearchEntityId,
    ]);

    useEffect(() => {
        if (selectedFeatureId === null) return;
        const stillExists = editor.draft.features.some((feature) =>
            String(feature.properties.id) === String(selectedFeatureId)
        );
        if (!stillExists) {
            setSelectedFeatureId(null);
        }
    }, [editor.draft, selectedFeatureId, setSelectedFeatureId]);

    useEffect(() => {
        if (!selectedFeature) {
            setSelectedGeometryEntityIds([]);
            setGeometryMetaForm({
                time_start: "",
                time_end: "",
                binding: "",
            });
            setEntitySearchQuery("");
            setEntitySearchResults([]);
            setSelectedSearchEntityId(null);
            setEntityFormStatus(null);
            return;
        }

        const featureEntityIds = normalizeFeatureEntityIds(selectedFeature);
        setSelectedGeometryEntityIds(featureEntityIds);
        setGeometryMetaForm({
            time_start: selectedFeature.properties.time_start != null
                ? String(selectedFeature.properties.time_start)
                : "",
            time_end: selectedFeature.properties.time_end != null
                ? String(selectedFeature.properties.time_end)
                : "",
            binding: normalizeFeatureBindingIds(selectedFeature).join(", "),
        });
        setEntitySearchQuery("");
        setEntitySearchResults([]);
        setSelectedSearchEntityId(null);
        setEntityFormStatus(null);
    }, [
        selectedFeature,
        setEntityFormStatus,
        setEntitySearchQuery,
        setEntitySearchResults,
        setGeometryMetaForm,
        setSelectedGeometryEntityIds,
        setSelectedSearchEntityId,
    ]);

    useEffect(() => {
        if (!selectedFeature) return;

        const allowedGroupIds = getAllowedEntityTypeGroupIdsForFeature(selectedFeature);
        const fallbackOption = ENTITY_TYPE_OPTIONS.find((option) =>
            allowedGroupIds.includes(option.groupId)
        );
        if (!fallbackOption) return;

        setEntityForm((prev) => {
            const currentOption = findEntityTypeOption(prev.type_id);
            const isCurrentAllowed = currentOption
                ? allowedGroupIds.includes(currentOption.groupId)
                : false;
            if (isCurrentAllowed || prev.type_id === fallbackOption.value) {
                return prev;
            }
            return {
                ...prev,
                type_id: fallbackOption.value,
            };
        });
    }, [selectedFeature, setEntityForm]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (timelineDraftYear !== timelineYear) {
                setTimelineYear(timelineDraftYear);
            }
        }, TIMELINE_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [timelineDraftYear, timelineYear, setTimelineYear]);

    useEffect(() => {
        setBackgroundVisibility(loadBackgroundLayerVisibilityFromStorage());
        setIsBackgroundVisibilityReady(true);
    }, [setBackgroundVisibility, setIsBackgroundVisibilityReady]);

    useEffect(() => {
        if (activeSection) return;

        let disposed = false;
        const requestId = ++timelineFetchRequestRef.current;

        async function loadGlobalByTimeline() {
            setIsTimelineLoading(true);
            setTimelineStatus(null);

            try {
                const data = await fetchGeometriesByBBox({
                    ...WORLD_BBOX,
                    time: timelineYear,
                });

                if (disposed || requestId !== timelineFetchRequestRef.current) return;
                setInitialData(data);
            } catch (err) {
                if (err instanceof ApiError) {
                    console.error("Load global timeline data failed", err.body);
                } else {
                    console.error("Load global timeline data failed", err);
                }

                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setTimelineStatus("Không tải được geometry global tại mốc thời gian đã chọn.");
                }
            } finally {
                if (!disposed && requestId === timelineFetchRequestRef.current) {
                    setIsTimelineLoading(false);
                }
            }
        }

        loadGlobalByTimeline();

        return () => {
            disposed = true;
        };
    }, [
        timelineYear,
        activeSection,
        setInitialData,
        setIsTimelineLoading,
        setTimelineStatus,
    ]);

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

    const handleGeometryMetaFormChange = (key: "time_start" | "time_end" | "binding", value: string) => {
        setGeometryMetaForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleEntityIdsChange = (values: string[]) => {
        setSelectedGeometryEntityIds(uniqueEntityIds(values));
    };

    const handleAddSelectedSearchEntity = () => {
        const entityId = selectedSearchEntityId ? selectedSearchEntityId.trim() : "";
        if (!entityId.length) {
            setEntityFormStatus("Hãy chọn một entity từ kết quả search trước.");
            return;
        }

        const next = uniqueEntityIds([...selectedGeometryEntityIds, entityId]);
        setSelectedGeometryEntityIds(next);
        setSelectedSearchEntityId(null);
        setEntityFormStatus(null);
    };

    const featureCommands = useFeatureCommands({
        editor,
        selectedFeature,
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

        const slug = entityForm.slug.trim() || null;
        const typeId = entityForm.type_id || DEFAULT_ENTITY_TYPE_ID;
        const normalizedName = name.toLowerCase();
        const duplicatedName = entities.some((entity) => entity.name.trim().toLowerCase() === normalizedName);
        if (duplicatedName) {
            setEntityFormStatus("Tên entity đã tồn tại.");
            return;
        }
        if (slug) {
            const normalizedSlug = slug.toLowerCase();
            const duplicatedSlug = entities.some((entity) =>
                (entity.slug || "").trim().toLowerCase() === normalizedSlug
            );
            if (duplicatedSlug) {
                setEntityFormStatus("Slug entity đã tồn tại.");
                return;
            }
        }

        const entityId = buildClientEntityId();
        const pendingCreate: PendingEntityCreate = {
            id: entityId,
            name,
            slug,
            type_id: typeId,
            status: 1,
        };

        setIsEntitySubmitting(true);
        setEntityFormStatus(null);
        try {
            setPendingEntityCreates((prev) => [pendingCreate, ...prev]);
            setCreatedEntities((prev) => {
                if (prev.some((item) => item.id === pendingCreate.id)) return prev;
                return [
                    {
                        id: pendingCreate.id,
                        name: pendingCreate.name,
                        type_id: pendingCreate.type_id || null,
                    },
                    ...prev,
                ];
            });

            setEntityForm((prev) => ({
                ...prev,
                name: "",
                slug: "",
            }));
            setEntityStatus(null);
            setEntityFormStatus("Đã thêm entity mới vào danh sách chờ Commit.");

            if (selectedFeature) {
                setEntitySearchQuery(pendingCreate.name);
                setSelectedSearchEntityId(pendingCreate.id);
            }
        } finally {
            setIsEntitySubmitting(false);
        }
    };

    const headCommit = sectionState?.head_commit_id
        ? sectionCommits.find((commit) => commit.id === sectionState.head_commit_id) || null
        : null;
    const timelineDisabled = isSaving || pendingSaveCount > 0;
    const timelineStatusText =
        pendingSaveCount > 0
            ? "Commit hoặc Undo hết thay đổi trước khi đổi mốc thời gian."
            : isSaving
                ? "Đang lưu thay đổi..."
                : timelineStatus;

    const handleCreateFeature = (feature: Feature) => {
        editor.createFeature(feature);
        setSelectedFeatureId(feature.properties.id);
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
                sectionStatus={sectionState?.status || "editing"}
                commitTitle={commitTitle}
                commitNote={commitNote}
                onCommitTitleChange={setCommitTitle}
                onCommitNoteChange={setCommitNote}
                commitCount={sectionCommits.length}
                hasHeadCommit={Boolean(sectionState?.head_commit_id)}
                headCommitId={sectionState?.head_commit_id || null}
                latestCommitLabel={headCommit ? `Head: ${formatCommitTitle(headCommit)}` : null}
                commits={sectionCommits}
                changesCount={pendingSaveCount}
                undoStack={editor.undoStack}
                createdEntities={createdEntities}
                createdGeometries={createdGeometries}
            />

            {!wikiOnly ? (
                <div style={{ flex: 1, position: "relative", minHeight: "100vh" }}>
                    {isBackgroundVisibilityReady ? (
                        <Map
                            mode={mode}
                            draft={editor.draft}
                            selectedFeatureId={selectedFeatureId}
                            onSelectFeatureId={setSelectedFeatureId}
                            onCreateFeature={handleCreateFeature}
                            onDeleteFeature={editor.deleteFeature}
                            onUpdateFeature={editor.updateFeature}
                            backgroundVisibility={backgroundVisibility}
                        />
                    ) : (
                        <div style={{ width: "100%", height: "100%", background: "#0b1220" }} />
                    )}
                    <TimelineBar
                        year={timelineDraftYear}
                        onYearChange={handleTimelineYearChange}
                        isLoading={isTimelineLoading}
                        disabled={timelineDisabled}
                        statusText={timelineStatusText}
                    />
                </div>
            ) : (
                // Wiki-only mode: avoid mounting Map/Timeline (WebGL + geometry fetching) to reduce lag.
                <div style={{ flex: 1, minHeight: "100vh", background: "#0b1220" }} />
            )}

            <BackgroundLayersPanel
                visibility={backgroundVisibility}
                onToggleLayer={handleToggleBackgroundLayer}
                onShowAll={handleShowAllBackgroundLayers}
                onHideAll={handleHideAllBackgroundLayers}
                topContent={
                    <div style={{ display: "grid", gap: "12px" }}>
                        <WikiSidebarPanel
                            projectId={projectId}
                            wikis={wikis}
                            setWikis={setWikis}
                            autoOpen={autoOpenWiki}
                        />
                        <ProjectEntityRefsPanel entityRefs={projectEntityRefs} setEntityRefs={setProjectEntityRefs} />
                        <EntityWikiBindingsPanel entities={projectEntityChoices} wikis={wikis} links={entityWikiLinks} setLinks={setEntityWikiLinks} />
                        {!wikiOnly ? (
                            <SelectedGeometryPanel
                                selectedFeature={selectedFeature}
                                selectedFeatureEntitySummary={
                                    selectedFeature
                                        ? formatEntityNamesForDisplay(selectedFeature, entities)
                                        : "Chưa gắn"
                                }
                                selectedFeatureBindingSummary={
                                    selectedFeature
                                        ? formatBindingIdsForDisplay(selectedFeature)
                                        : "Không có"
                                }
                                entities={entities}
                                selectedGeometryEntityIds={selectedGeometryEntityIds}
                                onEntityIdsChange={handleEntityIdsChange}
                                entitySearchQuery={entitySearchQuery}
                                onEntitySearchQueryChange={setEntitySearchQuery}
                                entitySearchResults={entitySearchResults}
                                selectedSearchEntityId={selectedSearchEntityId}
                                onSelectSearchEntityId={setSelectedSearchEntityId}
                                onAddSelectedSearchEntity={handleAddSelectedSearchEntity}
                                isEntitySearchLoading={isEntitySearchLoading}
                                entityForm={entityForm}
                                onEntityFormChange={handleEntityFormChange}
                                entityTypeOptions={ENTITY_TYPE_OPTIONS}
                                geometryMetaForm={geometryMetaForm}
                                onGeometryMetaFormChange={handleGeometryMetaFormChange}
                                isEntitySubmitting={isEntitySubmitting}
                                onCreateEntityOnly={handleCreateEntityOnly}
                                onApplyGeometryMetadata={featureCommands.applyGeometryMetadata}
                                onApplyEntitiesForSelectedGeometry={featureCommands.applyEntitiesToSelectedGeometry}
                                changeCount={editor.changeCount}
                                entityFormStatus={entityFormStatus}
                            />
                        ) : null}
                    </div>
                }
            />
        </div>
    );
}

function normalizeEditorUserId(value: string): string {
    const normalized = value.trim();
    return normalized || DEFAULT_EDITOR_USER_ID;
}

function formatCommitTitle(commit: SectionCommit): string {
    return commit.edit_summary?.trim() || `Commit ${commit.id.slice(0, 8)}`;
}

function getAllowedEntityTypeGroupIdsForFeature(feature: Feature): EntityTypeGroupId[] {
    const defaultTypeId = getDefaultTypeIdForFeature(feature);
    const defaultTypeOption = findEntityTypeOption(defaultTypeId);
    if (defaultTypeOption) {
        return [defaultTypeOption.groupId];
    }
    return ["polygon"];
}
