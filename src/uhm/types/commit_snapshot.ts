
// ---- Root request ----

export type CreateCommitRequest = {
  snapshot_json: CommitSnapshot;
  edit_summary: string;
};

// ---- Snapshot root ----

export type CommitSnapshot = {
  editor_feature_collection: FeatureCollection;
  entities: EntitySnapshot[];
  geometries: GeometrySnapshot[];
  geometry_entity: GeometryEntitySnapshot[];
  wikis: WikiSnapshot[];
  entity_wiki: EntityWikiLinkSnapshot[];
};

// ---- GeoJSON / FeatureCollection ----

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
  type?: string | null;             //generate
  geometry_preset?: string | null;
  time_start?: number | null;      //generate
  time_end?: number | null;        //generate
  binding?: string[];           //generate

  // Legacy/UI-only fields should not be relied on by the backend.
  // FE strips these when building snapshot_json, but we keep them optional here
  // because older snapshots may still contain them.
  entity_id?: string | null;               //generate
  entity_ids?: string[];               //generate
  entity_name?: string | null;               //generate
  entity_names?: string[];               //generate
  entity_type_id?: string | null;               //generate
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

// ---- Snapshot rows ----

export type SnapshotSource = "inline" | "ref";

export type SnapshotOperation = "create" | "update" | "delete" | "reference";

export type EntitySnapshot = {
  id: string;
  source: SnapshotSource;
  operation?: SnapshotOperation;

  name?: string;
  description?: string | null;
};

export type GeometrySnapshot = {
  id: string;
  source: SnapshotSource;
  operation?: SnapshotOperation;
  type?: string | null;
  draw_geometry?: Geometry;
  binding?: string[];
  time_start?: number | null;
  time_end?: number | null;
  bbox?: {
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  } | null;
};

export type GeometryEntitySnapshot = {
  geometry_id: string;
  entity_id: string;
  operation?: "reference" | "delete" | "binding";
};

// FE stores wiki doc as a string (often HTML) or null for ref-only rows.
export type WikiDoc = string | null;

export type WikiSnapshot = {
  id: string;
  source: SnapshotSource;
  operation?: SnapshotOperation;

  title: string;
  slug?: string | null;
  doc: WikiDoc;
};

export type EntityWikiLinkSnapshot = {
  entity_id: string;
  wiki_id: string;
  operation?: "reference" | "delete" | "binding";
};
