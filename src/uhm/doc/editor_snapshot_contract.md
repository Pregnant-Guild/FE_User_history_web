# UHM Editor - snapshot contract

Cập nhật: 2026-05-22.

Tài liệu này mô tả ranh giới dữ liệu giữa editor runtime và commit payload. Nếu `editor_operations.md` trả lời "thao tác nào đổi gì", file này trả lời "commit gửi shape nào và vì sao".

Nguồn chính:

- `src/uhm/lib/editor/snapshot/editorSnapshot.ts`
- `src/uhm/doc/commit_snapshot.ts`
- `src/uhm/types/projects.ts`
- `src/uhm/types/geo.ts`

## 1. Luồng build commit

Luồng hiện tại:

1. `commitSection()` kiểm tra project đang mở, pending changes và orphan geometry.
2. `editor.buildPayload()` lấy geometry diff để xác định operation.
3. `buildEditorSnapshot()` nhận `mainDraft`, snapshot collections, `effectiveReplays`, `previousSnapshot`.
4. Commit API nhận snapshot đã qua `toApiEditorSnapshot()`.
5. Sau commit thành công, FE chuyển snapshot mới về session shape bằng `toEditorSessionSnapshot()` và reset baseline.

Payload API:

```ts
{
  snapshot_json: EditorSnapshot;
  edit_summary: string;
}
```

`toApiEditorSnapshot()` hiện normalize thêm:

- `time_start/time_end`: ép về `number|null` nếu field tồn tại ở feature/entity/geometry.
- `geometries[].type`: đổi type key FE sang backend type code string hoặc `null`.
- `replays[]`: normalize `id`, `geometry_id`, `target_geometry_ids`, `detail`.

## 2. Root snapshot shape

| Field | Nguồn runtime | Ý nghĩa |
| --- | --- | --- |
| `editor_feature_collection` | Clone từ `mainDraft` đã bỏ field generate-only | FeatureCollection runtime phục vụ load lại editor |
| `entities` | `snapshotEntityRows` + entity ids phát hiện từ geometry | Entity rows inline/ref |
| `geometries` | `mainDraft.features` + deleted ids từ diff | Geometry rows có operation |
| `geometry_entity` | `feature.properties.entity_ids/entity_id` so với baseline | Join table geometry-entity |
| `wikis` | `snapshotWikis` so với baseline | Wiki rows inline/ref/delete |
| `entity_wiki` | `snapshotEntityWikiLinks` so với baseline | Join table entity-wiki |
| `replays` | `editor.effectiveReplays` | Script replay, không chứa `replayDraft` |

Root fields optional ở type vì FE còn phải đọc snapshot cũ/partial, nhưng commit mới nên sinh đủ các collection có liên quan.

## 3. Geometry contract

### `geometries[]`

Mỗi feature trong `mainDraft.features` sinh một row:

| Field | Rule |
| --- | --- |
| `id` | `String(feature.properties.id)` |
| `source` | Luôn `"inline"` cho geometry đang tồn tại trong draft |
| `operation` | `"create"`, `"update"` hoặc `"reference"` theo baseline/diff |
| `type` | FE type key trước `toApiEditorSnapshot()`, backend code string sau normalize API |
| `draw_geometry` | `feature.geometry` |
| `bound_with` | `normalizeFeatureBoundWith(feature)` |
| `time_start` / `time_end` | `feature.properties.time_start/time_end ?? null` |
| `bbox` | BBox tính từ geometry, hoặc `null` |

Snapshot legacy có `binding: string[]` trên geometry cha được FE migrate khi load bằng cách invert sang `bound_with` trên từng geometry con.

Geometry đã bị xóa sinh row:

```ts
{
  id,
  source: "ref",
  operation: "delete"
}
```

### Operation rule

`operation` của geometry đang tồn tại được tính theo thứ tự:

- Nếu snapshot trước đã đánh dấu row này `create`, giữ `create`.
- Nếu không có previous feature và đang có previous snapshot hoặc feature chưa persisted, là `create`.
- Nếu id nằm trong geometry changes hoặc feature khác previous snapshot, là `update`.
- Còn lại là `reference`.

## 4. FeatureCollection runtime contract

`editor_feature_collection` giữ geometry để load lại editor, nhưng trước khi đưa vào snapshot FE xóa các field generate-only khỏi `feature.properties`:

- `type`
- `time_start`
- `time_end`
- `bound_with`
- `entity_id`
- `entity_ids`
- `entity_name`
- `entity_names`
- `entity_label_candidates`
- `entity_type_id`

