# Hướng Dẫn Hệ Thống Undo / Redo Trong Replay Mode

Tài liệu này mô tả chi tiết kiến trúc hoạt động của hệ thống Undo/Redo khi người dùng thao tác trong chế độ Biên tập Replay (Replay Editor Mode), bao gồm danh sách các hành động (actions) được ghi nhận và các hàm tương ứng chịu trách nhiệm lưu trữ lịch sử.

---

## 1. Kiến Trúc Hai Nhánh Undo (Double Undo Stack)

Hệ thống editor sử dụng hai ngăn xếp (stack) undo độc lập quản lý bởi Hook `useEditorState.ts`:
1.  **`mainUndoStack`:** Quản lý các thay đổi trên bản đồ chính (thêm/sửa/xóa đối tượng địa lý, liên kết wiki...).
2.  **`replayUndoStack`:** Quản lý cục bộ các thay đổi bên trong kịch bản Replay đang mở.

### Cơ chế đóng gói phiên làm việc (Session Transaction)
*   Khi người dùng bắt đầu vào chế độ Replay (`switchReplayContext`), ngăn xếp `replayUndoStack` sẽ được làm sạch bằng `clearReplayUndo()`.
*   Tất cả các chỉnh sửa tạm thời trong Replay Editor sẽ chỉ được ghi vào `replayUndoStack`.
*   Khi người dùng thoát chế độ Replay hoặc chuyển sang Replay khác (`finalizeActiveReplaySession`), toàn bộ phiên thay đổi sẽ được so sánh với trạng thái gốc. Nếu có thay đổi, hệ thống sẽ đẩy **một hành động duy nhất** có kiểu `replay` vào ngăn xếp `mainUndoStack`.
*   Nếu người dùng nhấn **Undo** ở chế độ bản đồ chính, toàn bộ phiên sửa đổi replay đó sẽ được khôi phục về trạng thái trước khi mở chế độ Replay.

---

## 2. Hàm Ghi Nhận Lịch Sử Trung Tâm: `onMutateReplay`

Mọi hành động biên tập kịch bản Replay đều phải đi qua prop callback `onMutateReplay` (được ánh xạ từ `applyReplaySessionMutation` trong `useEditorState.ts`).

### Logic xử lý của `applyReplaySessionMutation`:
1.  Nhận vào mô tả hành động (`label`) và một hàm thay đổi (`mutator(draft)`).
2.  Tự động sao chép sâu (`deepClone`) trạng thái trước đó của replay.
3.  Thực hiện hàm `mutator` trên bản sao.
4.  So sánh trạng thái mới và cũ (`replayEquals`). Nếu không có sự thay đổi thực tế, hàm sẽ bỏ qua.
5.  Nếu có thay đổi, đẩy trạng thái cũ vào `replayUndoStack` kèm theo nhãn hành động tương ứng để hiển thị trong lịch sử.

---

## 3. Danh Sách Các Hành Động Được Ghi Nhận Vào Undo

Dưới đây là chi tiết các hàm trong hai Sidebar tương tác trực tiếp với `onMutateReplay`:

### 3.1. Các hành động trong `ReplayTimelineSidebar.tsx`

