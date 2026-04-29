export interface Project {
  id: string;
  title: string;
  description: string;
  project_status: "PRIVATE" | "PUBLIC" | "ARCHIVE";
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
  user_id?: string;
  user?: {
    id: string;
    email: string;
    display_name: string;
    avatar_url: string;
  };
  commits?: any[];
  submission_ids?: any[];
  members?: ProjectMember[];
}
export interface ProjectsResponse<T = Project> {
  status: boolean;
  message: string;
  data: T[];
  pagination: {
    current_page: number;
    page_size: number;
    total_records: number;
    total_pages: number;
  };
}
export interface UpdateProjectPayload {
  title: string;
  description: string;
  status: "PRIVATE" | "PUBLIC" | "ARCHIVE";
}
export interface ChangeOwnerPayload {
  new_owner_id: string;
}
export interface ProjectMemberPayload {
  user_id?: string;
  role: "EDITOR" | "VIEWER" | "ADMIN";
}
export interface ProjectMember {
  user_id: string;
  role: string;
  display_name: string;
  avatar_url: string;
}
export interface GetProjectsParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: "created_at" | "updated_at" | "title";
  order?: "asc" | "desc";
  statuses?: string; // comma-separated
  user_ids?: string; // comma-separated
  created_from?: string; // ISO date string
  created_to?: string; // ISO date string
}
export interface CreateCommitPayload {
  edit_summary: string;
  snapshot_json: number[]; 
}
export interface RestoreCommitPayload {
  commit_id: string;
}

export interface CreateProjectPayload
{
  description: string,
  project_status: "PRIVATE" | "PUBLIC" | "ARCHIVE",
  title: string
}

export interface AddMemberPayload {
  role: "PRIVATE" | "PUBLIC" | "ARCHIVE",
  user_id: string
}

export interface UpdateMemberRolePayload {
  role: "PRIVATE" | "PUBLIC" | "ARCHIVE",
}