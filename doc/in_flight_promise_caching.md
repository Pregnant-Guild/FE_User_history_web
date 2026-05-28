# Data Fetching Optimization: In-flight Promise Caching

## 1. Vấn đề (The Problem)
Trong quá trình tương tác với bản đồ (ví dụ: kéo thả nhanh từ khu vực A sang B rồi sang C), các tính năng lấy dữ liệu quan hệ (entities, wikis) thường phải tải hàng chục đến hàng trăm item thông qua mảng ID (`geometryIds`).

Nếu chỉ sử dụng cơ chế Cache Data tĩnh (lưu kết quả sau khi API trả về), ta sẽ gặp phải bài toán **Race Condition** với các request đang bay (In-flight requests):
- **A -> B**: Hệ thống gọi API xin 5 ID mới. Request mất 500ms để hoàn thành.
- **B -> C** (xảy ra ở mốc 200ms): Lúc này request của B chưa xong, Cache tĩnh chưa có dữ liệu của 5 ID đó.
- Hệ thống gửi tiếp API xin 10 ID mới (bao gồm 5 ID của C và **5 ID của B**).
=> Hậu quả: Lãng phí băng thông, tải lại dữ liệu dư thừa.

## 2. Giải pháp (The Solution: DataLoader Pattern)
Để khắc phục triệt để, hệ thống sử dụng **In-flight Promise Caching** tại tầng API (`src/uhm/api/relations.ts`). Thay vì chỉ lưu trữ Data, hệ thống lưu trữ **Tiến trình (Promise)**.

### Cơ chế hoạt động:
1. **Kiểm tra Cache:** Khi nhận mảng `ids` cần tải, hệ thống kiểm tra xem ID nào đã có Promise tương ứng trong Cache (nghĩa là đang được tải hoặc đã tải xong).
2. **Lọc Missing IDs:** Chỉ những ID chưa có Promise trong Cache mới được đưa vào mảng `missingIds` để gọi API.
3. **Tạo Batch Promise:** Một HTTP Request duy nhất được gửi đi để tải `missingIds`. (Trả về `batchPromise`).
4. **Chia tách Promise (Demultiplexing):** Với mỗi ID trong `missingIds`, hệ thống gán cho nó một Promise con (tách ra từ `batchPromise` cha) có nhiệm vụ chỉ extract dữ liệu của riêng ID đó. Các Promise con này lập tức được lưu vào Cache.
5. **Đợi kết quả:** Hàm gọi `await Promise.all()` để chờ tất cả các Promise của `ids` yêu cầu hoàn thành và trả về.

## 3. Các "Hố Tử Thần" (Edge Cases) & Cách Xử Lý (Production-Ready)

Khi triển khai Promise Caching, có 3 rủi ro cực kỳ lớn cần phải xử lý để hệ thống không bị crash hoặc dính lỗi logic:

### 3.1. Hiệu ứng Domino của `Promise.all` (Sập cả Viewport)
**Rủi ro:** Nếu một ID trong mảng bị lỗi mạng (`throw err`), `Promise.all` sẽ ngắt mạch (short-circuit) và vứt bỏ toàn bộ kết quả của các ID khác, khiến bản đồ trắng xóa.
**Cách xử lý:** Trong khối `.catch()` của từng Promise con, tuyệt đối không được `throw err`. Thay vào đó, **phải trả về một giá trị an toàn (ví dụ mảng rỗng `[]`)** để cứu các Promise còn lại.
```typescript
.catch(err => {
    delete promiseCache[id]; // Xóa khỏi cache để lần sau thử lại
    return []; // Trả về fallback thay vì ném lỗi
})
```

### 3.2. Nhiễm độc Cache vĩnh viễn (Zombie Cache) & Negative Cache
**Rủi ro:** Nếu API trả về HTTP 200, nhưng một `geometryId` không hề có dữ liệu (thực tế rất nhiều vùng biển không có thực thể), biến `res[id]` sẽ là `undefined`. Nếu ta xóa Cache đi vì tưởng là lỗi, lần sau kéo lại, hệ thống sẽ tiếp tục gọi API xin dữ liệu của vùng biển đó => Spam API vô tận.
**Cách xử lý (Negative Cache):** Ép giá trị `undefined` thành `[]` và **VẪN LƯU VÀO CACHE**. Bằng cách này, hệ thống "nhớ" rằng vị trí này trống rỗng và sẽ không bao giờ tốn công gọi API lên Domain nữa.
```typescript
.then(res => res[id] || []) // Lưu hẳn mảng rỗng vào Cache
```

### 3.3. Vấn đề Gom cụm (Scope Batching)
**Rủi ro:** Nếu hệ thống kích hoạt API lẻ tẻ cách nhau vài mili-giây, code sẽ không gom (batch) được request lại với nhau.
**Đặc thù dự án:** May mắn là UI Hook (`usePublicPreviewData`) đã thu thập đủ toàn bộ các Geometries trên bản đồ thành 1 mảng tĩnh duy nhất trước khi gọi xuống hàm API. Do đó, mảng `ids` truyền vào bản thân nó đã là một Batch hoàn chỉnh, không cần phải dùng đến Event Loop Tick (`setTimeout(0)`) để gom cụm như thư viện DataLoader nguyên gốc.

## 4. Mã nguồn chuẩn Production (Tham khảo)

```typescript
const entitiesPromiseCache: Record<string, Promise<Entity[]>> = {};

export async function fetchEntitiesByGeometryIds(ids: string[]): Promise<Record<string, Entity[]>> {
    const uniqueIds = uniqueStrings(ids);
    const missingIds = uniqueIds.filter(id => !entitiesPromiseCache[id]);

    if (missingIds.length > 0) {
        // 1. Tạo request cha
        const batchPromise = fetchFromServer(missingIds);

        // 2. Chia nhỏ thành request con và lưu cache
        for (const id of missingIds) {
            entitiesPromiseCache[id] = batchPromise
                .then(res => res[id] || []) // Negative Cache: Ép mảng rỗng
                .catch(err => {
                    delete entitiesPromiseCache[id]; // Xóa cache lỗi
                    return []; // Chặn Domino Effect của Promise.all
                });
        }
    }

    const result: Record<string, Entity[]> = {};
    // 3. Đợi toàn bộ hoàn thành an toàn
    await Promise.all(uniqueIds.map(async id => {
        result[id] = await entitiesPromiseCache[id]; 
    }));
    return result;
}
```
