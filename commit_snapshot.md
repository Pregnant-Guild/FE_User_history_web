# Commit Snapshot (`commits.snapshot_json`) - Chuẩn Hiện Tại (FrontEndUser / UHM)

Tài liệu này mô tả **snapshot_json** mà `FrontEndUser` (module UHM editor) tạo ra khi bấm **Commit** trong `/editor/[id]`, và gửi lên endpoint `POST /projects/{id}/commits`.

Nguồn tham chiếu trong code (FrontEndUser):

- Types:
  - `src/uhm/types/sections.ts` (`EditorSnapshot`, `EntityWikiLinkSnapshot`)
  - `src/uhm/types/geo.ts` (`FeatureCollection`, `GeometrySnapshot`, `GeometryEntitySnapshot`)
  - `src/uhm/types/entities.ts` (`EntitySnapshot`)
  - `src/uhm/types/wiki.ts` (`WikiSnapshot`)
- Build/normalize snapshot:
  - `src/uhm/lib/editor/snapshot/editorSnapshot.ts` (`buildEditorSnapshot`, `normalizeEditorSnapshot`)

## 1) Root Shape

FE hiện tại không dùng `schema_version`. `snapshot_json` là một object có các phần sau:

```ts
export type EditorSnapshot = {
  editor_feature_collection?: FeatureCollection;
  entities?: EntitySnapshot[];
  geometries?: GeometrySnapshot[];
  geometry_entity?: GeometryEntitySnapshot[];
  wikis?: WikiSnapshot[];
  entity_wiki?: EntityWikiLinkSnapshot[];
};
```

Lưu ý:

- FE có thể **đọc** cả `entity_wiki` và legacy alias `entity_wikis` khi load snapshot (normalize), nhưng khi commit FE ghi `entity_wiki`.
- `editor_feature_collection` là nguồn để render editor/map. Các join table (`geometry_entity`, `entity_wiki`) là nguồn quan hệ.

## 2) Types (TypeScript) - Đúng Theo FE Hiện Tại

### 2.1 GeoJSON (editor_feature_collection)

```ts
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
  geometry_preset?: string | null;
  time_start?: number | null;
  time_end?: number | null;
  binding?: string[];

  // UI-only / legacy fields (FE sẽ strip khi persist snapshot):
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
```

### 2.2 Snapshot rows

```ts
export type SnapshotSource = "inline" | "ref";

export type EntitySnapshotOperation = "create" | "update" | "delete" | "reference";
export type GeometrySnapshotOperation = "create" | "update" | "delete" | "reference";
export type WikiSnapshotOperation = "create" | "update" | "delete" | "reference";

export type EntitySnapshot = {
  id: string;
  source: SnapshotSource;
  operation?: EntitySnapshotOperation;
  name?: string;
  slug?: string | null;
  description?: string | null;
  status?: number | null;
  base_updated_at?: string;
  base_hash?: string;
};

export type GeometrySnapshot = {
  id: string;
  source: SnapshotSource;
  operation?: GeometrySnapshotOperation;
  type?: string | null;
  draw_geometry?: Geometry;
  geometry?: Geometry; // legacy
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

// FE stores wiki doc as a string (commonly HTML; in some flows it may be a JSON-stringified editor payload).
export type WikiDoc = string | null;

export type WikiSnapshot = {
  id: string;
  source: SnapshotSource;
  operation?: WikiSnapshotOperation;
  title: string;
  slug?: string | null;
  doc: WikiDoc;
  updated_at?: string;
};
```

### 2.3 Join tables

```ts
export type GeometryEntitySnapshot = {
  geometry_id: string;
  entity_id: string;
  base_links_hash?: string;
};

export type EntityWikiLinkSnapshot = {
  entity_id: string;
  wiki_id: string;
  operation?: "reference" | "binding" | "delete";
};
```

## 3) Quy Ước FE Khi Build Snapshot (buildEditorSnapshot)

