import { MediaItem } from "@/components/tables/MediaTable";

export interface Reviewer {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
}

export interface ApplicationUser {
  id?: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
}

export interface Application {
  id:string;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string | number;
  verify_type: string | string[] | number | number[];
  user: ApplicationUser;
  media: MediaItem[];
  reviewer?: Reviewer;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
  updated_at: string;
}