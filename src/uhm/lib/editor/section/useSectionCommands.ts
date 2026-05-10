import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ApiError } from "@/uhm/api/http";
import {
    createSection,
    createSectionCommit,
    fetchSectionCommits,
    fetchSections,
    openSectionEditor,
    submitSection,
} from "@/uhm/api/sections";
import { buildEditorSnapshot, normalizeEditorSnapshot } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { Change } from "@/uhm/lib/editor/draft/editorTypes";
import type { Feature, FeatureCollection, FeatureId, GeometryEntitySnapshot, GeometrySnapshot } from "@/uhm/types/geo";
import type { EditorSnapshot, Section, SectionCommit, SectionState, EntityWikiLinkSnapshot } from "@/uhm/types/sections";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { WikiSnapshot } from "@/uhm/types/wiki";

type EditorDraftApi = {
    draft: FeatureCollection;
    buildPayload: () => Change[];
    clearChanges: () => void;
    hasPersistedFeature: (id: Feature["properties"]["id"]) => boolean;
};

type Options = {
    editor: EditorDraftApi;
    editorUserId: string;
    emptyFeatureCollection: FeatureCollection;
    activeSection: Section | null;
    sectionState: SectionState | null;
    selectedSectionId: string;
    newSectionTitle: string;
    pendingSaveCount: number;
    snapshotEntities: EntitySnapshot[];
    snapshotWikis: WikiSnapshot[];
    snapshotEntityWikiLinks: EntityWikiLinkSnapshot[];
    baselineSnapshot: EditorSnapshot | null;
    commitTitle: string;
    setActiveSection: Dispatch<SetStateAction<Section | null>>;
    setSelectedSectionId: Dispatch<SetStateAction<string>>;
    setSectionState: Dispatch<SetStateAction<SectionState | null>>;
    setBaselineSnapshot: Dispatch<SetStateAction<EditorSnapshot | null>>;
    setInitialData: Dispatch<SetStateAction<FeatureCollection>>;
    setSectionCommits: Dispatch<SetStateAction<SectionCommit[]>>;
    setSnapshotEntities: Dispatch<SetStateAction<EntitySnapshot[]>>;
    setSnapshotWikis: Dispatch<SetStateAction<WikiSnapshot[]>>;
    setSnapshotEntityWikiLinks: Dispatch<SetStateAction<EntityWikiLinkSnapshot[]>>;
    setSelectedFeatureId: Dispatch<SetStateAction<FeatureId | null>>;
    setEntityFormStatus: Dispatch<SetStateAction<string | null>>;
    setEntityStatus: Dispatch<SetStateAction<string | null>>;
    setIsSaving: Dispatch<SetStateAction<boolean>>;
    setIsSubmitting: Dispatch<SetStateAction<boolean>>;
    setIsOpeningSection: Dispatch<SetStateAction<boolean>>;
    setAvailableSections: Dispatch<SetStateAction<Section[]>>;
    setNewSectionTitle: Dispatch<SetStateAction<string>>;
    setCommitTitle: Dispatch<SetStateAction<string>>;
};

