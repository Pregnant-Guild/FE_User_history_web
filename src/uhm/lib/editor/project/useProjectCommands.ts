import { useCallback } from "react";
import { ApiError } from "@/uhm/api/http";
import {
    createProject,
    createProjectCommit,
    fetchProjectCommits,
    fetchProjects,
    openSectionEditor,
    submitSection,
} from "@/uhm/api/projects";
import {
    buildEditorSnapshot,
    normalizeEditorSnapshot,
    normalizeFeatureEntityIds,
    toApiEditorSnapshot,
} from "@/uhm/lib/editor/snapshot/editorSnapshot";
import { normalizeTimelineYearValue } from "@/uhm/lib/utils/timeline";
import type { Change } from "@/uhm/lib/editor/draft/editorTypes";
import type { Feature, FeatureCollection, GeometryEntitySnapshot, GeometrySnapshot } from "@/uhm/types/geo";
import type { BattleReplay, EditorSnapshot, ProjectCommit, EntityWikiLinkSnapshot } from "@/uhm/types/projects";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EditorStoreApi } from "@/uhm/store/editorStore";

type EditorDraftApi = {
    draft: FeatureCollection;
    mainDraft: FeatureCollection;
    replays: BattleReplay[];
    effectiveReplays: BattleReplay[];
    buildPayload: () => Change[];
    clearChanges: () => void;
    hasPersistedFeature: (id: Feature["properties"]["id"]) => boolean;
};

type Options = {
    editor: EditorDraftApi;
    store: EditorStoreApi;
    emptyFeatureCollection: FeatureCollection;
    pendingSaveCount: number;
};

