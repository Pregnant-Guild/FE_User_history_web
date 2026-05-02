import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";

export type Wiki = {
  id: string;
  title?: string;
  content?: string;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function searchWikisByTitle(title: string, options?: { limit?: number; cursor?: string; entityId?: string }): Promise<Wiki[]> {
  const keyword = title.trim();
  if (!keyword.length) return [];

  const params = new URLSearchParams({ title: keyword });
  if (options?.limit && Number.isFinite(options.limit)) params.set("limit", String(Math.trunc(options.limit)));
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.entityId) params.set("entity_id", options.entityId);

  return requestJson<Wiki[]>(`${API_ENDPOINTS.wikis}?${params.toString()}`);
}

export async function fetchWikiById(id: string): Promise<Wiki> {
  const wikiId = String(id || "").trim();
  if (!wikiId) throw new Error("Missing wiki id");
  return requestJson<Wiki>(`${API_ENDPOINTS.wikis}/${encodeURIComponent(wikiId)}`);
}

