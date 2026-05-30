# UHM Editor - replay actions catalog

Cập nhật: 2026-05-25.

Tài liệu này mô tả action catalog của replay editor/preview hiện tại. Shape chuẩn nằm ở `src/uhm/types/projects.ts`; dispatcher runtime nằm ở `src/uhm/lib/replay/replayDispatcher.ts`.

## 1. Replay shape

```ts
type BattleReplay = {
  id: string;
  geometry_id: string;
  target_geometry_ids: string[];
  detail: ReplayStage[];
};

type ReplayStage = {
  id: number;
  title?: string;
  detail_time_start: string;
  detail_time_stop: string;
  steps: ReplayStep[];
};

type ReplayStep = {
  duration: number;
  use_UI_function: ReplayAction<UIOptionName>[];
  use_map_function: ReplayAction<MapFunctionName>[];
  use_geo_function: ReplayAction<GeoFunctionName>[];
  use_narrow_function: ReplayAction<NarrativeFunctionName>[];
};

type ReplayAction<T> = {
  function_name: T;
  params: unknown[];
};
```

Ghi chú:

- `use_narrow_function` là tên field hiện tại cho nhóm narrative.
- `params` là tuple positional, không phải object schema.
- `target_geometry_ids` là source truth cho replay draft; không persist `replayDraft`.
- `detail_time_start/detail_time_stop` là string theo form replay hiện tại, không phải `time_start/time_end` số của geometry.

## 2. Runtime execution order

Preview flatten replay thành danh sách step theo thứ tự stage/step.

Trong mỗi step, dispatcher chạy các group action từ step hiện tại. Duration của step quyết định thời gian chờ trước step tiếp theo. Preview state có thể đổi:

- map camera/labels
- timeline visible/filter/year
- hidden geometry ids
- title/descriptions/subtitle/dialog/image/toast
- wiki sidebar/open wiki
- preview layer panel / zoom controls
- temporary geometry effects
- playback speed

Stop/reset preview khôi phục presentation state, map/timeline baseline, label visibility và dọn toàn bộ temporary geometry effects.

## 3. UI actions

| Action | Params | Runtime hiện tại |
| --- | --- | --- |
| `timeline` | `[visible: boolean]` | Ẩn/hiện TimelineBar trong preview |
| `layer_panel` | `[visible: boolean]` | Ẩn/hiện panel layer trong preview |
| `wiki_panel` | `[visible: boolean]` | Mở/đóng wiki sidebar preview |
| `close_wiki_panel` | `[]` | Đóng wiki sidebar và clear active wiki |
| `zoom_panel` | `[visible: boolean]` | Ẩn/hiện cụm zoom/projection control trên map preview |
| `wiki` | `[wikiId: string]` | Mở wiki sidebar và active wiki id |
| `toast` | `[message: string]` | Hiện toast tạm thời |
| `playback_speed` | `[speed: number]` | Đổi tốc độ phát preview |

Legacy shape vẫn được dispatcher đọc:

```ts
{ function_name: "UI", params: [optionName, ...payload] }
```

Shape mới nên dùng trực tiếp:

```ts
{ function_name: "timeline", params: [true] }
```

## 4. Map actions

| Action | Params | Runtime hiện tại |
| --- | --- | --- |
| `set_camera_view` | `[state]` | `map.easeTo` center/zoom/pitch/bearing/duration |
| `set_time_filter` | `[year: number]` | Set replay preview timeline year |
| `enable_timeline_filter` | `[]` | Bật timeline filter |
| `disable_timeline_filter` | `[]` | Tắt timeline filter |
| `toggle_labels` | `[visible: boolean]` | Legacy labels toggle |
| `show_labels` | `[]` | Hiện symbol text labels |
| `hide_labels` | `[]` | Ẩn symbol text labels |
| `show_all_geometries` | `[]` | Clear hidden geometry ids |
| `reset_camera_north` | `[]` | Set bearing về 0 |

`set_camera_view` chấp nhận center dạng `[lng, lat]` hoặc `{ lng, lat }`.

## 5. Geo actions

