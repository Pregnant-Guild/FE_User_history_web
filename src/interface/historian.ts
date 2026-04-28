export interface MediaDto {
  id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface ApplicationDto {
  id: string;
  user_id?: string;
  verify_type: string | number;
  content: string;
  is_deleted: boolean;
  status: string | number;
  reviewed_by: string;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at?: string;
  media: any[];
  user: {
    display_name?: string;
    avatar_url?: string;
    full_name?: string;
    id?: string;
    email?: string;
  };
  reviewer?: {
    display_name?: string;
    avatar_url?: string;
    full_name?: string;
    id?: string;
    email?: string;
  };
}

export interface GetApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  statuses?: string[];
  verify_types?: string;
  created_from?: string;
  created_to?: string;
  reviewed_by?: string;
}

export interface ApplicationResponse {
  status: boolean;
  message: string;
  data: ApplicationDto[];
  pagination: {
    current_page: number;
    page_size: number;
    total_records: number;
    total_pages: number;
  };
}
