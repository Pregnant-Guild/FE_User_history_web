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

`getBaseMapStyle()` chỉ dựng skeleton style MapLibre:

- `glyphs` trỏ vào Goong glyph proxy
- `sources: {}`
- một layer `background` màu nền tối

Background thật được thêm sau khi map load:

- `raster-base-layer` được lazy-add từ `goong_satellite.json` qua proxy khi visibility bật.
- overlay vector từ `goong_map_web.json` được clone theo nhóm:
  - `bg-country-borders-line`
  - `bg-province-borders-line`
  - `bg-district-borders-line`
  - `country-labels`
  - `rivers-line`

Visibility của các nhóm này đi qua `BackgroundLayerVisibility`.

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

1. nhận `renderDraft` đã được page áp timeline/replay/preview filter trước
2. filter draft theo `bound_with` nếu `applyGeometryBindingFilter = true`
3. filter theo geometry visibility
4. split feature thành nhóm polygon/line/point
5. decorate line/polygon/point cho label rendering
6. build source riêng cho path arrows
7. set selected feature state

Điểm quan trọng:

- data mà map render không phải raw `mainDraft` nguyên xi
- `renderDraft` là nguồn quyết định geometry nào xuất hiện trên map
- `labelContextDraft` chỉ dùng để lookup label/entity name, có thể chứa geometry đã bị timeline filter ẩn, và không được dùng để quyết định render
- source MapLibre cuối cùng là `renderDraft` sau khi đã qua bound_with filter, geometry visibility và label decoration

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

`replay_preview` không có engine interaction riêng; preview controller điều khiển camera/timeline/visibility qua replay dispatcher.

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

Trong map interaction, `replay` vẫn dùng `initSelect`; `replay_preview` không cho edit/select theo engine.
Phần script/preview replay nằm ở sidebar và preview overlay:

- map render `replayDraft` hydrate từ `target_geometry_ids`
- preview action có thể điều khiển camera, timeline, hidden geometry ids và presentation overlay
- replay mode không cho mutate geometry chính

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
- `renderDraftRef` trong map interaction là dữ liệu đang được render/interact, không phải canonical commit draft
- `draftRef` trong `useEditorState()` vẫn là ref nội bộ của draft để tránh closure stale trong editor state
- `Map` chỉ là orchestration component; logic lớn nằm ở hooks
- geometry render pipeline phụ thuộc khá nhiều vào `mapUtils.ts`, không chỉ mỗi `useMapSync.ts`
