# UHM Editor - state replay hiện tại

Tài liệu này mô tả đúng flow replay mode hiện tại của `/editor/[id]`.

Nguồn thật:

- `src/app/editor/[id]/page.tsx`
- `src/uhm/lib/editor/state/useEditorState.ts`
- `src/uhm/lib/editor/project/useProjectCommands.ts`
- `src/uhm/lib/editor/snapshot/editorSnapshot.ts`

## 1. Kết luận ngắn

Replay mode hiện tại có 2 lớp state:

- `activeReplayDraft`
  - là `BattleReplay` đang chỉnh
  - chỉ chứa `geometry_id`, `target_geometry_ids`, `detail`
- `replayDraft`
  - là `FeatureCollection` local, được FE hydrate lại từ `mainDraft + target_geometry_ids`
  - chỉ dùng để map/render/select trong replay mode

Điểm quan trọng:

- `replayDraft` không còn được persist vào commit/API
- commit chỉ lưu `replays[]` với `target_geometry_ids`
- snapshot cũ còn `replay_features` sẽ được FE migrate sang `target_geometry_ids` khi load

## 2. Shape replay hiện tại

```ts
type BattleReplay = {
  id: string;
  geometry_id: string;
  target_geometry_ids: string[];
  detail: ReplayStage[];
};
```

Ý nghĩa:

- `geometry_id`
  - MAIN geo của replay
  - cũng là key để tìm replay tương ứng
- `id`
  - hiện luôn bằng `geometry_id`
  - thêm để schema replay có id riêng rõ ràng hơn
- `target_geometry_ids`
  - toàn bộ geo được đưa vào replay
  - phần tử đầu nên luôn là MAIN geo
- `detail`
  - stage/step/actions của kịch bản

## 3. Replay được mở như thế nào

Khi vào replay từ UI:

1. editor lấy `triggerId`
   - ưu tiên `selectedFeatureIds[0]`
   - nếu chưa có selection thì dùng `featureId` vừa click
2. gọi `editor.switchReplayContext(triggerId, selectedFeatureIds)`
3. `switchReplayContext()` sẽ:
   - flush replay cũ nếu đang mở replay khác
   - tìm replay đã tồn tại theo `geometry_id`
   - nếu chưa có thì tạo seed mới

## 4. Seed replay được tạo ra sao

Replay seed mới có dạng:

```ts
{
  id: triggerId,
  geometry_id: triggerId,
  target_geometry_ids: [...],
  detail: []
}
```

`target_geometry_ids` được build từ:

- MAIN geo
- toàn bộ bulk selection hiện tại
- toàn bộ `binding` của MAIN geo trong `mainDraft`

Rule hiện tại:

- MAIN geo luôn đứng đầu
- geo trùng sẽ được dedupe
- nếu replay đã tồn tại sẵn, FE giữ `detail` cũ và chỉ append thêm geo mới còn thiếu vào `target_geometry_ids`

## 5. `replayDraft` được hydrate thế nào

`replayDraft` không còn nằm trong snapshot.

Mỗi lần:

- mở replay
- undo replay session
- restore `activeReplayDraft`

FE sẽ hydrate lại:

```ts
replayDraft = hydrate(mainDraft, activeReplayDraft.target_geometry_ids)
```

Hydrate hiện tại:

- lấy feature từ `mainDraft` theo đúng thứ tự `target_geometry_ids`
- clone ra `FeatureCollection` mới
- flatten `binding` thành `[]` để các geo trong replay bình đẳng với nhau

## 6. Trong replay mode map đang đọc gì

`useEditorState()` vẫn switch active draft như cũ:

```ts
const activeDraft = mode === "replay" ? replayDraft : mainDraft;
```

Nên khi `mode === "replay"`:

- `editor.draft` trỏ vào `replayDraft`
- `editor.draftRef` trỏ vào `replayDraftRef`
- map chỉ render tập geo đang nằm trong `target_geometry_ids`

## 7. Replay mode còn sửa geometry không

Không.

Hiện tại state layer đã chặn toàn bộ nhánh mutate geometry trong replay mode:

- `createFeature`
- `createFeatureWithSnapshotEntities`
- `patchFeatureProperties`
- `patchFeaturePropertiesBatch`
- `updateFeature`
- `deleteFeature`

Nghĩa là:

- replay mode chỉ còn là nơi viết script replay
- không còn persist hay commit geometry edit riêng của replay

## 8. Cái gì vẫn được sửa trong replay mode

Replay sidebar vẫn sửa:

- `detail[]`
- `stage`
- `step`
- các action `UI / map / geo / narrative`

Các thay đổi đó đi qua:

- `editor.mutateActiveReplay`
- `applyReplaySessionMutation()`

Undo replay vẫn riêng ở:

- `replayUndoStack`

## 9. Khi nào replay được flush về `replays[]`

`activeReplayDraft` chỉ là session đang mở.

Nó được flush về `replays[]` khi:

- thoát replay mode
- chuyển sang replay khác

Hàm chịu trách nhiệm là:

- `finalizeActiveReplaySession()`

## 10. Commit lấy replay từ đâu

Commit không lấy `activeReplayDraft` trực tiếp.

Nó lấy:

- `editor.effectiveReplays`

`effectiveReplays` là:

- `replays`
- cộng thêm overlay của `activeReplayDraft` nếu session hiện tại đã thay đổi nhưng chưa flush

Vì vậy:

- đang còn ở replay mode vẫn commit được replay mới nhất
- không cần thoát replay mode mới lưu được script

## 11. Replay đi qua API ra sao

Payload commit hiện tại chỉ gửi:

- `geometry_id`
- `target_geometry_ids`
- `detail`

Không gửi:

- `replayDraft`
- `replay_features`
- `FeatureCollection` local của replay mode

## 12. Migrate dữ liệu cũ

Snapshot cũ nếu còn:

```ts
replay_features?: FeatureCollection
```

thì FE sẽ:

- đọc `replay_features.features[].properties.id`
- chuyển chúng thành `target_geometry_ids`
- bỏ `replay_features` khỏi runtime replay mới

Nên dữ liệu cũ vẫn mở được, nhưng commit mới sẽ ra schema mới.