Các field này được lưu ở collection chuẩn hơn:

- `type/time/bound_with` nằm ở `geometries[]`.
- entity relation nằm ở `geometry_entity[]`.
- entity label/name được hydrate lại từ `entities[]` và join table khi load.

## 5. Geometry-entity contract

Join table chính là `geometry_entity[]`, không phải field denormalized trên feature.

Runtime source:

- `normalizeFeatureEntityIds(feature)`
- Ưu tiên `entity_ids[]` hợp lệ.
- Fallback `entity_id` nếu `entity_ids` rỗng.

Build rule:

- Link hiện có trong baseline và vẫn còn trong draft: `operation: "reference"`.
- Link mới trong draft: `operation: "binding"`.
- Link có trong baseline nhưng không còn trong draft: `operation: "delete"`.

Rows được dedupe/sort theo `geometry_id`, rồi `entity_id`.

Commit/submit hiện chặn nếu có geometry không có entity ids hợp lệ. Geometry-geometry `bound_with` không được tính là đã bind entity.

## 6. Entity contract

`entities[]` được build từ:

- `snapshotEntityRows` hiện tại.
- Entity ids xuất hiện trong `geometry_entity[]` nhưng chưa có row entity, được bổ sung row ref tối thiểu.

Row tối thiểu:

```ts
{
  id: string;
  source: "inline" | "ref";
  operation?: "create" | "update" | "delete" | "reference";
  name?: string;
  description?: string | null;
  time_start?: number;
  time_end?: number;
}
```

Quy ước:

- Entity backend/search thêm vào snapshot dùng `source: "ref"`, `operation: "reference"`.
- Entity tạo local dùng `source: "inline"`, `operation: "create"`.
- Sửa entity inline có thể giữ `create` nếu chưa commit hoặc thành `update`.

## 7. Wiki contract

`wikis[]` đến từ `snapshotWikis` so với baseline.

Row chính:

```ts
{
  id: string;
  source: "inline" | "ref";
  operation?: "create" | "update" | "delete" | "reference";
  title: string;
  slug?: string | null;
  doc: string | null;
}
```

Rule xóa:

- Nếu wiki có trong baseline nhưng không còn trong `snapshotWikis`, snapshot builder thêm row `operation: "delete"`.
- Khi UI xóa wiki, FE cũng xóa các `snapshotEntityWikiLinks` trỏ tới wiki đó trong cùng undo group.

`doc` hiện ưu tiên HTML string. Plaintext là fallback cho dữ liệu cũ.

## 8. Entity-wiki contract

Runtime source là `snapshotEntityWikiLinks`.

Build rule tương tự geometry-entity:

- Link có trong baseline và vẫn còn: `reference`.
- Link mới: `binding`.
- Link bị remove so với baseline: `delete`.

Rows được dedupe/sort theo `entity_id`, rồi `wiki_id`.

## 9. Replay contract

Commit gửi `replays[]` từ `editor.effectiveReplays`.

Canonical shape:

```ts
{
  id: string;
  geometry_id: string;
  target_geometry_ids: string[];
  detail: ReplayStage[];
}
```

Rule:

- `id` hiện bằng `geometry_id`.
- `target_geometry_ids` được normalize, MAIN geo đứng đầu.
- `detail` là danh sách stage/step/action.
- Không gửi `replayDraft` hoặc `replay_features`.

Snapshot cũ có `replay_features` được FE migrate sang `target_geometry_ids` khi load.

## 10. Validation trước commit/submit

FE chặn commit nếu:

- Chưa mở project.
- Không có pending changes.
- Có orphan geometry.
- Payload JSON vượt guardrail kích thước hiện tại khoảng 3.5MB.

FE chặn submit nếu:

- Project chưa có head commit.
- Còn pending changes chưa commit.
- Có orphan geometry.

Missing/partial time hiện chỉ là trạng thái panel, không chặn commit.

## 11. Checklist khi đổi snapshot

Khi thêm field/collection mới:

1. Cập nhật type runtime trong `src/uhm/types`.
2. Cập nhật `src/uhm/doc/commit_snapshot.ts`.
3. Cập nhật `buildEditorSnapshot()` và `toEditorSessionSnapshot()` nếu field cần round-trip.
4. Cập nhật `toApiEditorSnapshot()` nếu backend cần shape khác runtime.
5. Cập nhật undo nếu thao tác chỉnh field đó là user-facing persistent action.
6. Cập nhật dirty detection/pending save count nếu collection mới độc lập với geometry.
7. Cập nhật `editor_operations.md` và manual checklist.
