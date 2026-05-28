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

## 3. Xử lý rủi ro (Trade-offs & Error Handling)
- **Error Recovery:** Nếu một Promise bị reject (do đứt mạng, server lỗi), đoạn code tạo Promise con bắt buộc phải có khối `.catch()`. Trong khối này, ID lỗi **phải bị xóa khỏi Cache**. Nếu không xóa, UI sẽ vĩnh viễn tin rằng ID đó đã được xử lý xong và không bao giờ gọi lại (Deadlock).
- **Memory Footprint:** Cache được lưu ở biến Global (`Map` hoặc `Record`). Nó sẽ tồn tại suốt phiên người dùng. Kích thước JSON là rất nhỏ, nên dung lượng RAM tăng lên không đáng kể. 

## 4. Mã giả (Pseudocode)

```typescript
const promiseCache: Record<string, Promise<any>> = {};

async function fetchCached(ids: string[]) {
    const missingIds = ids.filter(id => !promiseCache[id]);
    
    if (missingIds.length > 0) {
        // 1. Tạo request cha
        const batchPromise = fetchFromServer(missingIds);
        
        // 2. Chia nhỏ thành request con và lưu cache
        for (const id of missingIds) {
            promiseCache[id] = batchPromise
                .then(res => res[id])
                .catch(err => {
                    delete promiseCache[id]; // QUAN TRỌNG: Xóa cache nếu lỗi
                    throw err;
                });
        }
    }
    
    // 3. Chờ tất cả Promise hoàn thành (kể cả cũ lẫn mới)
    const results = await Promise.all(ids.map(id => promiseCache[id]));
    return mergeResults(results);
}
```
