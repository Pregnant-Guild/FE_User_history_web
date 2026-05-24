# UHM map styling - hệ thống layer và style

Tài liệu này mô tả styling thật đang được map editor dùng.

## 1. Hai nhóm style chính

Map hiện có hai nhóm style tách biệt:

- background/base map style
- geotype style cho dữ liệu editor

### Background/base map

`getBaseMapStyle()` chỉ tạo skeleton style có `background` layer và Goong glyph proxy. Raster/vector background thật được thêm sau khi map load qua `mapUtils.ts` và `tiles.ts`.

### Geotype style

Định nghĩa trong `src/uhm/lib/map/styles/`.

## 2. Background layers đang có

Danh sách layer toggle được expose ở `backgroundLayers.ts`:

- `raster-base-layer`
- `bg-country-borders-line`
- `bg-province-borders-line`
- `bg-district-borders-line`
- `country-labels`
- `rivers-line`

Lưu ý:

- `raster-base-layer` là layer raster lazy-add từ `goong_satellite.json`
- các nhóm còn lại là overlay layer clone từ `goong_map_web.json`
- overlay layer thật có id dạng `goong-...`, nhưng metadata `uhmBackgroundGroupId` trỏ về toggle id ở trên
- `BackgroundLayersPanel` chỉ biết toggle theo `id`

Visibility mặc định:

- `raster-base-layer`, `bg-country-borders-line`, `country-labels`, `rivers-line` bật
- `bg-province-borders-line`, `bg-district-borders-line` tắt
- được persist bằng `uhm.backgroundLayerVisibility.v1`

## 3. Geotype registry

Geotype render hiện được tập trung ở `getAllGeotypeLayers(...)` trong `geotypeLayers.ts`.

Các type đang được register:

- `defense_line`
- `military_route`
- `retreat_route`
- `migration_route`
- `trade_route`
- `country`
- `state`
- `faction`
- `battle`
- `rebellion_zone`
- `person_event`
- `temple`
- `capital`
- `city`
- `fortification`
- `ruin`
- `port`

`GEOMETRY_TYPE_OPTIONS` trong `src/uhm/lib/map/geo/geometryTypeOptions.ts` phải khớp với tập geotype này nếu muốn user chọn được từ UI.

## 4. Type matching

Style matcher trung tâm là:

- `TYPE_MATCH_EXPR = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""]`

Điều này cho phép layer match theo:

- `feature.properties.type`
- fallback sang `entity_type_id` nếu cần

Với editor hiện tại, `type` là field chính.

## 5. Point, line, polygon và label sources

Map không render mọi thứ từ một source duy nhất theo nghĩa trực tiếp.
Pipeline hiện tại tách ra:

- `countries`
  - polygon và line-like feature data
- `places`
  - point data
- `PATH_ARROW_SOURCE_ID`
  - arrow shapes cho route/path
- `POLYGON_LABEL_SOURCE_ID`
  - polygon labels

Label layer cho polygon/line đi qua:

- `getAllGeotypeLabelLayers(...)`
- helper trong `shared/polygonLabels.ts`
- helper trong `shared/lineLabels.ts`

## 6. Icon point

Point geotype dùng icon pipeline trong:

- `shared/pointStyle.ts`
- `ensurePointGeotypeIcons(map)`

Icon point hiện chọn theo geotype bình thường. Không còn branch icon/style riêng cho draft-orphan geometry.

Điều này có nghĩa là khi thêm geotype point mới, chỉ thêm layer là chưa đủ; cần chắc icon/style builder cũng hiểu type mới đó.

## 7. Preview và edit styling

Ngoài style dữ liệu chính, map còn có style riêng cho:

### Draw preview

- `draw-preview-fill`
- `draw-preview-line`
- `draw-circle-preview-fill`
- `draw-circle-preview-line`
- `draw-line-preview-line`
- `draw-path-preview-line`
- `draw-path-preview-arrows`

### Editing overlay

- `edit-shape-line`
- `edit-handles-circle`

### Focus/highlight

- `entity-focus-fill`
- `entity-focus-line`
- `entity-focus-points`

Các layer này không đi qua geotype registry.

## 8. Visibility filtering

Có ba lớp filter hiển thị trong runtime:

1. background layer visibility
2. geometry visibility theo type key từ panel phải
3. binding filter / replay filter / timeline filter ở phía data trước khi set source

Vì vậy khi một geometry "không hiện", có thể nguyên nhân nằm ở data filtering chứ không phải style layer.

Geometry không bind entity không có màu/icon riêng trên map. Trạng thái orphan/time/timeline nằm trong `GeometryBindingPanel`, còn map chỉ giữ style geotype + selected/focus/edit states.

## 9. Thêm geotype mới - checklist đúng với code hiện tại

Nếu thêm một geotype mới, nên đi theo checklist này:

1. Thêm mapping vào `geoTypeMap` nếu backend dùng numeric/type code.
2. Thêm option vào `geometryTypeOptions.ts`.
3. Tạo file style mới trong `styles/geotypes/`.
4. Register nó trong `getAllGeotypeLayers(...)`.
5. Nếu cần label riêng, cập nhật layer builder tương ứng.
6. Nếu là point type, kiểm tra icon pipeline.
7. Nếu muốn user tạo geometry mới với type đó mặc định từ tool nào đó, cập nhật `useMapInteraction.ts`.

## 10. Điều doc cũ mô tả chưa chính xác

Doc cũ nói tới filter thời gian ở từng layer như một biểu thức layer-level chuẩn.
Implementation hiện tại không làm vậy.

Thay vào đó:

- timeline filter đang chạy phía data trong `page.tsx`
- binding filter và geometry visibility cũng chủ yếu chạy trước khi set source

Tức là phần lớn filtering là `prepare data -> set source`, không phải `add layer filter expression per year`.
