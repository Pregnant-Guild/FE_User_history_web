/**
 * Tài liệu schema tham chiếu cho snapshot commit.
 *
 * Lưu ý:
 * - Đây không phải "single source of truth" của runtime hiện tại; logic normalize/build thật nằm ở
 *   `src/uhm/lib/editor/snapshot/editorSnapshot.ts`.
 * - Các phần như `replays` và nhóm `UIFunctionName` / `MapFunctionName` mô tả schema dự phòng hoặc tương lai.
 *   Editor route `/editor/[id]` hiện có mode `replay`, nhưng chưa thực thi hệ thống scripted replay đầy đủ theo file này.
 * - Các field denormalized dùng cho UI như `entity_ids`, `entity_name`, `binding`, `time_start`, `time_end`
 *   có thể xuất hiện trong editor runtime, nhưng frontend sẽ strip hoặc tái sinh chúng khi build snapshot API.
 */

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
  replays?: BattleReplay[];
};

// ---- Replay / Scripting System ----

export type UIFunctionName =
  | "hide_timeline"
  | "hide_layer_panel"
  | "hide_wiki_panel"
  | "hide_zoom_panel"
  | "hide_all_UI"
  | "open_wiki";

export type MapFunctionName =
  | "zoom_to_lnglat"
  | "zoom_scale"
  | "zoom_geometries"
  | "change_geometry_color"
  | "change_geometries_color"
  | "change_geometry_texture"
  | "change_geometries_texture"
  | "hide_geometries";

export type NarrativeFunctionName = "set_title" | "set_descriptions";

export type ReplayAction<T> = {
  function_name: T;
  params: any[];
};

export type ReplayStep = {
  duration: number; // Trọng số thời gian của step trong 1 stage
  use_UI_function: ReplayAction<UIFunctionName>[];
  use_map_function: ReplayAction<MapFunctionName>[];
  use_narrow_function: ReplayAction<NarrativeFunctionName>[];
};

export type ReplayStage = {
  id: number; // số đếm thứ tự từ 0
  title?: string;
  detail_time_start: string;
  detail_time_stop: string;
  steps: ReplayStep[];
};

export type BattleReplay = {
  geometry_id: string; // geometry mà khi nhấn vào là có thể replay
  detail: ReplayStage[];
};

// ---- GeoJSON / FeatureCollection ----

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