| Action | Params | Runtime hiện tại |
| --- | --- | --- |
| `fly_to_geometry` | `[geometryId]` | Legacy: fly tới một geometry |
| `fly_to_geometries` | `[geometryIds, duration?]` | Fit/fly tới nhiều geometry |
| `set_geometry_visibility` | `[geometryIds, visible]` | Legacy: show/hide theo boolean |
| `show_geometries` | `[geometryIds]` | Bỏ ids khỏi hidden set |
| `hide_geometries` | `[geometryIds]` | Thêm ids vào hidden set |
| `fit_to_geometries` | `[geometryIds, duration?]` | Legacy: dùng fly/fit tới geometry |
| `orbit_camera_around_geometry` | `[geometryId, zoom?, pitch?, turns?, duration?]` | Ease camera quanh bbox geometry |
| `pulse_geometry` | `[geometryId, color?, repeat?, duration?]` | Pulse overlay tạm thời, tự cleanup |
| `animate_dashed_border` | `[geometryId, color?, width?, speed?, duration?]` | Dashed border overlay tạm thời, tự cleanup |
| `set_geometry_style` | `[geometryIds, fill?, opacity?, stroke?, width?]` | Style overlay trong preview tới khi stop/reset |
| `show_geometry_label` | `[geometryId, text?, color?, size?]` | Hiện label riêng trong preview tới khi stop/reset |
| `follow_geometry_path` | `[geometryId, duration?, zoom?, pitch?]` | Camera chạy theo tọa độ path geometry |
| `follow_geometries_path` | `[geometryIds, duration?, zoom?, pitch?]` | Camera chạy theo chuỗi path geometry |
| `dim_other_geometries` | `[geometryIds]` | Chỉ hiện target ids, ẩn các geometry khác |

Các visual effect dùng overlay source/layer riêng và không mutate geometry draft.

## 6. Narrative actions

| Action | Params | Runtime hiện tại |
| --- | --- | --- |
| `set_dialog` | `[data: { text: string; image_url?: string } \| null]` | Set dialog box text and optional image, or clear it if null |
| `set_title` | `[title: string]` | Set title overlay |
| `clear_title` | `[]` | Clear title |
| `set_descriptions` | `[text: string]` | Set description overlay |
| `clear_descriptions` | `[]` | Clear descriptions |
| `show_dialog_box` | `[avatar, text, side, speaker?]` | Legacy: hiện dialog, nay được normalize sang `set_dialog` |
| `clear_dialog_box` | `[]` | Clear dialog |
| `display_historical_image` | `[url, caption?]` | Legacy: hiện image overlay, nay được normalize sang `set_dialog` |
| `clear_historical_image` | `[]` | Clear image |
| `set_step_subtitle` | `[subtitle: string | null]` | Set subtitle |
| `clear_step_subtitle` | `[]` | Clear subtitle |

## 7. Composer shortcuts hiện có

Map shortcuts:

- `show_labels`
- `hide_labels`
- `enable_timeline_filter`
- `disable_timeline_filter`
- `set_time_filter`
- `reset_camera_north`
- `show_all_geometries`

Geo shortcuts:

- `fly_to_geometries`
- `follow_geometries_path`
- `show_geometries`
- `hide_geometries`
- `pulse_geometry`
- `animate_dashed_border`
- `orbit_camera_around_geometry`
- `show_geometry_label`
- `dim_other_geometries`
- `set_geometry_style`

Narrative composer hiện hỗ trợ đầy đủ các narrative actions ở mục 6.

Timeline action list hỗ trợ reorder, duplicate, delete và edit `params` trực tiếp bằng JSON array có validate nhẹ. Composer bên phải vẫn là đường chính để tạo action mới.

## 8. Normalization và migration

Khi load snapshot:

- Replay thiếu `geometry_id` có thể fallback từ `id`.
- `target_geometry_ids` được normalize/dedupe, MAIN geo đứng đầu.
- Snapshot cũ có `replay_features` được chuyển thành `target_geometry_ids`.
- UI legacy action `{ function_name: "UI", params: [...] }` được normalize sang option action.
- Unknown action/function bị bỏ qua trong normalize/dispatcher.
- Normalizer snapshot hiện giữ các action đang có trong type/UI, gồm `close_wiki_panel`, `show_all_geometries` và các narrative `clear_*`.

## 9. Undo và commit boundary

- Replay mode dùng `replayUndoStack`, tách khỏi main undo.
- Sửa stage/step/action đi qua `editor.mutateActiveReplay`.
- Mỗi mutation tạo `replay_session` undo action.
- Thoát hoặc chuyển replay flush session vào `replays[]`.
- Commit đọc `editor.effectiveReplays`, nên có thể commit khi vẫn đang ở replay mode.
- Replay mode hiện không cho create/update/delete geometry.

## 10. Checklist khi thêm replay action

1. Thêm function name vào `src/uhm/types/projects.ts`.
2. Thêm label/summary trong `ReplayTimelineSidebar`.
3. Thêm composer hoặc shortcut trong `ReplayEffectsSidebar`.
4. Thêm runtime trong `replayDispatcher.ts` và action module phù hợp.
5. Thêm normalize support trong `editorSnapshot.ts`.
6. Xác định action có cần reset khi stop preview không.
7. Cập nhật file này và `commit_snapshot.ts`.