### 3.1 Feature.properties entity fields bị strip

Khi persist snapshot, FE chủ động xoá các field denormalize trên feature properties:
`entity_id`, `entity_ids`, `entity_name`, `entity_names`, `entity_type_id`.

Quan hệ geometry ↔ entity chỉ nằm ở `geometry_entity[]`.

### 3.2 entities[]

FE cố gắng đảm bảo mọi entity có `name` không rỗng (fallback sang `id`) và có `source`.

`operation` được dùng như "delta" trong commit:

- `"create"|"update"|"delete"`: thay đổi record entity
- `"reference"`: đưa entity vào context snapshot (pin/link) nhưng commit không sửa record entity

### 3.3 geometries[]

FE sinh 1 `GeometrySnapshot` cho mỗi feature đang tồn tại trong `editor_feature_collection.features[]`:

- `id = String(feature.properties.id)`
- `source:"inline"`
- `draw_geometry = feature.geometry`
- `binding`, `time_start`, `time_end`, `bbox` (nếu tính được)
- `type`: FE hiện gửi **string code** (geo_type smallint) dưới dạng string
- `operation`:
  - `"create"` nếu geometry mới
  - `"update"` nếu geometry thay đổi
  - `undefined` nếu geometry không đổi

Nếu feature bị xoá khỏi draft, FE thêm 1 row:

```json
{ "id": "…", "source": "ref", "operation": "delete" }
```

### 3.4 geometry_entity[]

`geometry_entity` là danh sách quan hệ many-to-many geometry ↔ entity. Mỗi row là một cặp:

```ts
{ geometry_id: string; entity_id: string }
```

### 3.5 wikis[]

- Wiki `source:"ref"` (được add từ search): FE set `operation:"reference"` và `doc:null`.
- Wiki `source:"inline"` (được tạo/sửa trong editor):
  - nếu UI set explicit `create|update|delete` thì giữ nguyên
  - nếu không có operation:
    - wiki mới: FE coi là `"create"`
    - wiki cũ không đổi: FE gán `"reference"`
    - wiki cũ có đổi nội dung: FE gán `"update"`

### 3.6 entity_wiki[]

Type trong FE cho UI state cho phép `"binding"` và `"delete"`.

Khi build snapshot để commit, FE map link “đang bật” về `"reference"` để tương thích với backend (một số backend chỉ chấp nhận `"reference"|"delete"`).

## 4) Ví Dụ snapshot_json (rút gọn)

```json
{
  "editor_feature_collection": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": { "id": "019e…", "type": "country", "time_start": 1000, "time_end": 1500 },
        "geometry": { "type": "Polygon", "coordinates": [[[100, 10], [101, 10], [101, 11], [100, 10]]] }
      }
    ]
  },
  "entities": [
    { "id": "019e…", "source": "inline", "operation": "reference", "name": "ent1", "description": null, "status": 1 }
  ],
  "geometries": [
    { "id": "019e…", "source": "inline", "operation": "update", "type": "9", "draw_geometry": { "type": "Polygon", "coordinates": [] }, "binding": [], "time_start": 1000, "time_end": 1500, "bbox": null }
  ],
  "geometry_entity": [
    { "geometry_id": "019e…", "entity_id": "019e…" }
  ],
  "wikis": [
    { "id": "019e…", "source": "ref", "operation": "reference", "title": "Existing wiki", "doc": null, "updated_at": "2026-05-08T00:00:00.000Z" }
  ],
  "entity_wiki": [
    { "entity_id": "019e…", "wiki_id": "019e…", "operation": "reference" }
  ]
}
```

## 5) Compat Notes (khi load snapshot cũ)

FE normalize khi load snapshot:

- Nếu thấy `entity_wikis` (plural) sẽ đọc như `entity_wiki`.
- Nếu join link có `operation:"reference"` thì FE coi như link active (UI biểu diễn như “binding”).
