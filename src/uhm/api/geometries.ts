import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";
import type { GeometriesBBoxQuery } from "@/uhm/types/api";
import type { Feature, FeatureCollection, FeatureProperties, Geometry } from "@/uhm/types/geo";

export type { GeometriesBBoxQuery } from "@/uhm/types/api";

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

type GeometryRow = {
    id: string;
    geo_type: string;
    draw_geometry: unknown;
    binding?: unknown;
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

        const properties: FeatureProperties = {
            id: row.id,
            type: row.geo_type || null,
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
    const g = value as any;
    if (typeof g.type !== "string") return null;
    if (!("coordinates" in g)) return null;
    return g as Geometry;
}

function normalizeBinding(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((v) => String(v)).filter((v) => v.length > 0);
    }
    // Some deployments may return binding as an object; ignore it for FE properties.binding.
    return [];
}
