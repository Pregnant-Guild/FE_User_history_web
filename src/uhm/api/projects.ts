import { API_BASE_URL, API_ENDPOINTS } from "@/uhm/api/config";
import { ApiError, jsonRequestInit, requestJson } from "@/uhm/api/http";
import { toApiEditorSnapshot } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type {
    CreateCommitInput,
    CreateProjectInput,
    EditorLoadResponse,
    RestoreCommitInput,
    Project,
    ProjectCommit,
    ProjectState,
    ProjectSubmission,
} from "@/uhm/types/projects";

export type {
    CreateCommitInput,
    CreateProjectInput,
    EditorLoadResponse,
    RestoreCommitInput,
    Project,
    ProjectCommit,
    ProjectState,
    ProjectSubmission,
} from "@/uhm/types/projects";

// Projects (API cũ) => Projects (API mới)

export async function fetchProjects(): Promise<Project[]> {
    // /users/current/project requires JWT.
    return requestJson<Project[]>(API_ENDPOINTS.currentUserProjects);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
    // POST /projects
    return requestJson<Project>(API_ENDPOINTS.projects, jsonRequestInit("POST", input));
}

export async function openSectionEditor(projectId: string): Promise<EditorLoadResponse> {
    // API mới không có endpoint "editor". FE tự load:
    // 1) Project details
    // 2) Project commits (to get snapshot_json of latest commit)
    const project = await requestJson<Project>(`${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}`);

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

    const commits = await fetchProjectCommits(projectId);

    const headCommitId = project.latest_commit_id ?? null;
    const headCommit = headCommitId ? commits.find((c) => c.id === headCommitId) || null : null;
    const snapshot = headCommit?.snapshot_json ?? null;

    const state: ProjectState = {
        status: project.project_status || "ACTIVE",
        head_commit_id: headCommitId,
        locked_by: project.locked_by ?? null,
    };

    return {
        project: project,
        state,
        commit: headCommit,
        snapshot,
    };
}

export async function createProjectCommit(
    projectId: string,
    input: CreateCommitInput
): Promise<{ commit: ProjectCommit; state: ProjectState }> {
    // POST /projects/{id}/commits
    const snapshot = toApiEditorSnapshot(input.snapshot);
    const commit = await requestJson<ProjectCommit>(
        `${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}/commits`,
        jsonRequestInit("POST", {
            snapshot_json: snapshot,
            edit_summary: input.edit_summary,
        })
    );

    // Refresh project state (latest_commit_id may have moved).
    const project = await requestJson<Project>(`${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}`);
    const state: ProjectState = {
        status: project.project_status || "ACTIVE",
        head_commit_id: project.latest_commit_id ?? null,
        locked_by: project.locked_by ?? null,
    };

    return { commit, state };
}

export async function fetchProjectCommits(projectId: string): Promise<ProjectCommit[]> {
    return requestJson<ProjectCommit[]>(`${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}/commits`);
}

export async function restoreProjectCommit(
    projectId: string,
    input: RestoreCommitInput
): Promise<{ commit: ProjectCommit | null; state: ProjectState }> {
    // POST /projects/{id}/commits/restore
    await requestJson(
        `${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}/commits/restore`,
        jsonRequestInit("POST", { commit_id: input.commit_id })
    );

    // Reload commits + project to determine new head commit.
    const project = await requestJson<Project>(`${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}`);
    const commits = await fetchProjectCommits(projectId);
    const headCommitId = project.latest_commit_id ?? null;
    const headCommit = headCommitId ? commits.find((c) => c.id === headCommitId) || null : null;

    const state: ProjectState = {
        status: project.project_status || "ACTIVE",
        head_commit_id: headCommitId,
        locked_by: project.locked_by ?? null,
    };

    return { commit: headCommit, state };
}

export async function submitSection(projectId: string, content: string): Promise<ProjectSubmission> {
    // Submit latest commit of project
    const project = await requestJson<Project>(`${API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}`);
    const commitId = project.latest_commit_id;
    if (!commitId) {
        throw new Error("Project has no latest commit to submit");
    }

    return requestJson<ProjectSubmission>(
        API_ENDPOINTS.submissions,
        jsonRequestInit("POST", {
            project_id: projectId,
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
