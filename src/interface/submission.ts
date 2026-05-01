export type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

export type Submission = {
  id: string;
  project_id: string;
  commit_id: string;
  user_id: string;
  created_at?: string | null;
  status: SubmissionStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  content?: string | null;
  project_title?: string | null;
  project_description?: string | null;
  user?: any;
  reviewer?: any;
};

// BackEndGo's /submissions search returns:
// CommonResponse { data: PaginatedResponse { data: Submission[], pagination: ... } }
export type NestedPaginatedResponse<T> = {
  status: boolean;
  message?: string;
  data: T[];
  pagination?: {
    current_page: number;
    page_size: number;
    total_records: number;
    total_pages: number;
  };
  errors?: any;
};

export type SearchSubmissionsParams = {
  page?: number;
  limit?: number;
  project_id?: string;
  sort?: "id" | "created_at" | "reviewed_at" | "status";
  search?: string;
  statuses?: Array<"PENDING" | "APPROVED" | "REJECTED">;
  reviewed_by?: string;
  created_from?: string;
  created_to?: string;
};

export type UpdateSubmissionStatusPayload = {
  status: "APPROVED" | "REJECTED";
  review_note: string;
};
