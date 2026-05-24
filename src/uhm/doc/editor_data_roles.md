# UHM Editor - vai trò dữ liệu dễ nhầm

Tài liệu này là glossary ngắn để người sửa code và AI không nhầm các `FeatureCollection`/snapshot gần tên nhau trong editor.

## Luật đọc nhanh

- `mainDraft` là dữ liệu geometry chính để edit và commit.
- `mapRenderDraft` là dữ liệu đã lọc để render map.
- `labelContextDraft` chỉ để lookup label, không quyết định render.
- `baselineFeatureCollection` chỉ để seed/reset session hiện tại.
- `baselineSnapshot` là snapshot gốc để so dirty và build commit delta.
- Các collection `snapshot*` là state hiện tại của snapshot, không phải danh sách delta thô.

## Geometry draft

### `baselineFeatureCollection`

FeatureCollection gốc của phiên editor hiện tại. Nó được tạo từ `baselineSnapshot.editor_feature_collection` khi mở project/restore commit, hoặc từ `EMPTY_FEATURE_COLLECTION` khi project chưa có commit.

Khi field này đổi, `useEditorState()` reset `mainDraft`, rebuild `initialMapRef`, và clear undo stack.

### `mainDraft`

Working copy geometry chính. Đây là nguồn commit cho geometry và là nơi các thao tác create/update/delete/properties ghi vào.

Không dùng `mapRenderDraft` để commit vì `mapRenderDraft` có thể thiếu geometry do timeline/replay/preview filter.

### `editor.draft`

Draft active theo mode:

- mode thường: `editor.draft === mainDraft`
- mode `replay`: `editor.draft === replayDraft`

Panel metadata và selection dùng `editor.draft` để vẫn đọc được geometry ngay cả khi map filter đang ẩn geometry đó.

### `replayDraft`

FeatureCollection local hydrate từ `mainDraft` theo `activeReplayDraft.target_geometry_ids`. Nó chỉ phục vụ replay edit mode, không thay thế `mainDraft`.

### `mapRenderDraft`

FeatureCollection do page tạo ra để truyền vào `Map` prop `renderDraft`.

Nguồn có thể là:

- `editor.mainDraft` ở mode thường
- `editor.replayDraft` ở replay edit mode
- `previewSession.draft` đã áp hidden ids ở replay preview mode

Sau đó page có thể áp timeline filter. Đây là nguồn duy nhất quyết định geometry nào xuất hiện trên map.

### `renderDraft`

Tên prop trong `Map.tsx`/`useMapSync.ts`. Đây là `mapRenderDraft` sau khi truyền xuống component map.

### `renderDraftRef`

Ref của `renderDraft` trong map interaction. Ref này dùng cho hover/select/edit trên các geometry đang render/interact. Không nhầm với `draftRef` nội bộ trong `useEditorState()`.

## Label context

### `labelContextBaseDraft`

FeatureCollection gốc để build label context. Nó có thể là draft rộng hơn `mapRenderDraft` để label vẫn resolve được entity/geometry liên quan.

### `mapLabelContextDraft`

FeatureCollection đã enrich label/entity name từ `labelContextBaseDraft`.

Rule quan trọng: `mapLabelContextDraft` chỉ dùng cho label lookup. Nó có thể chứa geometry bị timeline filter ẩn, nên không được dùng để quyết định render source hoặc geometry visibility.

## Snapshot state

### `baselineSnapshot`

Snapshot gốc của session hiện tại. Dùng để so dirty và để `buildEditorSnapshot()` biết row nào là reference/binding/update/delete.

### `snapshotEntityRows`

Các entity row của snapshot hiện tại. Đây là rows cho payload `entities[]`, không phải entity catalog toàn hệ thống.

### `snapshotWikis`

Các wiki row của snapshot hiện tại. Đây là source truth cho wiki trong commit.

### `snapshotEntityWikiLinks`

Các link entity-wiki hiện tại của snapshot. Snapshot builder sẽ tự sinh operation phù hợp so với `baselineSnapshot.entity_wiki`.

## Binding và visibility

### `geometry_entity[]`

Join table persist quan hệ geometry-entity trong snapshot commit. `feature.properties.entity_ids` chỉ là field denormalized cho UI.

### `bound_with`

Field geometry-geometry trên feature con, lưu id geometry cha mà nó nằm trong. `bound_with` không tính là entity binding; geometry không có `entity_ids/entity_id` hợp lệ vẫn là orphan.

### `geometryVisibility`

Map local visibility override. Key có thể là geometry id hoặc semantic geo type key. Đây là UI-only, không đi snapshot.

### `applyGeometryBindingFilter`

Filter map theo selection/bound_with. Chỉ ảnh hưởng render trên map, không đổi draft và không đi snapshot.

## Guard rails

- Render path: `mapRenderDraft -> Map.renderDraft -> useMapSync(renderDraft) -> MapLibre sources`.
- Label path: `labelContextBaseDraft -> mapLabelContextDraft -> useMapSync(labelContextDraft)`.
- Commit path: `mainDraft + snapshotEntityRows + snapshotWikis + snapshotEntityWikiLinks + effectiveReplays -> buildEditorSnapshot()`.
- Orphan validation vẫn chạy trên `mainDraft`, không phụ thuộc map filter.