export function useProjectCommands(options: Options) {
    const openSectionForEditing = useCallback(async (projectId: string) => {
        const state = options.store.getState();
        const editorPayload = await openSectionEditor(projectId);
        const snapshot = normalizeEditorSnapshot(editorPayload.snapshot);
        // When starting a fresh editor session from a commit snapshot, treat all rows as baseline state:
        // operations should not carry over as deltas into the next commit.
        const sessionSnapshot = snapshot ? toEditorSessionSnapshot(snapshot) : null;
        const commits = await fetchProjectCommits(projectId);
        const nextBaselineFeatureCollection = sessionSnapshot?.editor_feature_collection || options.emptyFeatureCollection;

        state.setActiveSection(editorPayload.project);
        state.setSelectedProjectId(editorPayload.project.id);
        state.setProjectState(editorPayload.state);
        state.setBaselineSnapshot(sessionSnapshot);
        state.setBaselineFeatureCollection(nextBaselineFeatureCollection);
        state.setProjectCommits(commits);
        state.setSnapshotEntityRows(sessionSnapshot?.entities || []);
        state.setSnapshotWikis(sessionSnapshot?.wikis || []);
        state.setSnapshotEntityWikiLinks(sessionSnapshot?.entity_wiki || []);
        state.setSelectedFeatureIds([]);
        state.setEntityFormStatus(null);
    }, [options.emptyFeatureCollection, options.store]);

    const commitSection = useCallback(async () => {
        const state = options.store.getState();
        if (!state.activeSection || !state.projectState) {
            state.setEntityStatus("Chưa mở được project editor.");
            return;
        }
        if (options.pendingSaveCount <= 0) {
            state.setEntityStatus("Không có thay đổi để Commit.");
            return;
        }

        const orphanGeometries = findOrphanGeometries(options.editor.mainDraft);
        if (orphanGeometries.length > 0) {
            const firstOrphan = orphanGeometries[0];
            state.setSelectedFeatureIds([firstOrphan.id]);
            state.setEntityFormStatus("Geometry này chưa bind entity.");
            state.setEntityStatus(formatOrphanGeometryMessage("Commit", orphanGeometries));
            return;
        }

        const geometryChanges = options.editor.buildPayload();
        state.setIsSaving(true);
        state.setEntityStatus(null);
        try {
            const snapshot = buildEditorSnapshot({
                project: state.activeSection,
                draft: options.editor.mainDraft,
                changes: geometryChanges,
                snapshotEntityRows: state.snapshotEntityRows,
                snapshotWikis: state.snapshotWikis,
                snapshotEntityWikiLinks: state.snapshotEntityWikiLinks,
                replays: options.editor.effectiveReplays,
                previousSnapshot: state.baselineSnapshot,
                hasPersistedFeature: options.editor.hasPersistedFeature,
            });
            const editSummary = state.commitTitle.trim()
                || `Edit ${new Date().toLocaleString()}`;

            // Guardrail: commit payload can get large and some deployments reject/close connections for big bodies.
            // When that happens, browsers often surface it as "TypeError: Failed to fetch".
            try {
                const payloadText = JSON.stringify({ snapshot_json: toApiEditorSnapshot(snapshot), edit_summary: editSummary });
                const bytes = typeof Blob !== "undefined" ? new Blob([payloadText]).size : payloadText.length;
                const limitBytes = 3_500_000; // ~3.5MB (conservative vs common default body limits)
                if (bytes > limitBytes) {
                    state.setEntityStatus(
                        `Commit payload quá lớn (~${(bytes / (1024 * 1024)).toFixed(2)}MB). ` +
                        `Hãy giảm bớt nội dung snapshot/changes hoặc chạy BE local với body limit lớn hơn.`
                    );
                    return;
                }
            } catch {
                // If stringify fails, let API call throw a more actionable error downstream.
            }

            const result = await createProjectCommit(state.activeSection.id, {
                snapshot,
                edit_summary: editSummary,
            });

            const sessionSnapshot = toEditorSessionSnapshot(snapshot);
            state.setProjectState(result.state);
            state.setBaselineSnapshot(sessionSnapshot);
            state.setSnapshotEntityRows(sessionSnapshot.entities || []);
            state.setSnapshotWikis(sessionSnapshot.wikis || []);
            state.setSnapshotEntityWikiLinks(sessionSnapshot.entity_wiki || []);
            state.setBaselineFeatureCollection(options.editor.mainDraft);
            options.editor.clearChanges();
            state.setCommitTitle("");
            state.setProjectCommits(await fetchProjectCommits(state.activeSection.id));
            state.setEntityFormStatus("Đã tạo commit.");
        } catch (err) {
            if (err instanceof ApiError) {
                console.error("Commit failed", err.body);
                state.setEntityStatus(`Commit thất bại: ${err.body}`);
                return;
            }
            console.error("Commit error", err);
            state.setEntityStatus("Commit thất bại.");
        } finally {
            state.setIsSaving(false);
        }
    }, [options.editor, options.pendingSaveCount, options.store]);

    const openSelectedSection = useCallback(async () => {
        const state = options.store.getState();
        const projectId = state.selectedProjectId.trim();
        if (!projectId) {
            state.setEntityStatus("Hãy chọn project để mở.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            const confirmed = window.confirm("Project hiện tại có thay đổi chưa Commit. Mở project khác sẽ bỏ các thay đổi này. Tiếp tục?");
            if (!confirmed) return;
        }

        state.setIsOpeningSection(true);
        state.setEntityStatus(null);
        try {
            await openSectionForEditing(projectId);
            state.setEntityStatus("Đã mở project để chỉnh sửa.");
        } catch (err) {
            if (err instanceof ApiError) {
                state.setEntityStatus(`Mở project thất bại: ${err.body}`);
            } else {
                state.setEntityStatus("Mở project thất bại.");
            }
        } finally {
            state.setIsOpeningSection(false);
        }
    }, [openSectionForEditing, options.pendingSaveCount, options.store]);

    const createAndOpenSection = useCallback(async () => {
        const state = options.store.getState();
        const title = state.newSectionTitle.trim();
        if (!title) {
            state.setEntityStatus("Tên project là bắt buộc.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            const confirmed = window.confirm("Project hiện tại có thay đổi chưa Commit. Tạo project mới sẽ bỏ các thay đổi này. Tiếp tục?");
            if (!confirmed) return;
        }

        state.setIsOpeningSection(true);
        state.setEntityStatus(null);
        try {
            const project = await createProject({
                title,
                description: null,
            });
            const projects = await fetchProjects();
            state.setAvailableSections(projects);
            state.setNewSectionTitle("");
            await openSectionForEditing(project.id);
            state.setEntityStatus("Đã tạo và mở project mới.");
        } catch (err) {
            if (err instanceof ApiError) {
                state.setEntityStatus(`Tạo project thất bại: ${err.body}`);
            } else {
                state.setEntityStatus("Tạo project thất bại.");
            }
        } finally {
            state.setIsOpeningSection(false);
        }
    }, [openSectionForEditing, options.pendingSaveCount, options.store]);

    const submitCurrentSection = useCallback(async (content: string) => {
        const state = options.store.getState();
        if (!state.activeSection || !state.projectState?.head_commit_id) {
            state.setEntityStatus("Project hiện tại chưa có head để submit.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            state.setEntityStatus("Hãy Commit các thay đổi trước khi Submit.");
            return;
        }

        const orphanGeometries = findOrphanGeometries(options.editor.mainDraft);
        if (orphanGeometries.length > 0) {
            const firstOrphan = orphanGeometries[0];
            state.setSelectedFeatureIds([firstOrphan.id]);
            state.setEntityFormStatus("Geometry này chưa bind entity.");
            state.setEntityStatus(formatOrphanGeometryMessage("Submit", orphanGeometries));
            return;
        }

        state.setIsSubmitting(true);
        state.setEntityStatus(null);
        try {
            const submission = await submitSection(state.activeSection.id, content);
            state.setEntityStatus(`Đã submit, submission ${submission.id}.`);
        } catch (err) {
            if (err instanceof ApiError) {
                state.setEntityStatus(`Submit thất bại: ${err.body}`);
            } else {
                state.setEntityStatus("Submit thất bại.");
            }
        } finally {
            state.setIsSubmitting(false);
        }
    }, [options.editor.mainDraft, options.pendingSaveCount, options.store]);

    const restoreCommit = useCallback(async (commitId: string) => {
        const state = options.store.getState();
        if (!state.activeSection || !state.projectState) {
            state.setEntityStatus("Chưa mở được project editor.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            state.setEntityStatus("Hãy Commit hoặc Undo thay đổi hiện tại trước khi Restore.");
            return;
        }

        state.setIsSaving(true);
        state.setEntityStatus(null);
        try {
            // FE-only restore: load snapshot from selected commit and apply to editor state.
            // Do NOT move project's head commit on backend.
            const commits = await fetchProjectCommits(state.activeSection.id);
            const target = commits.find((c: ProjectCommit) => c.id === commitId) || null;
            if (!target) {
                state.setEntityStatus("Không tìm thấy commit để restore.");
                return;
            }

            const snapshot = normalizeEditorSnapshot(target.snapshot_json);
            const sessionSnapshot = snapshot ? toEditorSessionSnapshot(snapshot) : null;
            const nextBaselineFeatureCollection = sessionSnapshot?.editor_feature_collection || options.emptyFeatureCollection;

            state.setBaselineSnapshot(sessionSnapshot);
            state.setBaselineFeatureCollection(nextBaselineFeatureCollection);
            state.setSnapshotEntityRows(sessionSnapshot?.entities || []);
            state.setSnapshotWikis(sessionSnapshot?.wikis || []);
            state.setSnapshotEntityWikiLinks(sessionSnapshot?.entity_wiki || []);
            state.setSelectedFeatureIds([]);
            state.setEntityFormStatus(null);

            // Refresh commits list for UI, but keep projectState/head as-is.
            state.setProjectCommits(commits);
            state.setEntityFormStatus("Đã load snapshot từ commit (không đổi head trên BE).");
        } catch (err) {
            if (err instanceof ApiError) {
                state.setEntityStatus(`Restore thất bại: ${err.body}`);
            } else {
                state.setEntityStatus("Restore thất bại.");
            }
        } finally {
            state.setIsSaving(false);
        }
    }, [options.emptyFeatureCollection, options.pendingSaveCount, options.store]);

    return {
        openSectionForEditing,
        commitSection,
        openSelectedSection,
        createAndOpenSection,
        submitCurrentSection,
        restoreCommit,
    };
}

type OrphanGeometry = {
    id: Feature["properties"]["id"];
    label: string;
};

function findOrphanGeometries(draft: FeatureCollection): OrphanGeometry[] {
    const rows: OrphanGeometry[] = [];

    for (const feature of draft.features || []) {
        const entityIds = normalizeFeatureEntityIds(feature);
        if (entityIds.length > 0) continue;

        const id = feature.properties.id;
        rows.push({
            id,
            label: String(id),
        });
    }

    return rows;
}

function formatOrphanGeometryMessage(action: "Commit" | "Submit", rows: OrphanGeometry[]): string {
    const sample = rows.slice(0, 8).map((row) => row.label).join(", ");
    const more = rows.length > 8 ? `, ... (+${rows.length - 8})` : "";
    return `Không thể ${action}: còn ${rows.length} geometry chưa bind entity. Hãy bind entity cho: ${sample}${more}.`;
}

function toEditorSessionSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
    return {
        ...snapshot,
        entities: toEditorSessionEntities(snapshot.entities),
        geometries: toEditorSessionGeometries(snapshot.geometries),
        geometry_entity: toEditorSessionGeometryEntity(snapshot.geometry_entity),
        wikis: toEditorSessionWikis(snapshot.wikis),
        entity_wiki: toEditorSessionEntityWikiLinks(snapshot.entity_wiki),
    };
}

type EditorEntityRow = NonNullable<EditorSnapshot["entities"]>[number];
type EditorGeometryRow = NonNullable<EditorSnapshot["geometries"]>[number];
type EditorGeometryEntityRow = NonNullable<EditorSnapshot["geometry_entity"]>[number];
type EditorWikiRow = NonNullable<EditorSnapshot["wikis"]>[number];

function toEditorSessionEntities(input: EditorSnapshot["entities"]): EntitySnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
        .filter((e): e is EditorEntityRow => Boolean(e) && (typeof e.id === "string" || typeof e.id === "number"))
        .filter((e) => e.operation !== "delete")
        .map((e) => {
            const id = String(e.id);
            const source: EntitySnapshot["source"] = e.source === "inline" ? "inline" : "ref";
            return {
                id,
                source,
                operation: "reference",
                name: typeof e.name === "string" ? e.name : undefined,
                description: typeof e.description === "string" ? e.description : e.description ?? null,
                time_start: normalizeTimelineYearValue(e.time_start) ?? undefined,
                time_end: normalizeTimelineYearValue(e.time_end) ?? undefined,
            };
        });
}

function toEditorSessionGeometries(input: EditorSnapshot["geometries"]): GeometrySnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
        .filter((g): g is EditorGeometryRow => Boolean(g) && (typeof g.id === "string" || typeof g.id === "number"))
        .filter((g) => g.operation !== "delete")
        .map((g) => {
            const id = String(g.id);
            const source: GeometrySnapshot["source"] = g.source === "inline" ? "inline" : "ref";
            return {
                id,
                source,
                operation: "reference",
                type: g.type ?? undefined,
                draw_geometry: g.draw_geometry,
                geometry: g.geometry,
                binding: Array.isArray(g.binding) ? [...g.binding] : undefined,
                time_start: normalizeTimelineYearValue(g.time_start) ?? undefined,
                time_end: normalizeTimelineYearValue(g.time_end) ?? undefined,
                bbox: g.bbox
                    ? {
                        min_lng: g.bbox.min_lng,
                        min_lat: g.bbox.min_lat,
                        max_lng: g.bbox.max_lng,
                        max_lat: g.bbox.max_lat,
                    }
                    : g.bbox ?? undefined,
            };
        });
}

function toEditorSessionGeometryEntity(input: EditorSnapshot["geometry_entity"]): GeometryEntitySnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    const deduped = new globalThis.Map<string, GeometryEntitySnapshot>();
    for (const row of rows) {
        if (!row) continue;
        const safeRow = row as EditorGeometryEntityRow;
        if (safeRow.operation === "delete") continue;
        const geometry_id = typeof safeRow.geometry_id === "string" || typeof safeRow.geometry_id === "number"
            ? String(safeRow.geometry_id).trim()
            : "";
        const entity_id = typeof safeRow.entity_id === "string" || typeof safeRow.entity_id === "number"
            ? String(safeRow.entity_id).trim()
            : "";
        if (!geometry_id || !entity_id) continue;
        const key = `${geometry_id}::${entity_id}`;
        deduped.set(key, {
            geometry_id,
            entity_id,
            operation: "reference",
        });
    }
    return Array.from(deduped.values()).sort((a, b) => {
        const g = a.geometry_id.localeCompare(b.geometry_id);
        if (g !== 0) return g;
        return a.entity_id.localeCompare(b.entity_id);
    });
}

