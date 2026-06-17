import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";
import type { GeometriesBBoxQuery } from "@/uhm/types/api";
import type { Feature, FeatureCollection, FeatureEntityPreview, FeatureProperties, FeatureWikiPreview, Geometry } from "@/uhm/types/geo";
import { geoTypeCodeToTypeKey } from "@/uhm/lib/map/geo/geoTypeMap";

export type { GeometriesBBoxQuery } from "@/uhm/types/api";

export type EntityGeometrySearchGeo = {
    id: string;
    type: string | null;
    draw_geometry: Geometry;
    bound_with?: string | null;

    time_start?: number | null;
    time_end?: number | null;
};

export type EntityGeometriesSearchItem = {
    entity_id: string;
    name: string;
    description: string;
    geometries: EntityGeometrySearchGeo[];
};

export type SearchGeometriesByEntityNameResponse = {
    items: EntityGeometriesSearchItem[];
    next_cursor?: string;
};

type EntityGeometrySearchGeoRow = Omit<EntityGeometrySearchGeo, "type"> & {
    geo_type: number;
};

type EntityGeometriesSearchItemRow = Omit<EntityGeometriesSearchItem, "geometries"> & {
    geometries: EntityGeometrySearchGeoRow[];
};

type SearchGeometriesByEntityNameApiResponse = Omit<SearchGeometriesByEntityNameResponse, "items"> & {
    items: EntityGeometriesSearchItemRow[];
};

function buildBBoxQueryString(params: GeometriesBBoxQuery): string {
    const query = new URLSearchParams({
        // API mới dùng snake_case
        min_lng: String(params.minLng),
        min_lat: String(params.minLat),
        max_lng: String(params.maxLng),
        max_lat: String(params.maxLat),
    });

    if (params.time !== undefined) {
        query.set("time", String(params.time));
    }

    if (params.timeRange !== undefined) {
        query.set("time_range", String(params.timeRange));
    }

    if (params.entity_id) {
        query.set("entity_id", params.entity_id);
    }

    if (typeof params.hasBound === "boolean") {
        query.set("has_bound", String(params.hasBound));
    }

    return query.toString();
}

export async function fetchGeometriesByBBox(params: GeometriesBBoxQuery): Promise<FeatureCollection> {
    const url = `${API_ENDPOINTS.geometries}?${buildBBoxQueryString(params)}`;
    // API mới trả về list geometries, FE cần chuyển thành GeoJSON FeatureCollection.
    const rows = await requestJson<GeometryRow[]>(url);
    return geometriesToFeatureCollection(rows);
}

export async function fetchGeometriesByBoundWith(parentGeometryId: string): Promise<FeatureCollection> {
    const id = String(parentGeometryId || "").trim();
    if (!id) return { type: "FeatureCollection", features: [] };

    const rows = await requestJson<GeometryRow[]>(
        `${API_ENDPOINTS.geometries}/bound-with/${encodeURIComponent(id)}`
    );
    return geometriesToFeatureCollection(rows);
}

export async function searchGeometriesByEntityName(
    name: string,
    options?: { cursor?: string; limit?: number }
): Promise<SearchGeometriesByEntityNameResponse> {
    const keyword = name.trim();
    if (!keyword.length) return { items: [] };

    const params = new URLSearchParams({ name: keyword });
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit && Number.isFinite(options.limit)) {
        params.set("limit", String(Math.trunc(options.limit)));
    }

    const response = await requestJson<SearchGeometriesByEntityNameApiResponse>(
        `${API_ENDPOINTS.geometries}/entity?${params.toString()}`
    );

    return {
        ...response,
        items: normalizeEntityGeometryItems(response.items),
    };
}

export async function fetchEntityGeometryIndexPage(options?: {
    cursor?: string;
    limit?: number;
}): Promise<SearchGeometriesByEntityNameResponse> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit && Number.isFinite(options.limit)) {
        params.set("limit", String(Math.trunc(options.limit)));
    }

    const suffix = params.toString();
    const response = await requestJson<SearchGeometriesByEntityNameApiResponse>(
        `${API_ENDPOINTS.geometries}/entity${suffix ? `?${suffix}` : ""}`
    );

    return {
        ...response,
        items: normalizeEntityGeometryItems(response.items),
    };
}

type GeometryRow = {
    id: string;
    geo_type: number;
    draw_geometry: Geometry;
    bound_with?: string | null;

    time_start?: number;
    time_end?: number;
    bbox?: {
        min_lng: number;
        min_lat: number;
        max_lng: number;
        max_lat: number;
    } | null;
    replay_ids?: string[] | null;
    entity_id?: string | null;
    entity_name?: string | null;
    entity_description?: string | null;
    entities?: GeometryRowEntity[];
};

type GeometryRowEntity = {
    id?: string | null;
    entity_id?: string | null;
    name?: string | null;
    entity_name?: string | null;
    description?: string | null;
    entity_description?: string | null;
    time_start?: number | null;
    time_end?: number | null;
    wikis?: GeometryRowWiki[];
};

