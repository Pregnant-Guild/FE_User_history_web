import type { EntityGeometryPreset } from "@/uhm/lib/entityTypeOptions";

export type Geometry =
    | { type: "Point"; coordinates: [number, number] }
    | { type: "MultiPoint"; coordinates: [number, number][] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] }
    | { type: "Polygon"; coordinates: [number, number][][] }
    | { type: "MultiPolygon"; coordinates: [number, number][][][] };

export type FeatureId = string | number;

export type FeatureProperties = {
    id: FeatureId;
    type?: string | null;
    geometry_preset?: EntityGeometryPreset | null;
    time_start?: number | null;
    time_end?: number | null;
    binding?: string[];
    entity_id?: string | null;
    entity_ids?: string[];
    entity_name?: string | null;
    entity_names?: string[];
    entity_type_id?: string | null;
};

export type Feature = {
    type: "Feature";
    properties: FeatureProperties;
    geometry: Geometry;
};

export type FeatureCollection = {
    type: "FeatureCollection";
    features: Feature[];
};

export type GeometrySnapshotOperation = "create" | "update" | "delete" | "reference";

export type GeometrySnapshot = {
    id: string;
    source: "inline" | "ref";
    operation?: GeometrySnapshotOperation;
    type?: string | null;
    draw_geometry?: Geometry;
    geometry?: Geometry;
    binding?: string[];
    time_start?: number | null;
    time_end?: number | null;
    bbox?: {
        min_lng: number;
        min_lat: number;
        max_lng: number;
        max_lat: number;
    } | null;
    base_updated_at?: string;
    base_hash?: string;
};

// Snapshot join table (geometry ↔ entity).
export type GeometryEntitySnapshot = {
    geometry_id: string;
    entity_id: string;
    base_links_hash?: string;
};

export type GeometryChange =
    | { action: "create"; feature: Feature }
    | { action: "update"; id: FeatureId; geometry: Geometry }
    | { action: "delete"; id: FeatureId };
