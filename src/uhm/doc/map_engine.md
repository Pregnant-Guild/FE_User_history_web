# UHM Map engine - kiến trúc hiện tại

Map editor hiện dùng `MapLibre GL` và được ghép từ 4 lớp chính:

- `useMapInstance`
- `setupMapLayers`
- `useMapInteraction`
- `useMapSync`

Container chính là `src/uhm/components/Map.tsx`.

## 1. `useMapInstance`

Phụ trách lifecycle của đối tượng `maplibregl.Map`.

Các behavior đang có:

- khởi tạo map với `getBaseMapStyle()`
- `center: [0, 20]`, `zoom: 2`
- áp `minZoom` và `maxZoom`
- lưu projection vào `localStorage` key `uhm:mapProjection`
- cho phép chuyển giữa:
  - `mercator`
  - `globe`
- theo dõi `zoomLevel`
- thử center theo geolocation một lần khi map load xong

Nếu map init lỗi, `Map.tsx` render overlay lỗi thay vì crash im lặng.

## 2. Base style và background layers

`getBaseMapStyle()` dựng style MapLibre từ vector tile source `base`.

Background layers hiện có:

- `graticules-line`
- `land`
- `bg-countries-fill`
- `bg-country-borders-line`
- `country-labels`
- `regions-line`
- `lakes-fill`
- `rivers-line`
- `geolines-line`

Visibility của các layer này đi qua `BackgroundLayerVisibility`.

## 3. Sources mà editor đang dùng

### Preview sources

- `draw-preview`
- `draw-circle-preview`
- `draw-line-preview`
- `draw-path-preview`

Chúng chỉ dùng cho hình preview trong lúc user đang vẽ.

### Data sources

- `countries`
  - polygon + line-like features sau khi split/decorate
- `places`
  - point features
- `PATH_ARROW_SOURCE_ID`
  - shape phụ để render arrow cho path-like geometries
- `POLYGON_LABEL_SOURCE_ID`
  - label source cho polygon names

### Editing overlay

- `edit-shape`
- `edit-handles`

### Highlight/focus

- `entity-focus`

Source này dùng cho:

- highlight geometry khi cần focus
- visual emphasis khi zoom từ search/binding panel

## 4. Tách dữ liệu trước khi đẩy lên map

`useMapSync()` chịu trách nhiệm:

1. filter draft theo binding nếu `respectBindingFilter = true`
2. filter theo geometry visibility
3. split feature thành nhóm polygon/line/point
4. decorate line/polygon/point cho label rendering
5. build source riêng cho path arrows
6. set selected feature state

Điểm quan trọng:

- data mà map nhận không phải raw `draft` nguyên xi
- nó là `draft` sau khi đã qua visibility, binding filter và label decoration

## 5. Map interaction layer

`useMapInteraction()` nối editor mode với các engine.

Binding hiện tại:

- `draw` -> `initDrawing`
- `select` -> `initSelect`
- `replay` -> `initSelect`
- `add-line` -> `initLine`
- `add-path` -> `initPath`
- `add-circle` -> `initCircle`

`add-point` được init riêng bằng `initPoint`, nhưng hiện chưa được đưa vào `engineBindingsRef` như các mode còn lại; logic create point vẫn được bind trong `setupMapInteractions`.

## 6. Các engine cụ thể

### `initDrawing`

- vẽ polygon bằng chuỗi click
- preview fill + line
- hỗ trợ snap bằng `Shift` hoặc `Alt`

### `initPoint`

- tạo point bằng một click

### `initLine`

- tạo line nhiều đỉnh
- preview dashed line

### `initPath`

- giống line nhưng có path arrow layer khi preview/render

### `initCircle`

- tạo circle bằng kéo chuột
- kết quả cuối là `Polygon` có metadata circle

### `createEditingEngine`

- chỉ edit `Polygon`
- nếu polygon có `circle_center`, engine chuyển sang circle-edit mode
- hỗ trợ kéo handle và chèn thêm đỉnh bằng `Ctrl/Cmd`

## 7. Chế độ `select` và `replay`

`initSelect` hiện đóng nhiều vai trò:

- chọn geometry
- xóa geometry
- bắt đầu edit geometry
- chuyển sang `replay`

`replay` hiện không phải cinematic replay đầy đủ.
Nó là mode hiển thị tập trung vào một geometry:

- có nút thoát replay
- có toggle `Hide Outside`
- có thể ẩn geometry ngoài danh sách `binding`

## 8. Đồng bộ selection và feature state

`useMapSync()` xóa feature state cũ trên các source liên quan, sau đó set lại `selected` cho `selectedFeatureIds`.

Điều này giúp:

- selected style trên map không bị stale
- selection vẫn đúng sau mỗi lần source data đổi

## 9. Fit/focus behavior

Map có hai kiểu focus khác nhau:

- `fitToDraftBounds`
  - dùng khi muốn fit toàn bộ draft
- `focusFeatureCollection` + `focusRequestKey`
  - dùng khi zoom tới geometry cụ thể từ panel/search

Focus này đi qua `fitMapToFeatureCollection(...)`.

## 10. Geolocation

Sau khi map load:

- nếu chưa từng center theo geolocation trong session
- và không bật `fitToDraftBounds`
- và browser hỗ trợ geolocation

thì map sẽ thử `navigator.geolocation.getCurrentPosition(...)` một lần để dời tâm người dùng.

Nếu thất bại, map giữ nguyên center mặc định.

## 11. Những điều cần nhớ khi sửa map engine

- preview source/layer và persisted source/layer là hai tầng khác nhau
- `draftRef` được dùng để tránh closure stale trong event handlers
- `Map` chỉ là orchestration component; logic lớn nằm ở hooks
- geometry render pipeline phụ thuộc khá nhiều vào `mapUtils.ts`, không chỉ mỗi `useMapSync.ts`