type GeometryRowWiki = {
    id?: string | null;
    wiki_id?: string | null;
    title?: string | null;
    slug?: string | null;
    preview_quote?: string | null;
    blockquote_preview?: string | null;
    content?: string | null;
};

function geometriesToFeatureCollection(rows: GeometryRow[]): FeatureCollection {
    const features: Feature[] = [];

    for (const row of rows || []) {
        const geometry = normalizeGeometry(row.draw_geometry);
        if (!geometry) continue;

        const boundWith = normalizeBoundWith(row.bound_with);
        const typeKey = geoTypeCodeToTypeKey(row.geo_type) || null;
        const entityPreviews = normalizeGeometryRowEntities(row);
        const entityIds = entityPreviews.map((entity) => entity.id);
        const entityNames = entityPreviews.map((entity) => entity.name);

        const properties: FeatureProperties = {
            id: row.id,
            type: typeKey,
            time_start: row.time_start ?? null,
            time_end: row.time_end ?? null,
            replay_ids: normalizeStringArray(row.replay_ids),
            bound_with: boundWith,
            ...(entityPreviews.length
                ? {
                    entity_id: entityIds[0] || null,
                    entity_ids: entityIds,
                    entity_name: entityNames[0] || null,
                    entity_names: entityNames,
                    entity_label_candidates: entityPreviews.map((entity) => ({
                        id: entity.id,
                        name: entity.name,
                        time_start: entity.time_start ?? null,
                        time_end: entity.time_end ?? null,
                    })),
                    public_entity_previews: entityPreviews,
                }
                : {}),
        };

        features.push({
            type: "Feature",
            properties,
            geometry,
        });
    }

    return { type: "FeatureCollection", features };
}

function normalizeGeometryRowEntities(row: GeometryRow): FeatureEntityPreview[] {
    const candidates: GeometryRowEntity[] = Array.isArray(row.entities) ? row.entities : [];
    if (!candidates.length && (row.entity_id || row.entity_name)) {
        candidates.push({
            entity_id: row.entity_id,
            entity_name: row.entity_name,
            entity_description: row.entity_description,
        });
    }

    const byId = new Map<string, FeatureEntityPreview>();
    for (const candidate of candidates) {
        const id = normalizeString(candidate.id ?? candidate.entity_id);
        if (!id) continue;
        const name = normalizeString(candidate.name ?? candidate.entity_name) || id;
        byId.set(id, {
            id,
            name,
            description: normalizeNullableString(candidate.description ?? candidate.entity_description),
            time_start: normalizeNumber(candidate.time_start),
            time_end: normalizeNumber(candidate.time_end),
            wikis: normalizeGeometryRowWikis(candidate.wikis),
        });
    }

    return Array.from(byId.values());
}

function normalizeGeometryRowWikis(wikis: GeometryRowWiki[] | undefined): FeatureWikiPreview[] {
    if (!Array.isArray(wikis)) return [];

    const byId = new Map<string, FeatureWikiPreview>();
    for (const wiki of wikis) {
        const id = normalizeString(wiki.id ?? wiki.wiki_id);
        if (!id) continue;
        byId.set(id, {
            id,
            title: normalizeNullableString(wiki.title) ?? undefined,
            slug: normalizeNullableString(wiki.slug),
            preview_quote: normalizeNullableString(wiki.preview_quote ?? wiki.blockquote_preview),
            content: normalizeNullableString(wiki.content),
        });
    }

    return Array.from(byId.values());
}

function normalizeString(value: unknown): string {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).trim();
}

function normalizeNullableString(value: unknown): string | null {
    const normalized = normalizeString(value);
    return normalized.length ? normalized : null;
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => normalizeString(item))
        .filter((item) => item.length > 0);
}

function normalizeNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeGeometry(value: unknown): Geometry | null {
    if (!value || typeof value !== "object") return null;
    const g = value as Record<string, unknown>;
    if (typeof g.type !== "string") return null;
    if (!("coordinates" in g)) return null;
    return value as Geometry;
}

function normalizeBoundWith(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const id = String(value).trim();
    return id.length ? id : null;
}

function normalizeEntityGeometryItems(items: EntityGeometriesSearchItemRow[] | undefined): EntityGeometriesSearchItem[] {
    return (items || []).map((item) => ({
        ...item,
        geometries: (item.geometries || []).map((geometry) => ({
            id: geometry.id,
            type: geoTypeCodeToTypeKey(geometry.geo_type) || null,
            draw_geometry: geometry.draw_geometry,
            bound_with: normalizeBoundWith(geometry.bound_with),
            time_start: geometry.time_start ?? null,
            time_end: geometry.time_end ?? null,
        })),
    }));
}

export async function fetchGeometryById(id: string): Promise<Feature | null> {
    const nextId = String(id || "").trim();
    if (!nextId) return null;

    try {
        const row = await requestJson<GeometryRow>(
            `${API_ENDPOINTS.geometries}/${encodeURIComponent(nextId)}`
        );
        if (!row) return null;

        const fc = geometriesToFeatureCollection([row]);
        return fc.features[0] || null;
    } catch (err) {
        console.error(`Failed to fetch geometry ${nextId}:`, err);
        return null;
    }
}

