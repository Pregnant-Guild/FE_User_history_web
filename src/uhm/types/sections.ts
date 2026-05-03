import type { EntitySnapshot } from "@/uhm/types/entities";
import type { FeatureCollection, GeometryEntitySnapshot, GeometrySnapshot } from "@/uhm/types/geo";
import type { WikiSnapshot } from "@/uhm/types/wiki";

export type EntityWikiLinkSnapshot = {
    entity_id: string;
    wiki_id: string;
    operation?: "reference" | "delete";
};

// API mới (BackEndGo) dùng Projects/Commits/Submissions.
// Giữ tên type "Section" để tránh thay đổi lan rộng trong FE hiện tại.
export type SectionStatus = string;
export type SectionSubmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

export type SectionState = {
    // Derived state from ProjectResponse (not persisted as-is in API mới).
    status: SectionStatus;
    head_commit_id: string | null;
    locked_by?: string | null;
};

export type Section = {
    id: string;
    title: string;
    description: string | null;
    project_status?: string;
    latest_commit_id?: string | null;
    submission_ids?: string[];
    locked_by?: string | null;
    user_id?: string;
    created_at?: string;
    updated_at?: string;
    state?: {
        status?: string;
    };
};

export type SectionCommit = {
    id: string;
    project_id: string;
    snapshot_json: EditorSnapshot;
    snapshot_hash: string;
    user_id: string;
    edit_summary: string;
    created_at?: string;
};

export type SectionSubmission = {
    id: string;
    project_id: string;
    commit_id: string;
    user_id: string;
    created_at?: string;
    status: SectionSubmissionStatus;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    review_note?: string | null;
    content?: string | null;
};

export type EditorSnapshot = {
    // Legacy: before BEGo flow moved fully to project/commit records, FE stored a minimal "section" ref
    // inside snapshot_json. New snapshots omit this entirely.
    section?: {
        id: string;
        title: string;
    };
    editor_feature_collection?: FeatureCollection;
    entities?: EntitySnapshot[];
    geometries?: GeometrySnapshot[];
    // Join table geometry ↔ entity (many-to-many).
    geometry_entity?: GeometryEntitySnapshot[];
    wikis?: WikiSnapshot[];
    entity_wikis?: EntityWikiLinkSnapshot[];
};

export type EditorLoadResponse = {
    section: Section;
    state: SectionState;
    commit: SectionCommit | null;
    snapshot: EditorSnapshot | null;
};

export type CreateSectionInput = {
    title: string;
    description?: string | null;
    status?: "PRIVATE" | "PUBLIC" | "ARCHIVE";
};

export type CreateCommitInput = {
    snapshot: EditorSnapshot;
    edit_summary: string;
};

export type RestoreCommitInput = {
    commit_id: string;
};
