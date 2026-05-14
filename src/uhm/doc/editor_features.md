# UHM Editor - tính năng hiện có

Tài liệu này mô tả editor đang chạy tại `src/app/editor/[id]/page.tsx` và các panel liên quan trong `src/uhm/components/`.
Mục tiêu của tài liệu là phản ánh đúng implementation hiện tại, không mô tả các tính năng chưa được nối dây.

## 1. Cách mở editor

- `GET /editor/[id]`: mở editor đầy đủ với map, panel trái và panel phải.

## 2. Bố cục giao diện

- Cột trái (`Editor.tsx`)
  - `ProjectPanel`
  - `ToolsPanel`
  - `CommitPanel`
  - `CommitHistoryPanel`
  - `UndoListPanel`
- Khu vực giữa
  - `Map`
  - `TimelineBar` khi không ở `replay`
- Cột phải (`BackgroundLayersPanel`)
  - Search hợp nhất
  - Geometry Binding
  - Entities
  - Wiki
  - Entity ↔ Wiki
  - Selected Geometry

Hai cột hai bên đều resize được bằng drag handle.

## 3. Editor modes

`EditorMode` hiện có:

- `idle`
- `select`
- `draw`
- `add-point`
- `add-line`
- `add-path`
- `add-circle`
- `replay`

Ý nghĩa thực tế:

- `select`: chọn geometry, xóa geometry, mở vertex editing cho polygon/circle, vào replay.
- `draw`: vẽ polygon.
- `add-point`: tạo point.
- `add-line`: vẽ `LineString`.
- `add-path`: vẽ `LineString` có render arrow layer cho route.
- `add-circle`: kéo chuột để tạo polygon hình tròn, có `circle_center` và `circle_radius`.
- `replay`: hiện là chế độ tập trung vào một geometry và các geometry trong `binding`; chưa có hệ thống script replay UI/map như file schema tham chiếu.

## 4. Công cụ vẽ và phím điều khiển

### Polygon (`draw`)

- Click để thêm đỉnh.
- `Shift` hoặc `Alt` khi click/move để snap vào geometry gần nhất.
- `Enter` để hoàn tất polygon.
- `Escape` để hủy.
- `Backspace` để bỏ đỉnh cuối.

Geometry mới mặc định có:

- `type: "country"`
- `geometry_preset: "polygon"`
- `entity_ids: []`
- `binding: []`

### Point (`add-point`)

- Click một lần để tạo point.
- Geometry mới mặc định có `type: "city"` và `geometry_preset: "point"`.

### Line (`add-line`)

- Click để thêm đỉnh.
- `Enter` để hoàn tất.
- `Escape` để hủy.
- `Backspace` để bỏ đỉnh cuối.

Geometry mới mặc định có `type: "defense_line"` và `geometry_preset: "line"`.

### Path (`add-path`)

- Tương tự `add-line`, nhưng render preview và layer theo route/path.
- Geometry mới mặc định có `type: "attack_route"` và `geometry_preset: "line"`.

### Circle (`add-circle`)

- `mousedown` để đặt tâm.
- Kéo chuột để thay đổi bán kính.
- `mouseup` để hoàn tất.
- `Escape` để hủy.

Geometry trả về vẫn là `Polygon`, nhưng có thêm:

- `circle_center`
- `circle_radius`

Mặc định `type: "war"` và `geometry_preset: "circle-area"`.

## 5. Chọn và sửa geometry

### Selection

- `Map` trả về danh sách `selectedFeatureIds`.
- `SelectedGeometryPanel`, `ProjectEntityRefsPanel` và `GeometryBindingPanel` đều đọc từ selection này.
- Multi-select có tồn tại ở level state, nhưng một số thao tác chỉ hợp lệ khi các geometry cùng shape.

### Vertex editing

Khi đang ở `select`, editor có thể sửa polygon/circle qua `editingEngine`.

- Kéo handle để đổi vị trí đỉnh.
- Với circle:
  - handle `0`: dời tâm
  - handle `1`: đổi bán kính
- `Ctrl` hoặc `Cmd` + click lên đường edit để chèn thêm đỉnh mới cho polygon.
- `Enter` để áp dụng chỉnh sửa.
- `Escape` để hủy chỉnh sửa.

### Xóa geometry

- Hành động xóa được đi qua `onDeleteFeature`.
- Undo có thể khôi phục lại geometry vừa xóa.

## 6. Metadata geometry

`SelectedGeometryPanel` hiện cho phép sửa:

- `type_key`
- `time_start`
- `time_end`

`binding` đang được hiển thị trong state form nhưng không có input edit trực tiếp trong panel; việc bind/unbind geometry hiện đi qua `GeometryBindingPanel`.

Các ràng buộc đang có:

- `time_start` và `time_end` phải parse được thành số hoặc để trống.
- Nếu cả hai đều có giá trị thì `time_start <= time_end`.

Khi apply, editor patch trực tiếp `feature.properties` của geometry đang chọn.

## 7. Timeline

`TimelineBar` hiện dùng dải năm cố định từ util timeline.