| Chức năng biên tập | Hàm xử lý trong code | Nhãn ghi nhận Undo (`label`) | Mô tả tác vụ |
| :--- | :--- | :--- | :--- |
| **Nhập JSON Replay** | *Nút Import JSON* | `"Replay: import JSON"` | Nhập toàn bộ dữ liệu cấu trúc kịch bản mới từ tệp bên ngoài. |
| **Tạo Stage mới** | `handleCreateStage` | `"Replay: tạo stage #[ID]"` | Tạo mới một phân đoạn (stage), tự động chèn một step đầu tiên ẩn các geo không phải là background. |
| **Sắp xếp thứ tự Stage** | `handleStagesReorder` | `"Replay: sắp xếp stage #[ID]"` | Thay đổi thứ tự hiển thị của các stage trong dòng thời gian. |
| **Xóa Stage** | `handleDeleteStage` | `"Replay: xóa stage #[ID]"` | Loại bỏ một phân đoạn khỏi kịch bản. |
| **Nhân bản Stage** | `handleDuplicateStage` | `"Replay: nhân bản stage #[ID]"` | Sao chép toàn bộ nội dung của stage cũ sang stage mới. |
| **Tạo Step mới** | `handleCreateStep` | `"Replay: tạo step cho stage #[ID]"` | Thêm một bước mới vào trong một stage. |
| **Cập nhật thời lượng Step** | `handleUpdateStepDuration` | `"Replay: cập nhật duration step [Index] của stage #[ID]"` | Thay đổi thời gian chờ/hiệu ứng của bước (đơn vị ms). |
| **Xóa Step** | `handleDeleteStep` | `"Replay: xóa step [Index] của stage #[ID]"` | Loại bỏ một bước khỏi stage hiện tại. |
| **Nhân bản Step** | `handleDuplicateStep` | `"Replay: nhân bản step [Index] của stage #[ID]"` | Sao chép toàn bộ các hành động trong bước đó. |
| **Sắp xếp thứ tự Step** | `handleStepsReorder` | `"Replay: sắp xếp step của stage #[ID]"` | Đổi thứ tự thực hiện giữa các bước trong một stage. |
| **Xóa hành động (Action)** | `handleDeleteAction` | `"Replay: xóa action [Tên hàm] ở step [Index] của stage #[ID]"` | Loại bỏ một hiệu ứng/câu thoại khỏi một bước cụ thể. |
| **Sắp xếp thứ tự các Action** | *Hàm ẩn danh truyền vào ActionList* | `"Replay: sắp xếp actions ở step [Index] của stage #[ID]"` | Đổi thứ tự áp dụng hiệu ứng trong cùng một bước. |
| **Cập nhật thông số Action** | `handleUpdateActionParams` | `"Replay: cập nhật params [Tên hàm] ở step [Index] của stage #[ID]"` | Chỉnh sửa trực tiếp tham số (params) của một hiệu ứng (qua giao diện hoặc mã JSON). |
| **Sửa Metadata của Stage** | `handleApplyStageMetadata` | `"Replay: cập nhật stage #[ID]"` | Cập nhật tiêu đề, mốc thời gian bắt đầu và kết thúc của Stage. |

### 3.2. Các hành động trong `ReplayEffectsSidebar.tsx`

Tất cả các nút thao tác nhanh (shortcuts) trong bảng hiệu ứng bên phải đều sử dụng hàm `updateActionGroup` để cập nhật trạng thái bước hiện tại, từ đó tự động ghi nhận vào ngăn xếp Undo:

| Nút lệnh tác vụ nhanh | Nhãn ghi nhận Undo (`label`) | Hiệu ứng áp dụng |
| :--- | :--- | :--- |
| **Đặt Camera** | `"Map: set camera view"` | `set_camera_view` (lưu vị trí, góc xoay bản đồ hiện tại). |
| **Hiện Nhãn Bản Đồ** | `"Map: show labels"` | `set_labels_visible(true)` |
| **Ẩn Nhãn Bản Đồ** | `"Map: hide labels"` | `set_labels_visible(false)` |
| **Xoay Bắc** | `"Map: reset camera north"` | `set_camera_view` (bearing = 0). |
| **Hiện Tất Cả Hình Học** | `"Map: show all geometries"` | `show_geometries` (đối với toàn bộ geo). |
| **Bay Tới Các Geo** | `"Geo: fly to [Số lượng] geo"` | `fly_to_geometries` |
| **Chạy Theo Tuyến Đường** | `"Geo: chạy camera theo đường [Số lượng] geo"` | `follow_geometries_path` |
| **Hiển Thị Các Geo** | `"Geo: hiện [Số lượng] geo"` | `show_geometries` |
| **Ẩn Các Geo** | `"Geo: ẩn [Số lượng] geo"` | `hide_geometries` |
| **Nhấp Nháy Geo** | `"Geo: pulse [Số lượng] geo"` | `pulse_geometry` |
| **Hiệu Ứng Viền Nét Đứt** | `"Geo: chạy viền nét đứt [Số lượng] geo"` | `animate_dashed_border` |
| **Đặt làm BG (Mới)** | `"Geo: đặt [Số lượng] geo làm background"` | `set_as_background_geometries` (Bảo vệ luôn hiển thị). |
| **Loại khỏi BG (Mới)** | `"Geo: loại [Số lượng] geo khỏi background"` | `remove_from_background_geometries` |
| **Ẩn Các Geo Khác** | `"Geo: hide others ngoài [Số lượng] geo"` | `hide_others_geometries` |
| **Thay Đổi Kiểu Dáng** | `"Geo: đổi style [Số lượng] geo"` | `set_geometry_style` |
| **Quay Camera 3D** | `"Geo: quay camera quanh geo"` | `orbit_camera_around_geometry` |
| **Hiện Nhãn Riêng Cho Geo** | `"Geo: hiện nhãn cho geo"` | `show_geometry_label` |

---