export function useSectionCommands(options: Options) {
    const openSectionForEditing = useCallback(async (sectionId: string) => {
        const editorPayload = await openSectionEditor(sectionId);
        const snapshot = normalizeEditorSnapshot(editorPayload.snapshot);
        // When starting a fresh editor session from a commit snapshot, treat all rows as baseline state:
        // operations should not carry over as deltas into the next commit.
        const sessionSnapshot = snapshot ? toEditorSessionSnapshot(snapshot) : null;
        const commits = await fetchSectionCommits(sectionId);
        const nextInitialData = sessionSnapshot?.editor_feature_collection || options.emptyFeatureCollection;

        options.setActiveSection(editorPayload.section);
        options.setSelectedSectionId(editorPayload.section.id);
        options.setSectionState(editorPayload.state);
        options.setBaselineSnapshot(sessionSnapshot);
        options.setInitialData(nextInitialData);
        options.setSectionCommits(commits);
        options.setSnapshotEntities(sessionSnapshot?.entities || []);
        options.setSnapshotWikis(sessionSnapshot?.wikis || []);
        options.setSnapshotEntityWikiLinks(sessionSnapshot?.entity_wiki || []);
        options.setSelectedFeatureId(null);
        options.setEntityFormStatus(null);
    }, [options]);

    const commitSection = useCallback(async () => {
        if (!options.activeSection || !options.sectionState) {
            options.setEntityStatus("Chưa mở được section editor.");
            return;
        }
        if (options.pendingSaveCount <= 0) {
            options.setEntityStatus("Không có thay đổi để Commit.");
            return;
        }

        const geometryChanges = options.editor.buildPayload();
        options.setIsSaving(true);
        options.setEntityStatus(null);
        try {
            const snapshot = buildEditorSnapshot({
                section: options.activeSection,
                draft: options.editor.draft,
                changes: geometryChanges,
                snapshotEntities: options.snapshotEntities,
                snapshotWikis: options.snapshotWikis,
                snapshotEntityWikiLinks: options.snapshotEntityWikiLinks,
                previousSnapshot: options.baselineSnapshot,
                hasPersistedFeature: options.editor.hasPersistedFeature,
            });
            const editSummary = options.commitTitle.trim()
                || `Edit ${new Date().toLocaleString()}`;

            // Guardrail: commit payload can get large and some deployments reject/close connections for big bodies.
            // When that happens, browsers often surface it as "TypeError: Failed to fetch".
            try {
                const payloadText = JSON.stringify({ snapshot_json: snapshot, edit_summary: editSummary });
                const bytes = typeof Blob !== "undefined" ? new Blob([payloadText]).size : payloadText.length;
                const limitBytes = 3_500_000; // ~3.5MB (conservative vs common default body limits)
                if (bytes > limitBytes) {
                    options.setEntityStatus(
                        `Commit payload quá lớn (~${(bytes / (1024 * 1024)).toFixed(2)}MB). ` +
                        `Hãy giảm bớt nội dung snapshot/changes hoặc chạy BE local với body limit lớn hơn.`
                    );
                    return;
                }
            } catch {
                // If stringify fails, let API call throw a more actionable error downstream.
            }

            const result = await createSectionCommit(options.activeSection.id, {
                snapshot,
                edit_summary: editSummary,
            });

            const sessionSnapshot = toEditorSessionSnapshot(snapshot);
            options.setSectionState(result.state);
            options.setBaselineSnapshot(sessionSnapshot);
            options.setSnapshotEntities(sessionSnapshot.entities || []);
            options.setSnapshotWikis(sessionSnapshot.wikis || []);
            options.setSnapshotEntityWikiLinks(sessionSnapshot.entity_wiki || []);
            options.setInitialData(options.editor.draft);
            options.editor.clearChanges();
            options.setCommitTitle("");
            options.setSectionCommits(await fetchSectionCommits(options.activeSection.id));
            options.setEntityFormStatus("Đã tạo commit.");
        } catch (err) {
            if (err instanceof ApiError) {
                console.error("Commit failed", err.body);
                options.setEntityStatus(`Commit thất bại: ${err.body}`);
                return;
            }
            console.error("Commit error", err);
            options.setEntityStatus("Commit thất bại.");
        } finally {
            options.setIsSaving(false);
        }
    }, [options]);

    const openSelectedSection = useCallback(async () => {
        const sectionId = options.selectedSectionId.trim();
        if (!sectionId) {
            options.setEntityStatus("Hãy chọn section để mở.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            const confirmed = window.confirm("Section hiện tại có thay đổi chưa Commit. Mở section khác sẽ bỏ các thay đổi này. Tiếp tục?");
            if (!confirmed) return;
        }

        options.setIsOpeningSection(true);
        options.setEntityStatus(null);
        try {
            await openSectionForEditing(sectionId);
            options.setEntityStatus("Đã mở section để chỉnh sửa.");
        } catch (err) {
            if (err instanceof ApiError) {
                options.setEntityStatus(`Mở section thất bại: ${err.body}`);
            } else {
                options.setEntityStatus("Mở section thất bại.");
            }
        } finally {
            options.setIsOpeningSection(false);
        }
    }, [openSectionForEditing, options]);

    const createAndOpenSection = useCallback(async () => {
        const title = options.newSectionTitle.trim();
        if (!title) {
            options.setEntityStatus("Tên section là bắt buộc.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            const confirmed = window.confirm("Section hiện tại có thay đổi chưa Commit. Tạo section mới sẽ bỏ các thay đổi này. Tiếp tục?");
            if (!confirmed) return;
        }

        options.setIsOpeningSection(true);
        options.setEntityStatus(null);
        try {
            const section = await createSection({
                title,
                description: null,
            });
            const sections = await fetchSections();
            options.setAvailableSections(sections);
            options.setNewSectionTitle("");
            await openSectionForEditing(section.id);
            options.setEntityStatus("Đã tạo và mở section mới.");
        } catch (err) {
            if (err instanceof ApiError) {
                options.setEntityStatus(`Tạo section thất bại: ${err.body}`);
            } else {
                options.setEntityStatus("Tạo section thất bại.");
            }
        } finally {
            options.setIsOpeningSection(false);
        }
    }, [openSectionForEditing, options]);

    const submitCurrentSection = useCallback(async (content: string) => {
        if (!options.activeSection || !options.sectionState?.head_commit_id) {
            options.setEntityStatus("Section hiện tại chưa có head để submit.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            options.setEntityStatus("Hãy Commit các thay đổi trước khi Submit.");
            return;
        }

        options.setIsSubmitting(true);
        options.setEntityStatus(null);
        try {
            const submission = await submitSection(options.activeSection.id, content);
            options.setEntityStatus(`Đã submit, submission ${submission.id}.`);
        } catch (err) {
            if (err instanceof ApiError) {
                options.setEntityStatus(`Submit thất bại: ${err.body}`);
            } else {
                options.setEntityStatus("Submit thất bại.");
            }
        } finally {
            options.setIsSubmitting(false);
        }
    }, [options]);

    const restoreCommit = useCallback(async (commitId: string) => {
        if (!options.activeSection || !options.sectionState) {
            options.setEntityStatus("Chưa mở được section editor.");
            return;
        }
        if (options.pendingSaveCount > 0) {
            options.setEntityStatus("Hãy Commit hoặc Undo thay đổi hiện tại trước khi Restore.");
            return;
        }

        options.setIsSaving(true);
        options.setEntityStatus(null);
        try {
            // FE-only restore: load snapshot from selected commit and apply to editor state.
            // Do NOT move project's head commit on backend.
            const commits = await fetchSectionCommits(options.activeSection.id);
            const target = commits.find((c: SectionCommit) => c.id === commitId) || null;
            if (!target) {
                options.setEntityStatus("Không tìm thấy commit để restore.");
                return;
            }

            const snapshot = normalizeEditorSnapshot(target.snapshot_json);
            const sessionSnapshot = snapshot ? toEditorSessionSnapshot(snapshot) : null;
            const nextInitialData = sessionSnapshot?.editor_feature_collection || options.emptyFeatureCollection;

            options.setBaselineSnapshot(sessionSnapshot);
            options.setInitialData(nextInitialData);
            options.setSnapshotEntities(sessionSnapshot?.entities || []);
            options.setSnapshotWikis(sessionSnapshot?.wikis || []);
            options.setSnapshotEntityWikiLinks(sessionSnapshot?.entity_wiki || []);
            options.setSelectedFeatureId(null);
            options.setEntityFormStatus(null);

            // Refresh commits list for UI, but keep sectionState/head as-is.
            options.setSectionCommits(commits);
            options.setEntityFormStatus("Đã load snapshot từ commit (không đổi head trên BE).");
        } catch (err) {
            if (err instanceof ApiError) {
                options.setEntityStatus(`Restore thất bại: ${err.body}`);
            } else {
                options.setEntityStatus("Restore thất bại.");
            }
        } finally {
            options.setIsSaving(false);
        }
    }, [options]);

    return {
        openSectionForEditing,
        commitSection,
        openSelectedSection,
        createAndOpenSection,
        submitCurrentSection,
        restoreCommit,
    };
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

function toEditorSessionEntities(input: EditorSnapshot["entities"]): EntitySnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
        .filter((e) => e && (typeof e.id === "string" || typeof e.id === "number"))
        .filter((e) => (e as any).operation !== "delete")
        .map((e) => {
            const { operation: _op, ...rest } = e;
            const id = String(e.id);
            const source: EntitySnapshot["source"] = e.source === "inline" ? "inline" : "ref";
            return {
                ...(rest as Omit<EntitySnapshot, "id" | "source" | "operation">),
                id,
                source,
                operation: "reference",
            };
        });
}

function toEditorSessionGeometries(input: EditorSnapshot["geometries"]): GeometrySnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
        .filter((g) => g && (typeof (g as any).id === "string" || typeof (g as any).id === "number"))
        .filter((g) => (g as any).operation !== "delete")
        .map((g) => {
            const { operation: _op, ...rest } = g as any;
            const id = String((g as any).id);
            const source: GeometrySnapshot["source"] = (g as any).source === "inline" ? "inline" : "ref";
            return {
                ...(rest as Omit<GeometrySnapshot, "id" | "source" | "operation">),
                id,
                source,
                operation: "reference",
            };
        });
}

function toEditorSessionGeometryEntity(input: EditorSnapshot["geometry_entity"]): GeometryEntitySnapshot[] {
    const rows = Array.isArray(input) ? input : [];
    const deduped = new globalThis.Map<string, GeometryEntitySnapshot>();
    for (const row of rows) {
        if (!row) continue;
        if ((row as any).operation === "delete") continue;
        const geometry_id = typeof (row as any).geometry_id === "string" || typeof (row as any).geometry_id === "number"
            ? String((row as any).geometry_id).trim()
            : "";
        const entity_id = typeof (row as any).entity_id === "string" || typeof (row as any).entity_id === "number"
            ? String((row as any).entity_id).trim()
            : "";
        if (!geometry_id || !entity_id) continue;
        const key = `${geometry_id}::${entity_id}`;
        deduped.set(key, { geometry_id, entity_id, operation: "reference", base_links_hash: (row as any).base_links_hash });
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
        .filter((w) => w && typeof w.id === "string" && w.id.trim().length > 0)
        .filter((w) => (w as any).operation !== "delete")
        .map((w) => {
            const { operation: _op, ...rest } = w;
            const source: WikiSnapshot["source"] = w.source === "inline" ? "inline" : "ref";
            return {
                ...(rest as Omit<WikiSnapshot, "source" | "operation">),
                source,
                operation: "reference",
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
