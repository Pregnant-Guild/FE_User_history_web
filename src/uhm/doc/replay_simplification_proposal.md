# Đề xuất tối giản hóa các hàm kịch bản trong Replay (Đã cập nhật theo phản hồi)

Dưới đây là phương án tối giản hóa tối đa các hàm kịch bản Replay (Replay Actions) sau khi thống nhất theo các ý kiến phản hồi của bạn.

Tổng số hàm ban đầu: **41 hàm**
Tổng số hàm sau tối giản: **16 hàm** (Giảm **61%** độ phức tạp của API)

---

## 1. Nhóm UI Actions (Còn 5 hàm)
* **Quyết định**: Loại bỏ `playback_speed` khỏi kịch bản (tốc độ phát sẽ do người dùng tự điều khiển hoàn toàn trên giao diện Player). Loại bỏ `close_wiki_panel` và `wiki_panel`, hợp nhất vào `wiki`.

| Hàm đề xuất | Tham số đề xuất (`params`) | Mô tả chi tiết |
| :--- | :--- | :--- |
| **`timeline`** | `[visible: boolean]` | Ẩn hoặc hiển thị TimelineBar. |
| **`layer_panel`** | `[visible: boolean]` | Ẩn hoặc hiển thị Panel quản lý Layer. |
| **`zoom_panel`** | `[visible: boolean]` | Ẩn hoặc hiển thị các cụm zoom/projection trên bản đồ. |
| **`wiki`** | `[wiki_id: string \| null]` | Nhận `wiki_id` để mở wiki panel. Nhận `null` hoặc `""` để đóng panel và xóa wiki đang chọn. |
| **`toast`** | `[message: string]` | Hiện thông báo nhanh (toast) trên màn hình. |

---

## 2. Nhóm Map Actions (Còn 3 hàm)
* **Quyết định**: Loại bỏ `set_time_filter` (hệ thống sẽ tự động cập nhật bộ lọc thời gian dựa trên `detail_time_start` và `detail_time_stop` khai báo ở mỗi Stage/Step). Loại bỏ `reset_camera_north` (dùng `set_camera_view` với `bearing: 0`).

| Hàm đề xuất | Tham số đề xuất (`params`) | Mô tả chi tiết |
| :--- | :--- | :--- |
| **`set_camera_view`** | `[state: ReplayCameraViewStateDoc]` | Cập nhật vị trí camera (center, zoom, pitch, bearing). Để reset hướng Bắc, chỉ cần truyền `{ bearing: 0 }`. |
| **`set_timeline_filter`** | `[enabled: boolean]` | Bật hoặc tắt bộ lọc dữ liệu theo dòng thời gian (thay cho `enable_timeline_filter` / `disable_timeline_filter`). |
| **`set_labels_visible`** | `[visible: boolean]` | Ẩn hoặc hiện toàn bộ text label mặc định trên bản đồ (thành phố, quốc gia...). |

---

## 3. Nhóm Geo Actions (Còn 7 hàm)
* **Quyết định**:
  - Gộp `fly_to_geometry`, `fly_to_geometries` và `fit_to_geometries` thành `fly_to_geometries`.
  - Gộp `show_geometries` và `hide_geometries` thành `set_geometry_visibility`.
  - Gộp `follow_geometry_path` vào `follow_geometries_path`.
  - Loại bỏ hoàn toàn `show_geometry_label` (đã có thuộc tính `point_label/line_label` hiển thị tự động trên bản đồ dựa theo cấu hình của geometry).
  - Tạm khóa các visual effects phức tạp (`pulse_geometry`, `animate_dashed_border`, `set_geometry_style`) trên giao diện UI soạn thảo để giảm độ phức tạp ở giai đoạn đầu, nhưng vẫn giữ khai báo trong schema để mở rộng sau này.
  - Tên gọi `dim_other_geometries` được giữ nguyên hoặc đổi tên thành `hide_others_geometries` tùy ý (hiện tại trong code runtime đang là `dim_other_geometries`, nếu cần ta sẽ map lại).

| Hàm đề xuất | Tham số đề xuất (`params`) | Trạng thái phát triển |
| :--- | :--- | :--- |
| **`fly_to_geometries`** | `[geometry_ids: string[], duration?: number]` | Hoạt động |
| **`set_geometry_visibility`** | `[geometry_ids: string[], visible: boolean]` | Hoạt động |
| **`follow_geometries_path`** | `[geometry_ids: string[], duration?, zoom?, pitch?]` | Hoạt động |
| **`dim_other_geometries`** | `[geometry_ids: string[]]` | Hoạt động |
| **`pulse_geometry`** | `[geometry_id: string, color?, repeat?, duration?]` | *Khóa tạm thời trên UI* |
| **`animate_dashed_border`** | `[geometry_id: string, color?, width?, speed?, duration?]` | *Khóa tạm thời trên UI* |
| **`set_geometry_style`** | `[geometry_ids: string[], fill?, opacity?, stroke?, width?]` | *Khóa tạm thời trên UI* |
| **`orbit_camera_around_geometry`** | `[geometry_id: string, zoom?, pitch?, turns?, duration?]` | *Khóa tạm thời trên UI* |

---

## 4. Nhóm Narrative Actions (Còn đúng 1 hàm duy nhất!)
* **Quyết định**:
  - Loại bỏ hoàn toàn `set_title`, `set_descriptions`, `set_step_subtitle` (và các hàm `clear_*` tương ứng) vì thông tin Stage/Step đã được hiển thị qua tiêu đề Stage có sẵn. Mô tả chi tiết giờ đây được dồn hoàn toàn vào hộp thoại dẫn chuyện (`dialog`).
  - Loại bỏ `display_historical_image` và đưa trường `image_url`, `image_caption` làm tham số tùy chọn bên trong `dialog` để hiển thị ảnh đi kèm cuộc hội thoại một cách nhất quán nhất.
  - Loại bỏ tham số `side` (mặc định hiển thị cố định ở phía dưới cùng màn hình) và `speaker` (dùng chung avatar/tên trong thiết kế hội thoại tinh gọn).

### Hàm duy nhất được giữ lại:
| Hàm đề xuất | Tham số đề xuất (`params`) |
| :--- | :--- |
| **`set_dialog`** | `[dialog: DialogState \| null]` |

Trong đó đối tượng `DialogState` được định nghĩa tinh giản gồm:
```typescript
export type DialogState = {
    avatar: string;        // URL ảnh đại diện nhân vật dẫn chuyện
    text: string;          // Nội dung lời dẫn/hội thoại
    image_url?: string;    // (Tùy chọn) Ảnh lịch sử đi kèm hiển thị trong dialog
    image_caption?: string;// (Tùy chọn) Chú thích cho ảnh
};
```
Khi muốn ẩn dialog, chỉ cần truyền `null` (ví dụ: `{ function_name: "set_dialog", params: [null] }`).

---

## Ý kiến chốt phương án của bạn:
> *Hãy phản hồi ở đây nếu bạn muốn tiến hành refactor code theo thiết kế này.*
tôi đồng ý làm theo thiết kế này, tuy nhiên tôi muốn đổi dim_other_geometries thanh hide_others_geometries
> 