---

## 4. Danh Sách Các Hành Động Undo Của Editor Chính (Main Editor)

Khác với chế độ Replay có stack cục bộ, các thao tác chỉnh sửa bản đồ và metadata chính được đẩy thẳng vào `mainUndoStack` thông qua hàm `pushMainUndo` trong `useEditorState.ts`.

| Loại hành động (`type`) | Hàm kích hoạt trong code | Nhãn mặc định / Tác vụ | Chi tiết khôi phục |
| :--- | :--- | :--- | :--- |
| **`create`** | `createFeature` | *Không nhãn* (Thêm Geo) | Xóa bỏ đối tượng địa lý mới tạo khỏi bản vẽ nháp (`mainDraft`). |
| **`delete`** | `deleteFeature` | *Không nhãn* (Xóa Geo) | Khôi phục đối tượng địa lý đã xóa về đúng vị trí index cũ trong mảng. |
| **`update`** | `updateFeature` | *Không nhãn* (Sửa Shape) | Khôi phục tọa độ (geometry shape) ban đầu của đối tượng địa lý. |
| **`properties`** | `patchFeatureProperties` | *Không nhãn* (Sửa thông tin) | Khôi phục các thuộc tính metadata cũ (entity_ids, labels, style...). |
| **`replay`** | `finalizeActiveReplaySession` | `"Replay #[ID]"` | Khôi phục toàn bộ kịch bản replay của đối tượng về trạng thái trước khi mở session biên tập. |
| **`snapshot_entities`**| `setSnapshotEntityRowsUndoable` | `"Cập nhật entities"` hoặc tùy chỉnh | Khôi phục danh sách các Entity trong snapshot (đổi tên, thêm mới, xóa tạm thời). |
| **`snapshot_wikis`** | `setSnapshotWikisUndoable` | `"Cập nhật wikis"` hoặc tùy chỉnh | Khôi phục danh sách các Wiki bài viết trong snapshot. |
| **`snapshot_entity_wiki``**|`setSnapshotEntityWikiLinksUndoable`|`"Cập nhật liên kết"` hoặc tùy chỉnh| Khôi phục liên kết kết nối giữa Entity và Wiki. |
| **`group`** | *Nhiều hàm ghép nhóm* (Xem bên dưới) | Tùy chỉnh theo tác vụ | Chạy hoàn tác đồng thời nhiều hành động thuộc các kiểu ở trên. |

### Các hàm sử dụng nhóm hành động hoàn tác (`group` action):
1.  **`createFeatureWithSnapshotEntityRows`**: Gom hành động tạo geometry (`create`) và tạo entity liên kết (`snapshot_entities`).
2.  **`patchFeaturePropertiesBatch`**: Gom các thay đổi thuộc tính (`properties`) của nhiều đối tượng cùng lúc.
3.  **`deleteFeatures`**: Gom các hành động xóa (`delete`) nhiều đối tượng địa lý cùng lúc.
4.  **`changeFeatureId`**: Gom hành động cập nhật ID đối tượng địa lý và cập nhật lại tham chiếu ID đó ở các liên kết wiki/entity.
5.  **`removeSnapshotWikiUndoable`**: Gom hành động xóa wiki (`snapshot_wikis`) và xóa các liên kết kết nối của wiki đó (`snapshot_entity_wiki`).
6.  **`deleteEntityAndRelations`**: Gom hành động xóa entity (`snapshot_entities`), xóa liên kết (`snapshot_entity_wiki`), và gỡ tham chiếu entity đó khỏi thuộc tính của đối tượng địa lý (`properties`).

---

## 5. Kiểm Thử Thủ Công Trạng Thái Undo
Để kiểm chứng hoạt động của Undo:
1.  **Trong Replay Mode:**
    *   Thực hiện thêm Stage, sửa một Step, hoặc thêm hiệu ứng (Ví dụ: bấm nút "Đặt làm BG").
    *   Kiểm tra danh sách lịch sử thay đổi hiển thị ở góc dưới Sidebar bên trái (được render từ `UndoListPanel`).
    *   Bấm nút **Undo replay** để lùi lại thao tác. Quan sát dữ liệu trên dòng thời gian và bản đồ cập nhật tương ứng.
2.  **Trong Main Editor Mode:**
    *   Thực hiện vẽ một đối tượng, sửa tên thuộc tính, hoặc liên kết bài viết Wiki.
    *   Bấm nút **Undo** trên thanh công cụ của Main Editor.
    *   Quan sát đối tượng biến mất/khôi phục lại thông tin cũ thành công.

