# UHM Editor - Tài liệu tham chiếu thuật toán Toán học & Hình học

Tài liệu này hệ thống hóa toàn bộ các công thức toán học, thuật toán hình học không gian (Geospatial) và thuật toán đồ thị được áp dụng trong công cụ chỉnh sửa bản đồ của **Ultimate History Map (UHM)**.

---

## 1. Công thức khoảng cách Haversine (`distanceMeters`)

Để tính toán khoảng cách thực tế giữa hai tọa độ Địa lý $(lng_1, lat_1)$ và $(lng_2, lat_2)$ trên bề mặt cong của Trái Đất (mô hình cầu), hệ thống sử dụng công thức Haversine.

### Công thức toán học
Cho bán kính trung bình của Trái Đất $R = 6,378,137\text{ m}$. Chuyển đổi tọa độ từ độ (degrees) sang radian (radians):
$$\Delta lat = (lat_2 - lat_1) \times \frac{\pi}{180}$$
$$\Delta lng = (lng_2 - lng_1) \times \frac{\pi}{180}$$

Đại lượng trung gian $a$:
$$a = \sin^2\left(\frac{\Delta lat}{2}\right) + \cos(lat_1 \times \frac{\pi}{180}) \times \cos(lat_2 \times \frac{\pi}{180}) \times \sin^2\left(\frac{\Delta lng}{2}\right)$$