- Slider + numeric input cùng điều khiển `timelineDraftYear`.
- Có toggle `filterEnabled`.
- Khi bật filter:
  - geometry đã có trong baseline chỉ hiện nếu năm hiện tại nằm trong `[time_start, time_end]`
  - geometry mới tạo trong session vẫn được giữ visible

Timeline hiện là filter phía client, không fetch lại dữ liệu project theo năm.

## 8. Search hợp nhất và import

Panel phải có `UnifiedSearchBar` với 3 loại search:

- `entity`
  - tìm local + backend theo tên/mô tả
  - nút `Add` sẽ thêm entity vào `snapshotEntities` dưới dạng `reference`
- `wiki`
  - tìm backend theo title
  - nút `Add` sẽ thêm wiki vào `snapshotWikis` dưới dạng `reference`
- `geo`
  - tìm geometry theo tên entity
  - nút `Import` sẽ import geometry vào draft hiện tại
  - đồng thời thêm entity tương ứng vào `snapshotEntities` nếu chưa có
  - import sẽ tự tắt timeline filter để geometry mới import không bị ẩn

## 9. Entity và binding

### Project entities

`ProjectEntityRefsPanel` hỗ trợ:

- tạo entity local (`source: "inline"`, `operation: "create"`)
- sửa entity đã có trong snapshot
- bind/unbind entity vào geometry đang chọn

Editor không gọi API create entity riêng ở bước này. Entity mới chỉ sống trong snapshot cho tới khi commit project.

### Geometry ↔ Entity

Liên kết nhiều-nhiều được thể hiện bằng:

- field UI trên feature: `entity_id`, `entity_ids`, `entity_name`, `entity_names`
- payload snapshot: `geometry_entity[]`

Panel `ProjectEntityRefsPanel` là nơi bind/unbind entity theo geometry đang chọn.

### Geometry ↔ Geometry

`GeometryBindingPanel` thao tác trên `feature.properties.binding`.

- Chọn một geometry làm gốc.
- Bind/unbind với geometry khác trong project.
- Có nút focus để zoom vào geometry trong list binding.
- Có toggle `Filter`: map chỉ hiển thị geometry liên quan tới selection nếu filter binding đang bật.

## 10. Wiki và entity-wiki

### Wiki panel

`WikiSidebarPanel` dùng `react-quill-new`.

Các khả năng đang có:

- tạo wiki local
- sửa title/slug/doc
- import HTML file
- export nội dung hiện tại theo định dạng suy ra từ `doc`
- lưu wiki vào `snapshotWikis`

Storage thực tế của `doc`:

- format mới: HTML string
- format cũ tương thích: Tiptap JSON string
- plaintext fallback

### Internal wiki link

Toolbar `link` mở modal custom:

- tìm wiki local theo title/slug
- tìm wiki global từ server
- chèn link bằng `slug`, không bắt buộc scheme URL
- có thể tạo `__missing__` link để đánh dấu liên kết chưa map được

### Entity ↔ Wiki

`EntityWikiBindingsPanel` quản lý `snapshotEntityWikiLinks`.

- link mới dùng `operation: "binding"`
- unlink bằng cách remove row khỏi editor state
- khi build snapshot, editor tự sinh delta `binding` hoặc `delete` so với baseline

## 11. Commit, submit và restore

### Pending change count

Số trong nút `Commit` không chỉ là geometry diff. Nó gồm:

- `editor.changeCount`
- `+1` nếu danh sách wiki dirty
- `+1` nếu danh sách entity dirty
- `+1` nếu danh sách entity-wiki dirty

### Commit

`commitSection()`:

- build snapshot từ `draft` + `snapshotEntities` + `snapshotWikis` + `snapshotEntityWikiLinks`
- gửi `snapshot_json` lên API tạo commit
- nếu thành công:
  - reset baseline sang snapshot vừa commit
  - clear undo stack
  - clear geometry changes

### Submit

- chỉ submit được khi project có `head_commit_id`
- không submit nếu còn thay đổi chưa commit

### Restore

`CommitHistoryPanel` có nút `Restore`, nhưng restore hiện là:

- load snapshot từ commit cũ vào FE
- không đổi head commit trên backend

Đây là FE-only restore để tiếp tục chỉnh sửa từ snapshot cũ.

## 12. Pending submission lock

Khi `openSectionEditor()` thấy project có submission `PENDING`, editor bị chặn mở.

UI hiện tại:

- hiển thị màn hình lock
- cho phép xóa pending submission để unlock

Luồng này bám sát rule backend mới, không phải readonly mode giả lập ở FE.

## 13. Những thứ doc cũ từng nhắc nhưng code hiện chưa có

Các mục sau không nên xem là tính năng hiện hành của editor:

- autosave toàn bộ draft editor vào `localStorage`
- restore head commit trên backend từ UI editor
- import/export wiki JSON chuyên biệt như một workflow riêng
- bộ shortcut toàn cục kiểu `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`
- workflow duyệt `Approved/Rejected` được render đầy đủ trong editor page
- hệ thống replay script theo `replays[]` trong schema snapshot
