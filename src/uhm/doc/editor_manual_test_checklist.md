# UHM Editor - manual test checklist

Cập nhật: 2026-05-22.

Checklist này dùng sau mỗi lần sửa editor. Không thay thế typecheck/lint, nhưng bắt các lỗi workflow mà static check khó thấy.

## 1. Preflight

- Mở `/editor/[id]` với một project có ít nhất một geometry/entity/wiki.
- Mở console browser, đảm bảo không có runtime error ngay khi load.
- Kiểm tra map render đủ geometry, panel trái/phải không overlap.
- Kiểm tra `UndoListPanel` ban đầu không có action lạ từ lần load.

## 2. Geometry create/edit/delete

| Bước | Thao tác | Kỳ vọng |
| --- | --- | --- |
| 1 | Vẽ polygon ở `draw` mode | Geometry mới được select, panel hiện `no entity` và `no time` |
| 2 | Undo | Polygon biến mất, undo stack giảm |
| 3 | Tạo point | Point render bằng icon geotype bình thường, không đổi màu riêng vì orphan |
| 4 | Apply type/time cho point | Panel đổi `no time`/`partial time` đúng theo input |
| 5 | Sửa vertex/circle nếu có geometry phù hợp | Undo khôi phục geometry cũ |
| 6 | Xóa một geometry | Geometry biến mất, undo khôi phục đúng vị trí trong list |
| 7 | Multi-select cùng shape và xóa | Undo khôi phục toàn bộ geometry đã xóa |

## 3. Geometry status panel

- Row không hiển thị ID trực tiếp.
- Hover row thấy tooltip có `ID: ...`.
- Geometry không entity hiện chip `no entity`.
- Geometry thiếu cả `time_start/time_end` hiện `no time`.
- Geometry thiếu một trong hai field time hiện `partial time`.
- Bật timeline filter:
  - Geometry còn visible hiện chip `timeline`.
  - Geometry bị lọc khỏi draft visible hiện chip `out timeline`.
- Eye button set `hidden`, map ẩn geometry và panel hiện chip `hidden`.
- `NewBadge` vẫn hiện cho geometry mới/import chưa persisted.

## 4. Entity và geometry-entity

| Bước | Thao tác | Kỳ vọng |
| --- | --- | --- |
| 1 | Search entity và Add vào project | Entity xuất hiện trong panel, undo gỡ entity ref |
| 2 | Tạo entity local | Entity mới xuất hiện, form reset, undo gỡ entity |
| 3 | Sửa entity name/time | Undo khôi phục metadata entity |
| 4 | Bind entity vào selected geometry | Chip `no entity` biến mất, undo trả lại trạng thái cũ |
| 5 | Unbind entity | Chip `no entity` hiện lại, commit bị chặn nếu geometry còn orphan |
| 6 | Multi-select khác shape rồi bind entity | UI báo không thể bind nhiều geometry khác loại |

## 5. Geometry-geometry binding

- Chọn một geometry, bind geometry khác trong `GeometryBindingPanel`.
- Panel hiện chip `bound` cho geometry liên quan.
- Toggle Filter: map chỉ hiện selection, selected children và parent/root phù hợp.
- Undo bind/unbind geometry phải khôi phục `properties.bound_with`.
- Bind geometry-geometry không làm mất chip `no entity` nếu geometry vẫn chưa bind entity.

## 6. Wiki và entity-wiki

| Bước | Thao tác | Kỳ vọng |
| --- | --- | --- |
| 1 | Search wiki và Add | Wiki ref xuất hiện, undo gỡ wiki ref |
| 2 | Tạo/sửa wiki local | Undo khôi phục danh sách/wiki content |
| 3 | Bind entity-wiki | Link xuất hiện, undo khôi phục links |
| 4 | Xóa wiki đang có entity-wiki links | Wiki và links liên quan bị xóa cùng lúc |
| 5 | Undo xóa wiki | Wiki và entity-wiki links cùng trở lại |
| 6 | Insert wiki link trong editor | Link nằm trong doc sau khi lưu wiki |

## 7. Replay

- Chọn geometry có entity, bấm replay.
- Replay mở với MAIN geo và các target ids có `bound_with` trỏ tới MAIN.
- Tạo stage, tạo step, đổi duration.
- Thêm narrative action `set_title` và `set_descriptions`.
- Thêm map action `set_time_filter`, `show_labels`, `hide_labels`.
- Thêm geo action `fly_to_geometries`, `hide_geometries`, `show_geometries`.
- Undo trong replay mode chỉ undo replay session, không undo main geometry.
- Play preview:
  - Step selection chạy đúng thứ tự.
  - Stop/reset khôi phục title/dialog/image/hidden geometry/timeline/map camera cơ bản.
- Thoát replay rồi vào lại, detail vẫn còn nếu chưa undo.

## 8. Import GEO từ search

- Search GEO theo entity.
- Import một geometry chưa có trong draft.
- Kỳ vọng:
  - Timeline filter tự tắt.
  - Geometry được select.
  - Entity ref được thêm nếu chưa có.
  - Undo gỡ cả geometry và entity ref nếu entity ref được tạo trong cùng action.
- Import lại cùng GEO:
  - Không tạo duplicate geometry.
  - Chỉ select geometry đã có.

## 9. Commit và restore

| Bước | Thao tác | Kỳ vọng |
| --- | --- | --- |
| 1 | Commit khi không có thay đổi | Báo không có thay đổi |
| 2 | Commit khi còn orphan geometry | Bị chặn, select orphan đầu tiên, panel entity báo chưa bind |
| 3 | Bind entity rồi commit | Commit thành công, undo stack cleared, pending count về 0 |
| 4 | Kiểm snapshot commit | Có `geometries`, `geometry_entity`, `entities`, `wikis`, `entity_wiki`, `replays` đúng thay đổi |
| 5 | Restore commit cũ | Draft/snapshot panels reset theo commit |

## 10. Submit

- Khi còn pending changes, submit phải bị chặn và yêu cầu commit trước.
- Khi còn orphan geometry, submit bị chặn giống commit.
- Khi đã commit sạch và không orphan, submit tạo submission id/status.
- Nếu project bị pending submission lock, banner unlock hoạt động và mở lại project.

## 11. UI-only checks

Các thao tác sau không được thêm undo action và không làm tăng pending save count:

- Đổi timeline year/filter.
- Toggle background layers.
- Hide/show geometry local.
- Focus geometry từ panel.
- Resize panel.
- Search query.
- Pick/paste/remove image overlay trace.
- Replay preview play/stop/reset.

## 12. Final smoke

- `npx tsc --noEmit --pretty false`.
- Targeted eslint cho file vừa sửa.
- `git diff --check`.
- Nếu sửa frontend UI lớn: mở dev server và test ít nhất desktop viewport.
