# Hướng Dẫn Các Hàm Hành Động Replay (Replay Actions Guide)

Tài liệu này mô tả tác dụng thực tế (hiệu ứng hiển thị trên Bản đồ và Giao diện người dùng) của các hàm hành động được sử dụng để xây dựng nội dung phát lại lịch sử (Replay).

---

## 1. Nhóm Bản Đồ & Đối Tượng (Map & Geo Actions)

Các hàm trong nhóm này trực tiếp điều khiển camera bản đồ, thay đổi cách hiển thị hoặc tạo hiệu ứng hình ảnh cho các đối tượng địa lý (Geometries).

*   **`set_camera_view` (Đặt góc nhìn camera)**
    *   *Tác dụng:* Thay đổi ngay lập tức góc nhìn của bản đồ tới một vị trí cụ thể (tọa độ trung tâm, mức độ phóng to/thu nhỏ, độ nghiêng bản đồ, hướng quay bản đồ).

*   **`set_labels_visible` (Bật/tắt nhãn bản đồ)**
    *   *Tác dụng:* Hiển thị hoặc ẩn đi các tên địa danh, địa điểm mặc định của bản đồ nền.

*   **`fly_to_geometries` (Di chuyển camera tới đối tượng)**
    *   *Tác dụng:* Tạo hiệu ứng di chuyển camera mượt mà (bay tự động) để định vị và tự động điều chỉnh khung hình ôm trọn một hoặc nhiều đối tượng địa lý được chỉ định.

*   **`set_geometry_visibility` (Bật/tắt hiển thị đối tượng)**
    *   *Tác dụng:* Ẩn đi hoặc hiện lên một hoặc nhiều đối tượng địa lý cụ thể trên bản đồ.

*   **`follow_geometries_path` (Di chuyển camera theo tuyến đường/đường đi)**
    *   *Tác dụng:* Camera sẽ tự động di chuyển bám sát theo một lộ trình vẽ sẵn (tạo bởi các đối tượng địa lý) với tốc độ và độ cao phóng to xác định. Thường dùng để mô phỏng quá trình hành quân hoặc di chuyển.

*   **`hide_others_geometries` (Ẩn tất cả các đối tượng khác)**
    *   *Tác dụng:* Chỉ giữ lại các đối tượng được chọn hiển thị trên bản đồ, đồng thời ẩn toàn bộ các đối tượng địa lý còn lại để người xem tập trung vào khu vực quan trọng.

*   **`pulse_geometry` (Tạo hiệu ứng nhấp nháy đối tượng)**
    *   *Tác dụng:* Làm cho một đối tượng địa lý nhấp nháy (tỏa ánh sáng phát quang) với màu sắc tự chọn để thu hút sự chú ý của người xem.

*   **`animate_dashed_border` (Hiệu ứng chuyển động viền nét đứt)**
    *   *Tác dụng:* Tạo hiệu ứng viền nét đứt chạy chuyển động xung quanh một đối tượng địa lý. Thường dùng để làm nổi bật biên giới hoặc các tuyến phòng thủ đang hoạt động.

*   **`set_geometry_style` (Thay đổi kiểu dáng đối tượng)**
    *   *Tác dụng:* Đổi màu sắc, độ mờ (opacity), màu viền và độ dày viền của đối tượng địa lý ngay lập tức để biểu thị sự thay đổi trạng thái (ví dụ: chuyển từ vùng kiểm soát của phe này sang phe khác).

*   **`orbit_camera_around_geometry` (Quay camera quanh đối tượng)**
    *   *Tác dụng:* Camera tự động xoay vòng tròn xung quanh một đối tượng địa lý để tạo góc nhìn toàn cảnh 3D sinh động.

*   **`set_as_background_geometries` (Đặt làm hình học nền / background)**
    *   *Tác dụng:* Đánh dấu các đối tượng được chọn làm lớp nền (Background). Các đối tượng này sẽ **luôn luôn hiển thị** và không bị ảnh hưởng (không bị ẩn) bởi bất kỳ lệnh ẩn nào khác như `hide_others_geometries` hay `set_geometry_visibility(..., false)`.

*   **`remove_from_background_geometries` (Loại bỏ khỏi hình học nền)**
    *   *Tác dụng:* Hủy trạng thái làm nền (Background) của các đối tượng được chọn, đưa chúng trở lại thành các đối tượng bình thường chịu ảnh hưởng của các lệnh ẩn/hiện khác.

---

## 2. Nhóm Giao Diện Người Dùng (UI Actions)

Các hàm điều khiển việc đóng/mở hoặc thay đổi các thành phần giao diện xung quanh bản đồ.

*   **`timeline` (Hiện/ẩn dòng thời gian)**
    *   *Tác dụng:* Hiển thị hoặc ẩn đi thanh dòng thời gian (Timeline Bar) ở phía dưới màn hình.

*   **`layer_panel` (Hiện/ẩn bảng điều khiển lớp bản đồ)**
    *   *Tác dụng:* Hiển thị hoặc ẩn đi bảng cho phép người xem chọn bật/tắt các lớp bản đồ nền hoặc các loại đối tượng.

*   **`zoom_panel` (Hiện/ẩn công cụ phóng to/thu nhỏ)**
    *   *Tác dụng:* Hiển thị hoặc ẩn đi các nút điều khiển thu phóng nhanh trên màn hình.

*   **`wiki` (Mở/đóng trang Wiki chi tiết)**
    *   *Tác dụng:* Mở bảng thông tin chi tiết (Wiki Sidebar) của một bài viết lịch sử cụ thể, hoặc đóng lại nếu không truyền tham số bài viết.

*   **`toast` (Hiển thị thông báo nhanh)**
    *   *Tác dụng:* Hiện một ô thông báo nhỏ (Toast) tự biến mất ở góc màn hình để thông báo sự kiện nhanh cho người xem.

---

## 3. Nhóm Dẫn Chuyện (Narrative Actions)

Nhóm các hàm tương tác với hộp thoại thuyết minh và tư liệu hình ảnh.

*   **`set_dialog` (Cấu hình hộp thoại thuyết minh)**
    *   *Tác dụng:*
        *   Hiển thị hoặc cập nhật nội dung văn bản trong hộp thoại thuyết minh của Replay.
        *   Hiển thị hình ảnh tư liệu lịch sử đính kèm trong hộp thoại.
        *   Ẩn hộp thoại thuyết minh hoàn toàn khi không truyền nội dung.