function toEditorSessionWikis(input: EditorSnapshot["wikis"]): WikiSnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
        .filter((w): w is EditorWikiRow => Boolean(w) && typeof w.id === "string" && w.id.trim().length > 0)
        .filter((w) => w.operation !== "delete")
        .map((w) => {
            const source: WikiSnapshot["source"] = w.source === "inline" ? "inline" : "ref";
            return {
                id: w.id,
                source,
                operation: "reference",
                title: typeof w.title === "string" ? w.title : "",
                slug: w.slug ?? null,
                doc: w.doc ?? null,
            };
        });
}

function toEditorSessionEntityWikiLinks(input: EditorSnapshot["entity_wiki"]): EntityWikiLinkSnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    const deduped = new globalThis.Map<string, EntityWikiLinkSnapshot>();
    for (const row of rows) {
        if (!row || typeof row.entity_id !== "string" || typeof row.wiki_id !== "string") continue;
        if (row.operation === "delete") continue;
        const entity_id = row.entity_id.trim();
        const wiki_id = row.wiki_id.trim();
        if (!entity_id || !wiki_id) continue;
        const key = `${entity_id}::${wiki_id}`;
        deduped.set(key, { entity_id, wiki_id, operation: "reference" });
    }
    return Array.from(deduped.values()).sort((a, b) => {
        const e = a.entity_id.localeCompare(b.entity_id);
        if (e !== 0) return e;
        return a.wiki_id.localeCompare(b.wiki_id);
    });
}
