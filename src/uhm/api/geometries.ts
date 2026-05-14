import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";
import type { GeometriesBBoxQuery } from "@/uhm/types/api";
import type { Feature, FeatureCollection, FeatureProperties, Geometry } from "@/uhm/types/geo";
import { geoTypeCodeToTypeKey } from "@/uhm/lib/map/geo/geoTypeMap";

export type { GeometriesBBoxQuery } from "@/uhm/types/api";

export type EntityGeometrySearchGeo = {
    id: string;
    type: string | null;
    draw_geometry: Geometry;
    binding?: string[];

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

    return query.toString();
}

export async function fetchGeometriesByBBox(params: GeometriesBBoxQuery): Promise<FeatureCollection> {
    const url = `${API_ENDPOINTS.geometries}?${buildBBoxQueryString(params)}`;
    // API mới trả về list geometries, FE cần chuyển thành GeoJSON FeatureCollection.
    const rows = await requestJson<GeometryRow[]>(url);
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
        items: (response.items || []).map((item) => ({
            ...item,
            geometries: (item.geometries || []).map((geometry) => ({
                id: geometry.id,
                type: geoTypeCodeToTypeKey(geometry.geo_type) || null,
                draw_geometry: geometry.draw_geometry,
                binding: geometry.binding,
                time_start: geometry.time_start ?? null,
                time_end: geometry.time_end ?? null,
            })),
        })),
    };
}

type GeometryRow = {
    id: string;
    geo_type: number;
    draw_geometry: Geometry;
    binding?: string[];

    time_start?: number;
    time_end?: number;
    bbox?: {
        min_lng: number;
        min_lat: number;
        max_lng: number;
        max_lat: number;
    } | null;
};

function geometriesToFeatureCollection(rows: GeometryRow[]): FeatureCollection {
    const features: Feature[] = [];

    for (const row of rows || []) {
        const geometry = normalizeGeometry(row.draw_geometry);
        if (!geometry) continue;

        const binding = normalizeBinding(row.binding);
        const typeKey = geoTypeCodeToTypeKey(row.geo_type) || null;

        const properties: FeatureProperties = {
            id: row.id,
            type: typeKey,
            time_start: row.time_start ?? null,
            time_end: row.time_end ?? null,
            binding: binding.length ? binding : undefined,
        };

        features.push({
            type: "Feature",
            properties,
            geometry,
        });
    }

    return { type: "FeatureCollection", features };
}

function normalizeGeometry(value: unknown): Geometry | null {
    if (!value || typeof value !== "object") return null;
    const g = value as Record<string, unknown>;
    if (typeof g.type !== "string") return null;
    if (!("coordinates" in g)) return null;
    return value as Geometry;
}

function normalizeBinding(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((v) => String(v)).filter((v) => v.length > 0);
    }
    // Some deployments may return binding as an object; ignore it for FE properties.binding.
    return [];
}