Khoảng cách góc $c$:
$$c = 2 \times \operatorname{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$

Khoảng cách thực tế $d$ (mét):
$$d = R \times c$$

---

## 2. Chiếu điểm lên đoạn thẳng & Snap hình học (`snapToNearestGeometry`)

Khi di chuyển hoặc kéo đỉnh, hệ thống chiếu tọa độ chuột hiện tại lên các cạnh của đa giác hoặc đường thẳng để tìm điểm bám (snap) gần nhất.

### Chiếu Vector tuyến tính
Xét một đoạn thẳng nối từ điểm $A(x_A, y_A)$ đến điểm $B(x_B, y_B)$ và điểm chuột hiện tại là $P(x_P, y_P)$.
Ta định nghĩa các vector:
$$\vec{AB} = B - A = (x_B - x_A, y_B - y_A)$$
$$\vec{AP} = P - A = (x_P - x_A, y_P - y_A)$$

Hình chiếu vuông góc của $P$ lên đường thẳng chứa $AB$ được xác định bởi tham số tỉ lệ $t$:
$$t = \frac{\vec{AP} \cdot \vec{AB}}{\|\vec{AB}\|^2} = \frac{(x_P - x_A)(x_B - x_A) + (y_P - y_A)(y_B - y_A)}{(x_B - x_A)^2 + (y_B - y_A)^2}$$

Để giới hạn điểm chiếu nằm trực tiếp **trong lòng đoạn thẳng** $AB$, ta ràng buộc tham số $t$ về đoạn $[0, 1]$:
$$t_{\text{clamped}} = \max(0, \min(1, t))$$

Tọa độ điểm chiếu gần nhất $P_{\text{projected}}$:
$$P_{\text{projected}} = A + t_{\text{clamped}} \times \vec{AB}$$

### Ngưỡng Snap (Tolerance)
Hệ thống chuyển đổi khoảng cách từ điểm chiếu đến con trỏ chuột sang đơn vị pixel màn hình. Nếu khoảng cách hình chiếu nhỏ hơn ngưỡng sai số cho phép (ví dụ: $8\text{px}$ hoặc $1\text{m}$ thực tế), con trỏ sẽ tự động bị hút vào điểm $P_{\text{projected}}$ đó.

---

## 3. Tạo hình tròn đa giác (`buildCircleRing`)

Vì các chuẩn dữ liệu GeoJSON không hỗ trợ kiểu dữ liệu `Circle` nguyên bản, hệ thống chuyển đổi hình tròn có tâm $C(lng_C, lat_C)$ và bán kính $r$ (mét) thành một đa giác khép kín (`Polygon`) gồm 64 đỉnh.

### Công thức lượng giác trên mặt cầu
Với mỗi góc $\theta$ chạy từ $0^{\circ}$ đến $360^{\circ}$ (chia thành 64 phân đoạn, mỗi bước $\Delta\theta = \frac{2\pi}{64}$ radians):

1. Tính bán kính góc $d = \frac{r}{R}$ (với $R$ là bán kính Trái Đất).
2. Tọa độ vĩ độ mới ($lat_{\theta}$):
   $$lat_{\theta} = \arcsin\left(\sin(lat_C) \cos(d) + \cos(lat_C) \sin(d) \cos(\theta)\right)$$
3. Tọa độ kinh độ mới ($lng_{\theta}$):
   $$lng_{\theta} = lng_C + \operatorname{atan2}\left(\sin(\theta) \sin(d) \cos(lat_C), \cos(d) - \sin(lat_C) \sin(lat_{\theta})\right)$$

Tập hợp 64 tọa độ $(lng_{\theta}, lat_{\theta})$ tạo thành vòng khép kín mô tả chính xác biên hình tròn trên bản đồ.

---

## 4. Kiểm tra vòng khép kín sai số cao (`isClosed`)

Trong tính toán đồ thị địa lý, do sai số dấu phẩy động (floating-point precision) tích lũy trong quá trình tính toán của trình duyệt, tọa độ điểm đầu và điểm cuối của Polygon có thể lệch nhau một lượng cực nhỏ.

Hệ thống áp dụng sai số tuyệt đối $\epsilon = 10^{-9}$ để kiểm tra tính khép kín:
$$\Delta lng = |lng_{\text{start}} - lng_{\text{end}}|$$
$$\Delta lat = |lat_{\text{start}} - lat_{\text{end}}|$$
$$\text{isClosed} = (\Delta lng < 10^{-9}) \land (\Delta lat < 10^{-9})$$

Điều này ngăn chặn việc hệ thống phân loại nhầm Polygon khép kín thành LineString hở.

---

## 5. Khâu nối và làm sạch đường biên (`stitchRing` & `cleanRing`)

Khi bám dọc biên (Trace) từ một đỉnh vẽ tiếp, hệ thống tiến hành cắt và ghép 3 mảng tọa độ:
1. `prefix`: Các điểm trước điểm bắt đầu trace.
2. `activeDrawn`: Các điểm thu được từ đường đi trace.
3. `suffix`: Các điểm sau điểm kết thúc trace.

Do quá trình ghép nối trực tiếp tại các ranh giới khâu (join points) dễ sinh ra các điểm trùng lặp gần nhau (sai số nhỏ), hàm `cleanRing` sẽ duyệt qua mảng kết quả và loại bỏ các điểm trùng kế tiếp nếu khoảng cách giữa chúng bé hơn $\epsilon = 10^{-9}$:

$$\text{duplicate} = (|lng_i - lng_{i-1}| < 10^{-9}) \land (|lat_i - lat_{i-1}| < 10^{-9})$$

---

## 6. Định hướng Đông - Tây / Trái - Phải (`isToTheRight`)

Để xác định một đỉnh nằm bên trái hay bên phải đỉnh khác khi vẽ tiếp mà không phụ thuộc vào thứ tự chỉ mục ban đầu (vốn không trực quan cho người dùng):

$$\text{isToTheRight}(A, B) = \begin{cases} 
lng_A > lng_B, & \text{nếu } lng_A \neq lng_B \\
lat_A < lat_B, & \text{nếu } lng_A = lng_B 
\end{cases}$$

Quy ước này giúp người dùng dễ dàng định hình hướng đi (bên phải tương đương với đi về phía Đông hoặc đi xuống phía Nam nếu trùng kinh độ).

---

## 7. Giải thuật chọn cung xóa của Polygon trong Range Delete

Khi xóa một khoảng đỉnh trên đa giác khép kín giữa 2 đỉnh chỉ mục $i_{\text{start}}$ và $i_{\text{hover}}$, đa giác luôn bị chia làm hai cung đường đi thay thế:

* **Đường đi A (Thuận chiều kim đồng hồ):** 
  $$P_A = \{ (i_{\text{start}} + 1) \bmod N, \dots, i_{\text{hover}} - 1 \bmod N \}$$
* **Đường đi B (Ngược chiều kim đồng hồ):** 
  $$P_B = \{ (i_{\text{start}} - 1 + N) \bmod N, \dots, i_{\text{hover}} + 1 \bmod N \}$$

### Khoảng cách hình chiếu Pixel (Smart Decision)
Để tự động chọn cung đường người dùng muốn xóa:
1. Xác định tọa độ trung điểm hình học của từng cung đường đi.
   * Nếu cung đường trống (xóa trực tiếp giữa 2 đỉnh kề nhau), trung điểm là trung điểm của đoạn thẳng nối 2 đỉnh neo:
     $$M = \left(\frac{lng_{\text{start}} + lng_{\text{hover}}}{2}, \frac{lat_{\text{start}} + lat_{\text{hover}}}{2}\right)$$
   * Nếu cung có chứa các đỉnh trung gian, lấy tọa độ của đỉnh nằm chính giữa mảng chỉ mục đó.
2. Chiếu tọa độ trung điểm của $P_A$ và $P_B$ lên hệ tọa độ pixel của màn hình thiết bị thông qua phép chiếu MapLibre (`map.project`):
   $$M_{\text{pixel}, A} = \text{project}(M_A)$$
   $$M_{\text{pixel}, B} = \text{project}(M_B)$$
3. Đo khoảng cách Euclid từ vị trí con trỏ chuột hiện tại $Cursor(x, y)$ đến hai hình chiếu trung điểm:
   $$d_A = \sqrt{(x - x_{M, A})^2 + (y - y_{M, A})^2}$$
   $$d_B = \sqrt{(x - x_{M, B})^2 + (y - y_{M, B})^2}$$

Cung đường nào có khoảng cách ngắn hơn ($d \le$ đối thủ) sẽ tự động được bôi đỏ để chuẩn bị xóa.

### Ghi đè bằng phím Alt (Alt Key Override)
Nếu người dùng nhấn giữ phím **Alt**, hệ thống lập tức phủ quyết kết quả so sánh khoảng cách và chọn cung đường ngược lại:
$$\text{DeleteRange} = \begin{cases}
P_B, & \text{nếu } (d_A \le d_B \land \text{AltPressed}) \lor (d_A > d_B \land \neg\text{AltPressed}) \\
P_A, & \text{nếu } (d_A \le d_B \land \neg\text{AltPressed}) \lor (d_A > d_B \land \text{AltPressed})
\end{cases}$$
