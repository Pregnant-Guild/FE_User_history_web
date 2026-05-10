import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";
import type { Entity } from "@/uhm/types/entities";

export type { Entity } from "@/uhm/types/entities";

export async function fetchEntities(query?: {
    q?: string;
    limit?: number;
    cursor?: string;
    projectId?: string;
}): Promise<Entity[]> {
    const params = new URLSearchParams();
    // API mới dùng `name` thay vì `q`.
    if (query && "q" in query) {
        params.set("name", String(query.q ?? ""));
    }
    if (query?.limit && Number.isFinite(query.limit)) {
        params.set("limit", String(Math.trunc(query.limit)));
    }
    if (query?.cursor) {
        params.set("cursor", query.cursor);
    }
    if (query?.projectId) {
        params.set("project_id", query.projectId);
    }
    const suffix = params.toString();
    const url = suffix ? `${API_ENDPOINTS.entities}?${suffix}` : API_ENDPOINTS.entities;
    return requestJson<Entity[]>(url);
}

export async function searchEntitiesByName(
    name: string,
    options?: { limit?: number }
): Promise<Entity[]> {
    const keyword = name.trim();
    if (!keyword.length) return [];

    const params = new URLSearchParams({ name: keyword });
    if (options?.limit && Number.isFinite(options.limit)) {
        params.set("limit", String(Math.trunc(options.limit)));
    }

    // API mới không có `/entities/search`, search qua query string.
    return requestJson<Entity[]>(`${API_ENDPOINTS.entities}?${params.toString()}`);
}
