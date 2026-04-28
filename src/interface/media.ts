import { MediaItem } from "@/components/tables/MediaTable";

export interface PresignedUrlResponse {
  token_id: string;
  upload_url: string;
  storage_key: string;
  signed_headers: Record<string, string>;
}

export interface MediaDto {
  status: boolean;
  message: string;
  data: MediaItem[];
  pagination: {
    current_page: number;
    page_size: number;
    total_records: number;
    total_pages: number;
  };
}