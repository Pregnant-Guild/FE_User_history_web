import api from "@/config/config";
import { API_ENDPOINTS } from "@/uhm/api/config";
import { ApiError, requestJson } from "@/uhm/api/http";

export type Wiki = {
  id: string;
  project_id: string;
  title?: string;
  slug?: string | null;
  content?: string;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  content_sample?: {
    id: string;
    title: string;
    created_at: string;
  }[];
};


export async function searchWikisByTitle(title: string, options?: { limit?: number; cursor?: string; entityId?: string }): Promise<Wiki[]> {
  const keyword = title.trim();
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

export async function fetchWikiBySlug(slug: string): Promise<Wiki | null> {
  const value = String(slug || "").trim();
  if (!value.length) return null;
  try {
    return await requestJson<Wiki>(`${API_ENDPOINTS.wikis}/slug/${encodeURIComponent(value)}`);
  } catch (err) {
    // Treat "not found" as an empty result for search UX.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function checkWikiSlugExists(slug: string): Promise<boolean> {
  const value = String(slug || "").trim();
  if (!value.length) return false;

  const params = new URLSearchParams({ slug: value });
  const url = `${API_ENDPOINTS.wikis}/slug/exists?${params.toString()}`;
  const payload = await requestJson<unknown>(url);

  if (typeof payload === "boolean") return payload;
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    if (typeof source.exists === "boolean") return source.exists;
    if (typeof source.exists === "number") return source.exists !== 0;
    if (typeof source.is_exists === "boolean") return source.is_exists;
    if (typeof source.is_exists === "number") return source.is_exists !== 0;
  }

  // Be conservative: unknown payload shape, treat as "exists" to prevent creating conflicting slugs.
  return true;
}

export const getContentByVersionWikiId = async (id: string) => {
  const response = await api.get(API_ENDPOINTS.wikiContent(id));
  return response?.data;
};