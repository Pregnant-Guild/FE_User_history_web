export interface Project {
  id: string;
  title: string;
  description: string;
  project_status: "PRIVATE" | "PUBLIC" | "ARCHIVE";
  created_at: string;
  updated_at: string;
  // You can add other fields like 'members' if they are part of the response
}