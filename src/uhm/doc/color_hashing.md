# Thuật toán Băm Màu sắc từ ID (Color Hashing Algorithm)

Tài liệu này mô tả chi tiết giải thuật băm chuỗi định danh (ID) thành mã màu sắc HSL trong ứng dụng bản đồ lịch sử, nhằm giải quyết vấn đề trùng lặp màu sắc hiển thị giữa các thực thể/hình học.

---

## 1. Vấn đề thực tế (Problem Statement)
Trong các phiên bản trước, hàm băm chuỗi thành màu sử dụng giải thuật cộng dồn mã ký tự đơn giản:
$$\text{hash} = \sum \text{char} + ((\text{hash} \ll 5) - \text{hash})$$
Với độ bão hòa (Saturation) và độ sáng (Lightness) cố định ở mức `70%` và `50%`.

Cách tiếp cận này gặp phải điểm yếu nghiêm trọng khi xử lý **định danh tuần tự** (sequential IDs) hoặc các chuỗi ID gần giống nhau (ví dụ: các ID tự tăng như `1`, `2`, `3` hoặc các UUID chỉ khác nhau ký tự cuối):
* Giải thuật băm cũ sinh ra các giá trị băm liên tiếp nhau (ví dụ: `1001`, `1002`, `1003`).
* Khi chia lấy dư cho $360$ để tìm góc màu Hue, kết quả cho ra các góc màu liền kề (ví dụ: $201^\circ$, $202^\circ$, $203^\circ$).
* Đối với mắt người, các góc màu quá sát nhau này hoàn toàn không thể phân biệt được, dẫn đến việc các quốc gia/vùng lãnh thổ/tuyến đường cạnh nhau bị hiển thị trùng một màu, gây hiểu nhầm dữ liệu lịch sử.

---

## 2. Giải pháp & Thuật toán Nâng cấp (Proposed Solution)

Để giải quyết triệt để vấn đề này, thuật toán mới đã được cải tiến thông qua hai kỹ thuật chính:

### A. Phân tán giá trị băm của Knuth (Knuth's Multiplicative Hashing)
Sau bước băm ký tự ban đầu bằng DJB2 nâng cao (sử dụng XOR), giá trị băm sẽ được nhân với hằng số vàng của Knuth:
$$A = 2654435761 \quad (\approx 2^{32} \times \frac{\sqrt{5} - 1}{2})$$
Hằng số này hoạt động như một bộ xáo trộn bit (bit mixer). Hai giá trị băm ban đầu đứng cạnh nhau sau khi nhân với $2654435761$ và lấy trị tuyệt đối sẽ được phân tán đều khắp không gian số nguyên 32-bit. Điều này đảm bảo góc màu Hue giữa hai ID kề nhau sẽ có độ tương phản cực kỳ cao (ví dụ: góc màu lệch nhau từ $30^\circ$ tới $180^\circ$).

### B. Biến thiên Độ bão hòa (Saturation) và Độ sáng (Lightness)
Thay vì cố định cứng $S = 70\%$ và $L = 50\%$, hai tham số này cũng được tính toán động từ giá trị băm phân tán:
* **Saturation ($S$):** Dao động ngẫu nhiên trong khoảng $[70\%, 90\%]$.
* **Lightness ($L$):** Dao động ngẫu nhiên trong khoảng $[45\%, 60\%]$.

Điều này giúp mở rộng không gian màu từ 1 chiều (chỉ thay đổi Hue) lên 3 chiều (thay đổi cả Hue, Saturation và Lightness), tạo ra hàng ngàn biến thể màu sắc độc nhất.

---

## 3. Mã Nguồn Triển khai (Implementation Code)

Hàm băm được đặt tại [mapUtils.ts](../components/map/mapUtils.ts):

```typescript
export function hashStringToColor(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    // Sử dụng hằng số nhân của Knuth để phân tán các mã băm kề nhau
    const scattered = Math.abs(hash * 2654435761);
    const hue = scattered % 360;
    
    // Tự động biến thiên nhẹ độ bão hòa và độ sáng để tăng độ đa dạng màu
    const saturation = 70 + (scattered % 20); // 70% đến 90%
    const lightness = 45 + ((scattered >> 5) % 15); // 45% đến 60%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
```

---

## 4. Ứng dụng trong Bản đồ (Map Application Context)

Hàm này được gọi tự động trong bộ lọc dữ liệu địa lý nhằm gán màu sắc trực quan cho các hình học không có màu chỉ định sẵn:
* **Tuyến đường (Lines):** Gộp các `entity_ids` thành một chuỗi duy nhất, sắp xếp theo thứ tự bảng chữ cái để đảm bảo tính nhất quán, sau đó băm thành màu sắc của tuyến đường.
* **Lãnh thổ/Vùng (Polygons):** Băm trực tiếp từ `geometry_id` của bản vẽ nháp hoặc thực thể để mỗi quốc gia/lãnh thổ có một màu sắc ranh giới trực quan riêng biệt.

---

## 5. Ưu điểm nổi bật (Key Benefits)
1. **Độ tương phản cao (High Contrast):** Các thực thể có ID tuần tự nằm cạnh nhau trên bản đồ luôn hiển thị màu sắc tương phản rõ rệt.
2. **Nhất quán (Deterministic):** Cùng một ID chuỗi đầu vào sẽ luôn trả về chính xác một mã màu duy nhất ở mọi thời điểm tải trang.
3. **Thẩm mỹ hiện đại (Modern Aesthetics):** Giới hạn độ sáng trong khoảng $45\% - 60\%$ giúp giữ cho màu sắc luôn rực rỡ (neon-like), không bị quá tối ẩn vào nền bản đồ, cũng không bị quá sáng làm mất đi tính thẩm mỹ của giao diện tối (dark theme).
