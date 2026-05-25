import type { GeometryPreset } from "@/uhm/lib/map/geo/geometryTypeOptions";

export type Geometry =
    | ({ type: "Point"; coordinates: [number, number] } & CircleGeometryMetadata)
    | ({ type: "MultiPoint"; coordinates: [number, number][] } & CircleGeometryMetadata)
    | ({ type: "LineString"; coordinates: [number, number][] } & CircleGeometryMetadata)
    | ({ type: "MultiLineString"; coordinates: [number, number][][] } & CircleGeometryMetadata)
    | ({ type: "Polygon"; coordinates: [number, number][][] } & CircleGeometryMetadata)
    | ({ type: "MultiPolygon"; coordinates: [number, number][][][] } & CircleGeometryMetadata);

export type CircleGeometryMetadata = {
    circle_center?: [number, number];
    circle_radius?: number;
};

export type FeatureId = string | number;

export type FeatureProperties = {
    id: FeatureId;
    source?: "inline" | "ref";
    type?: string | null;
    geometry_preset?: GeometryPreset | null;
    time_start?: number | null;
    time_end?: number | null;
    bound_with?: string | null;
    entity_id?: string | null;
    entity_ids?: string[];
    entity_name?: string | null;
    entity_names?: string[];
    entity_label_candidates?: EntityLabelCandidate[];
    entity_type_id?: string | null;
    point_label?: string | null;
    line_label?: string | null;
    polygon_label?: string | null;
};

export type EntityLabelCandidate = {
    id: string;
    name: string;
    time_start?: number | null;
    time_end?: number | null;
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
    bound_with?: string | null;
    time_start?: number | null;
    time_end?: number | null;
    bbox?: {
        min_lng: number;
        min_lat: number;
        max_lng: number;
        max_lat: number;
    } | null;
};

// Snapshot join table (geometry ↔ entity).
export type GeometryEntitySnapshot = {
    geometry_id: string;
    entity_id: string;
    // Relationship semantics (geometry ↔ entity).
    // - reference/binding: the link exists (assigned)
    // - delete: the link is removed
    operation?: "reference" | "binding" | "delete";
};

export type GeometryChange =
    | { action: "create"; feature: Feature }
    | { action: "update"; id: FeatureId; geometry: Geometry }
    | { action: "delete"; id: FeatureId };
