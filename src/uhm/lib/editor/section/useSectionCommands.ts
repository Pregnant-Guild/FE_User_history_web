import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ApiError } from "@/uhm/api/http";
import {
    createSection,
    createSectionCommit,
    fetchSectionCommits,
    fetchSections,
    openSectionEditor,
    restoreSectionCommit,
    submitSection,
} from "@/uhm/api/sections";
import { buildEditorSnapshot, normalizeEditorSnapshot } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { Change } from "@/uhm/lib/editor/draft/editorTypes";
import type { CreatedEntitySummary, PendingEntityCreate } from "@/uhm/lib/editor/session/sessionTypes";
import type { Feature, FeatureCollection, FeatureId } from "@/uhm/types/geo";
import type { EditorSnapshot, Section, SectionCommit, SectionState } from "@/uhm/types/sections";

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
    pendingEntityCreates: PendingEntityCreate[];
    lastSectionSnapshot: EditorSnapshot | null;
    commitTitle: string;
    commitNote: string;
    setActiveSection: Dispatch<SetStateAction<Section | null>>;
    setSelectedSectionId: Dispatch<SetStateAction<string>>;
    setSectionState: Dispatch<SetStateAction<SectionState | null>>;
    setLastSectionSnapshot: Dispatch<SetStateAction<EditorSnapshot | null>>;
    setInitialData: Dispatch<SetStateAction<FeatureCollection>>;
    setSectionCommits: Dispatch<SetStateAction<SectionCommit[]>>;
    setPendingEntityCreates: Dispatch<SetStateAction<PendingEntityCreate[]>>;
    setCreatedEntities: Dispatch<SetStateAction<CreatedEntitySummary[]>>;
    setSelectedFeatureId: Dispatch<SetStateAction<FeatureId | null>>;
    setEntityFormStatus: Dispatch<SetStateAction<string | null>>;
    setEntityStatus: Dispatch<SetStateAction<string | null>>;
    setIsSaving: Dispatch<SetStateAction<boolean>>;
    setIsSubmitting: Dispatch<SetStateAction<boolean>>;
    setIsOpeningSection: Dispatch<SetStateAction<boolean>>;
    setAvailableSections: Dispatch<SetStateAction<Section[]>>;
    setNewSectionTitle: Dispatch<SetStateAction<string>>;
    setCommitTitle: Dispatch<SetStateAction<string>>;
    setCommitNote: Dispatch<SetStateAction<string>>;
};

export function useSectionCommands(options: Options) {
    const openSectionForEditing = useCallback(async (sectionId: string) => {
        const editorPayload = await openSectionEditor(sectionId);
        const snapshot = normalizeEditorSnapshot(editorPayload.snapshot);
        const commits = await fetchSectionCommits(sectionId);
        const nextInitialData = snapshot?.editor_feature_collection || options.emptyFeatureCollection;

        options.setActiveSection(editorPayload.section);
        options.setSelectedSectionId(editorPayload.section.id);
        options.setSectionState(editorPayload.state);
        options.setLastSectionSnapshot(snapshot);
        options.setInitialData(nextInitialData);
        options.setSectionCommits(commits);
        options.setPendingEntityCreates([]);
        options.setCreatedEntities([]);
        options.setSelectedFeatureId(null);
        options.setEntityFormStatus(null);
    }, [options]);

    const commitSection = useCallback(async () => {
        if (!options.activeSection || !options.sectionState) {
            options.setEntityStatus("Chưa mở được section editor.");
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
                pendingEntities: options.pendingEntityCreates,
                previousSnapshot: options.lastSectionSnapshot,
                hasPersistedFeature: options.editor.hasPersistedFeature,
            });
            const result = await createSectionCommit(options.activeSection.id, {
                snapshot,
                edit_summary: options.commitTitle.trim()
                    || options.commitNote.trim()
                    || `Edit ${new Date().toLocaleString()}`,
            });

            options.setSectionState(result.state);
            options.setLastSectionSnapshot(snapshot);
            options.setInitialData(options.editor.draft);
            options.editor.clearChanges();
            options.setPendingEntityCreates([]);
            options.setCreatedEntities([]);
            options.setCommitTitle("");
            options.setCommitNote("");
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

    const submitCurrentSection = useCallback(async () => {
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
            const submission = await submitSection(options.activeSection.id);
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
            const result = await restoreSectionCommit(options.activeSection.id, {
                commit_id: commitId,
            });
            const editorPayload = await openSectionEditor(options.activeSection.id);
            const snapshot = normalizeEditorSnapshot(editorPayload.snapshot);
            options.setSectionState(result.state);
            options.setLastSectionSnapshot(snapshot);
            if (snapshot?.editor_feature_collection) {
                options.setInitialData(snapshot.editor_feature_collection);
            }
            options.setSectionCommits(await fetchSectionCommits(options.activeSection.id));
            options.setEntityFormStatus("Đã restore commit.");
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
