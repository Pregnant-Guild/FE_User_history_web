import { Profile, UserRole } from "@/interface/user";

export interface getUserDto {
  page?: number; // Thay cursor bằng page theo Swagger
  limit: number;
  is_deleted?: boolean;
  order?: "asc" | "desc";
  role_ids?: string[];
  search?: string;
  sort?: "created_at" | "updated_at" | "display_name" | "email";
  // Thêm các trường mới từ ảnh Swagger
  auth_provider?: string;
  created_from?: string;
  created_to?: string;
}

export interface fullDataUser {
  auth_provider: string;
  id: string;
  email: string;
  google_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  password_hash: string;
  roles: UserRole[];
  profile: Profile;
  token_version: number;
}

export interface responseUserTable {
  data: fullDataUser[];
  status: boolean;
  message?: string;
  pagination?: {
    current_page: number;
    page_size: number;
    total_records: number;
    total_pages: number;
  };
}