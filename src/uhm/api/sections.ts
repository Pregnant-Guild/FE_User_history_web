import { API_BASE_URL, API_ENDPOINTS } from "@/uhm/api/config";
import { ApiError, jsonRequestInit, requestJson } from "@/uhm/api/http";
import type {
    CreateCommitInput,
    CreateSectionInput,
    EditorLoadResponse,
    RestoreCommitInput,
    Section,
    SectionCommit,
    SectionState,
    SectionSubmission,
} from "@/uhm/types/sections";

export type {
    CreateCommitInput,
    CreateSectionInput,
    EditorLoadResponse,
    RestoreCommitInput,
    Section,
    SectionCommit,
    SectionState,
    SectionSubmission,
} from "@/uhm/types/sections";

// Sections (API cũ) => Projects (API mới)

export async function fetchSections(): Promise<Section[]> {
    // /users/current/project requires JWT.
    return requestJson<Section[]>(API_ENDPOINTS.currentUserProjects);
}

export async function createSection(input: CreateSectionInput): Promise<Section> {
    // POST /projects
    return requestJson<Section>(API_ENDPOINTS.projects, jsonRequestInit("POST", input));
}

export async function openSectionEditor(sectionId: string): Promise<EditorLoadResponse> {
    // API mới không có endpoint "editor". FE tự load:
    // 1) Project details
    // 2) Project commits (to get snapshot_json of latest commit)
    const project = await requestJson<Section>(`${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}`);

    const pending = (project.submissions || []).find((s) => s?.status === "PENDING") || null;
    if (pending) {
        // BE rule: pending submission blocks further editing/submitting until deleted/reviewed.
        // We surface a typed error so UI can offer "delete to unlock".
        throw new ApiError(
            "Project has a pending submission",
            409,
            JSON.stringify({ pending_submission_id: pending.id })
        );
    }

    const commits = await fetchSectionCommits(sectionId);

    const headCommitId = project.latest_commit_id ?? null;
    const headCommit = headCommitId ? commits.find((c) => c.id === headCommitId) || null : null;
    const snapshot = headCommit?.snapshot_json ?? null;

    const state: SectionState = {
        status: project.project_status || "ACTIVE",
        head_commit_id: headCommitId,
        locked_by: project.locked_by ?? null,
    };

    return {
        section: project,
        state,
        commit: headCommit,
        snapshot,
    };
}

export async function createSectionCommit(
    sectionId: string,
    input: CreateCommitInput
): Promise<{ commit: SectionCommit; state: SectionState }> {
    // POST /projects/{id}/commits
    const commit = await requestJson<SectionCommit>(
        `${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}/commits`,
        jsonRequestInit("POST", {
            snapshot_json: input.snapshot,
            edit_summary: input.edit_summary,
        })
    );

    // Refresh project state (latest_commit_id may have moved).
    const project = await requestJson<Section>(`${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}`);
    const state: SectionState = {
        status: project.project_status || "ACTIVE",
        head_commit_id: project.latest_commit_id ?? null,
        locked_by: project.locked_by ?? null,
    };

    return { commit, state };
}

export async function fetchSectionCommits(sectionId: string): Promise<SectionCommit[]> {
    return requestJson<SectionCommit[]>(`${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}/commits`);
}

export async function restoreSectionCommit(
    sectionId: string,
    input: RestoreCommitInput
): Promise<{ commit: SectionCommit | null; state: SectionState }> {
    // POST /projects/{id}/commits/restore
    await requestJson(
        `${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}/commits/restore`,
        jsonRequestInit("POST", { commit_id: input.commit_id })
    );

    // Reload commits + project to determine new head commit.
    const project = await requestJson<Section>(`${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}`);
    const commits = await fetchSectionCommits(sectionId);
    const headCommitId = project.latest_commit_id ?? null;
    const headCommit = headCommitId ? commits.find((c) => c.id === headCommitId) || null : null;

    const state: SectionState = {
        status: project.project_status || "ACTIVE",
        head_commit_id: headCommitId,
        locked_by: project.locked_by ?? null,
    };

    return { commit: headCommit, state };
}

export async function submitSection(sectionId: string, content: string): Promise<SectionSubmission> {
    // Submit latest commit of project
    const project = await requestJson<Section>(`${API_ENDPOINTS.projects}/${encodeURIComponent(sectionId)}`);
    const commitId = project.latest_commit_id;
    if (!commitId) {
        throw new Error("Project has no latest commit to submit");
    }

    return requestJson<SectionSubmission>(
        API_ENDPOINTS.submissions,
        jsonRequestInit("POST", {
            project_id: sectionId,
            commit_id: commitId,
            content: content,
        })
    );
}

export async function deleteSubmission(submissionId: string): Promise<unknown> {
    return requestJson(
        `${API_ENDPOINTS.submissions}/${encodeURIComponent(submissionId)}`,
        { method: "DELETE" }
    );
}

// Convenience for runtime logs/debug: expose effective base.
export const EFFECTIVE_API_BASE_URL = API_BASE_URL;
