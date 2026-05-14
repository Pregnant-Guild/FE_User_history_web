# UHM Editor - developer guide thực dụng

Tài liệu này dành cho người sửa editor hiện tại, không phải mô tả kiến trúc lý tưởng.

## 1. Entry points quan trọng

- `src/app/editor/[id]/page.tsx`
  - orchestration chính của project editor
- `src/uhm/components/Map.tsx`
  - container cho map và các hook map
- `src/uhm/lib/editor/state/useEditorState.ts`
  - draft geometry + diff + undo
- `src/uhm/lib/editor/state/useEditorSessionState.ts`
  - session/UI/project/wiki/entity state
- `src/uhm/lib/editor/snapshot/editorSnapshot.ts`
  - normalize snapshot từ backend và build snapshot gửi ngược lại backend

Nếu chưa đọc 5 file này, chưa nên sửa behavior lớn của editor.

## 2. Cấu trúc thư mục nên ưu tiên hiểu

- `src/uhm/components/editor/`
  - panel UI bên trái/phải
- `src/uhm/components/wiki/`
  - wiki editor và wiki viewer/sidebar
- `src/uhm/components/map/`
  - hooks tích hợp MapLibre
- `src/uhm/lib/map/engines/`
  - logic interaction theo mode
- `src/uhm/lib/editor/session/`
  - các nhóm session state
- `src/uhm/lib/editor/draft/`
  - draft diff và undo
- `src/uhm/lib/editor/snapshot/`
  - schema conversion / snapshot semantics

## 3. Cách editor thật sự vận hành

Editor có 3 tầng dữ liệu:

1. `baselineSnapshot`
   - snapshot gốc của session
2. `initialData`
   - `FeatureCollection` rehydrate từ snapshot đó
3. `draft`
   - working copy để user sửa trên map

Khi commit:

- geometry đi từ `draft`
- entity/wiki/link đi từ snapshot collections
- `buildEditorSnapshot()` quyết định operation nào là `reference`, `binding`, `update`, `delete`

Đừng tự build payload ở component nếu chưa hiểu file `editorSnapshot.ts`.

## 4. Khi thêm mode/tool mới

Checklist an toàn:

1. Thêm mode vào `sessionTypes.ts`.
2. Thêm button vào `ToolsPanel.tsx`.
3. Nếu mode cần preview source/layer mới, thêm vào `setupMapLayers()`.
4. Nối mode với engine trong `useMapInteraction.ts`.
5. Nếu tool tạo geometry mới, chọn default:
   - `type`
   - `geometry_preset`
   - `entity_ids`
   - `binding`
6. Kiểm tra interaction cleanup khi chuyển mode.

Nếu mode chưa được cleanup đúng, map rất dễ giữ preview cũ hoặc event listener cũ.

## 5. Khi thêm geotype mới

Checklist ngắn:

1. Cập nhật `geoTypeMap` nếu cần mapping backend code <-> key.
2. Cập nhật `geometryTypeOptions.ts`.
3. Tạo style file trong `styles/geotypes/`.
4. Register ở `geotypeLayers.ts`.
5. Kiểm tra point icon hoặc label pipeline nếu type mới là point/route/polygon label.

Nếu chỉ sửa `geometryTypeOptions.ts` mà quên style registry, UI sẽ cho chọn type nhưng map không render đúng.

## 6. Khi sửa snapshot semantics

File quan trọng nhất là `editorSnapshot.ts`.

Ở đó đang có hai hướng xử lý khác nhau:

- `normalizeEditorSnapshot(raw)`
  - đọc payload từ backend
  - rehydrate fields UI như `entity_ids`, `entity_name`, `binding`, `time_start`, `time_end`
- `buildEditorSnapshot(options)`
  - strip các field generate-only khỏi `editor_feature_collection`
  - build `geometry_entity[]` và `entity_wiki[]`
  - tính operation phù hợp

Nguyên tắc:

- feature trong editor có thể mang field denormalized để UI dễ dùng
- payload gửi backend thì không nên mang những field denormalized đó

## 7. Khi sửa wiki editor

Wiki project editor hiện là Quill, không phải Tiptap.

Các file nên đọc trước:

- `WikiSidebarPanel.tsx`
- `PublicWikiSidebar.tsx`

Các điểm dễ làm hỏng:

- sanitize link của Quill
- compatibility với doc dạng HTML/Tiptap JSON/plain text
- slug links nội bộ
- sentinel `__missing__`

Nếu thay storage format, phải sửa cả editor lẫn viewer compatibility path.

## 8. Những key localStorage thật sự đang dùng

- `uhm.backgroundLayerVisibility.v1`
- `uhm:mapProjection`

Hiện không có local draft autosave toàn editor.
Đừng dựa vào doc cũ hoặc giả định rằng F5 sẽ hồi lại draft geometry/wiki/entity.

## 9. Restore commit hiện là FE-only

`CommitHistoryPanel -> Restore`:

- load snapshot từ commit cũ
- reset editor state ở frontend
- không đổi head commit trên backend

Nếu muốn restore server-side thật, cần dùng endpoint backend riêng và sửa cả UI wording.

## 10. Pending submission lock là rule thật

`openSectionEditor()` chủ động chặn project có `PENDING` submission.

Nghĩa là:

- không nên "lách" UI để cho sửa tiếp
- nếu đổi behavior này, phải thống nhất với backend contract

## 11. Performance và state hygiene

Một số nguyên tắc nên giữ:

- dùng `draftRef`/refs trong map engines để tránh rebind handler vô ích
- giữ component panel càng dumb càng tốt, logic patch state đặt ở page/hooks
- khi cần undo cho entity/wiki/link, đi qua `editor.setSnapshot*()` để undo stack biết
- hạn chế thêm `JSON.stringify` compare ở chỗ nóng nếu chưa đo hiệu năng

## 12. Chỗ dễ gây hiểu nhầm khi debug

### Geometry biến mất

Có thể do:

- timeline filter
- geometry visibility theo type
- binding filter
- replay hide outside

Không phải lúc nào cũng là bug render layer.

### Commit count lạ

`Commit (N)` là `pendingSaveCount`, không phải số mutation backend.

### Selection mất

Khi timeline filter làm geometry đang chọn không còn visible, page sẽ tự cắt `selectedFeatureIds`.

## 13. Nên test gì sau khi sửa

Ít nhất nên test thủ công:

1. mở project có commit cũ
2. tạo geometry mới bằng mode liên quan
3. sửa metadata geometry
4. bind entity và geometry
5. tạo/sửa wiki
6. link entity-wiki
7. commit
8. restore từ commit cũ
9. mở project có pending submission nếu đang debug flow đó
