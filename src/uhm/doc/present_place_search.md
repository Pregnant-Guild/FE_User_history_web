# Preview Place Search

Cập nhật: 2026-05-26.

Tính năng này cho phép người dùng search trong preview mode theo 2 chế độ:

- `Present`: search địa điểm hiện tại bằng Goong Place API.
- `History`: search entity lịch sử bằng API domain, sau đó dùng Goong reverse geocode để đặt nhãn hành chính hiện tại cho từng geometry candidate khi cần.

Đây là UI điều hướng tạm thời, không chỉnh sửa draft và không đi vào commit snapshot.

## Phạm vi

- Chỉ hiển thị trong preview mode:
  - `preview`
  - `replay_preview`
- Không hiển thị trong editor mode thường hoặc replay edit mode.
- Không tạo geometry, entity, wiki, replay, hay undo action.
- Khi thoát preview, state focus search được dọn khỏi UI.

## File liên quan

- `next.config.ts`
  - Expose tạm `SEARCH_MAP_API_KEY` cho browser qua `env`.
- `src/uhm/api/goongPlaces.ts`
  - Gọi Goong Place Autocomplete, Detail, và Geocode reverse.
  - Chuẩn hóa response thành type nội bộ.
- `src/uhm/components/editor/PresentPlaceSearch.tsx`
  - UI search/autocomplete với switch `Present` / `History`.
  - Debounce request.
  - Chọn kết quả và gọi callback focus.
- `src/uhm/api/geometries.ts`
  - Gọi `/geometries/entity` cho search entity lịch sử.
- `src/uhm/components/map/mapUtils.ts`
  - `getGeometryRepresentativePoint(...)` dùng polylabel cho polygon, midpoint cho line, và tọa độ thật cho point.
- `src/app/editor/[id]/page.tsx`
  - Gắn UI vào preview overlay.
  - Gọi `map.flyTo(...)` tới tọa độ địa điểm.

## Cấu hình

Hiện tại API key được đọc từ `.env.local`:

```env
SEARCH_MAP_API_KEY=...
```

Do đang dùng trực tiếp trên frontend, `next.config.ts` expose biến này:

```ts
env: {
  SEARCH_MAP_API_KEY: process.env.SEARCH_MAP_API_KEY,
}
```

Sau khi thêm hoặc đổi key trong `.env.local`, phải restart Next dev server để value được bundle lại vào client.

## Luồng Present

1. User vào preview mode.
2. `PresentPlaceSearch` xuất hiện ở góc phải phía trên, ngang hàng với thanh zoom/map controls.
3. User để switch ở `Present` và nhập ít nhất 2 ký tự.
4. UI debounce khoảng 260ms rồi gọi:

```txt
GET https://rsapi.goong.io/Place/AutoComplete
```

5. User chọn một prediction.
6. FE gọi:

```txt
GET https://rsapi.goong.io/Place/Detail
```

7. Response detail được chuẩn hóa thành:

```ts
type PresentPlaceSelection = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};
```

8. Editor page:
   - gọi `map.flyTo({ center: [lng, lat], zoom: Math.max(currentZoom, 13.5) })`,
   - lưu `focusedPresentPlace` để clear trạng thái focus khi cần.

## Luồng History

1. User bấm switch `Present` để đổi sang `History`.
2. User nhập tên entity lịch sử.
3. UI debounce khoảng 260ms rồi gọi API domain:

```txt
GET /geometries/entity?name=...&limit=12
```

4. Nếu entity có đúng 1 geometry:
   - focus luôn geometry đó.
5. Nếu entity có nhiều geometry:
   - mở danh sách geometry phụ.
   - với mỗi geometry, FE tính representative point:
     - `Polygon/MultiPolygon`: dùng `polylabel`.
     - `LineString/MultiLineString`: dùng midpoint theo chiều dài line.
     - `Point/MultiPoint`: dùng tọa độ point hoặc trung bình các point.
   - gọi Goong reverse geocode:

```txt
GET https://rsapi.goong.io/Geocode?latlng=<lat>,<lng>&api_key=...
```

   - hiển thị nhãn hành chính hiện tại gần geometry đó.
6. Khi user chọn geometry:
   - focus map vào bbox geometry bằng `fitMapToFeatureCollection`.
   - nếu timeline filter đang bật và geometry có `time_start`, kéo preview timeline tới `time_start`.
   - nếu geometry đó đang được render trên map, set selection cho geometry id tương ứng.

## UI behavior

- Thanh search nằm bên phải trên map preview.
- Nhãn `Present` / `History` trong hàng input là switch mode; không có cụm tab riêng phía trên.
- Khi replay preview đang mở wiki sidebar, search nhận `rightOffset = previewSidebarWidth + 48` để né sidebar.
- `Escape` đóng dropdown.
- `Enter` chọn kết quả đầu tiên nếu có.
- Nút `x` clear query hiện tại và clear focus search.
- Kết quả hiển thị dạng panel gọn, không dùng scrollbar nội bộ.
- Focus search chỉ di chuyển camera/select geometry; không vẽ marker/dấu chấm tạm trên map.

## State và undo

State bị đổi:

- `focusedPresentPlace`
- local state trong `PresentPlaceSearch`: query, results, loading, error
- local state của mode History: query, entity results, expanded entity, admin labels

Không đổi:

- `editor.mainDraft`
- `editor.replayDraft`
- `snapshotEntityRows`
- `snapshotWikis`
- `snapshotEntityWikiLinks`
- `replays`
- `selectedFeatureIds`

Do đó không cần undo action.

## Error handling

- Nếu thiếu `SEARCH_MAP_API_KEY`, input bị disable và hiển thị lỗi cấu hình.
- Nếu Goong trả response không hợp lệ hoặc không có tọa độ, UI hiển thị lỗi trong dropdown hoặc fallback label cho geometry.
- Request autocomplete được abort khi query đổi hoặc component unmount.
- Response cũ bị bỏ qua bằng sequence ref để tránh race khi user gõ nhanh.

## Giới hạn hiện tại

- API key đang expose trên browser. Đây chỉ là giải pháp tạm.
- Chưa có cache bền vững cho autocomplete/detail/reverse geocode.
- Chưa giới hạn theo quốc gia/khu vực.
- Chưa có keyboard navigation bằng mũi tên trong dropdown.
- History reverse geocode đang chạy trên browser theo từng geometry candidate khi mở entity nhiều geometry.

## Kế hoạch chuyển sang proxy BE

Khi backend có proxy, bỏ expose key khỏi `next.config.ts` và đổi `src/uhm/api/goongPlaces.ts` sang gọi endpoint nội bộ, ví dụ:

```txt
GET /api/map-search/place-autocomplete?input=...
GET /api/map-search/place-detail?place_id=...
GET /api/map-search/reverse-geocode?lat=...&lng=...
```

Backend giữ `SEARCH_MAP_API_KEY` ở server env và gọi Goong thay frontend. Response nên giữ shape tương thích với `PresentPlacePrediction`, `PresentPlaceSelection`, và reverse geocode label để không phải sửa UI.

Tham khảo thêm:

- `src/uhm/doc/goong_proxy_backend_guide.md`
- `src/uhm/doc/goong_apis_in_use.md`
