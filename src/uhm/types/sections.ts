import type { EntitySnapshot } from "@/uhm/types/entities";
import type { FeatureCollection, GeometryEntitySnapshot, GeometrySnapshot } from "@/uhm/types/geo";
import type { WikiSnapshot } from "@/uhm/types/wiki";

export type EntityWikiLinkSnapshot = {
    entity_id: string;
    wiki_id: string;
    operation?: "reference" | "delete";
};

// BackEndGo uses Projects/Commits/Submissions. "Section" is legacy naming in FE.
export type ProjectStatus = string;
export type ProjectSubmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

export type ProjectState = {
    // Derived state from ProjectResponse (not persisted as-is in API mới).
    status: ProjectStatus;
    head_commit_id: string | null;
    locked_by?: string | null;
};

export type Project = {
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

export type ProjectCommit = {
    id: string;
    project_id: string;
    snapshot_json: EditorSnapshot;
    snapshot_hash: string;
    user_id: string;
    edit_summary: string;
    created_at?: string;
};

export type ProjectSubmission = {
    id: string;
    project_id: string;
    commit_id: string;
    user_id: string;
    created_at?: string;
    status: ProjectSubmissionStatus;
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
    entity_wiki?: EntityWikiLinkSnapshot[];
};

// Alias for clearer naming at API boundary: commits.snapshot_json is this shape.
export type CommitSnapshot = EditorSnapshot;

export type EditorLoadResponse = {
    section: Project;
    state: ProjectState;
    commit: ProjectCommit | null;
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

// Legacy aliases (to reduce churn in existing FE code). Prefer Project* names above.
export type SectionStatus = ProjectStatus;
export type SectionSubmissionStatus = ProjectSubmissionStatus;
export type SectionState = ProjectState;
export type Section = Project;
export type SectionCommit = ProjectCommit;
export type SectionSubmission = ProjectSubmission;
