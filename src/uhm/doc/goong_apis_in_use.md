# Goong APIs In Use

Mục tiêu của tài liệu này:

- mô tả **chính xác** frontend hiện tại đang dùng gì từ Goong
- mô tả **backend cần proxy gì** để giấu `api_key`
- mô tả **response nào phải rewrite**
- tránh liệt kê thừa các API Goong mà app hiện tại không đụng tới

Phạm vi kiểm tra:

- [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:1)
- [tiles.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/tiles.ts:1)
- [useMapLayers.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/components/map/useMapLayers.ts:1)
- style JSON đã tải về:
  - [goong_map_web.json](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/tmp/goong-styles/goong_map_web.json)
  - [goong_satellite.json](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/tmp/goong-styles/goong_satellite.json)

## 1. Tóm tắt kỹ thuật

Frontend hiện tại **không** `map.setStyle(goongStyleJson)` trực tiếp.

Thay vào đó:

1. app tự `fetch()` 2 style JSON của Goong
2. app parse style JSON để lấy:
   - `raster source` từ `goong_satellite.json`
   - `sources + layers` cần thiết từ `goong_map_web.json`
3. app `map.addSource(...)` và `map.addLayer(...)` thủ công
4. từ thời điểm đó, **MapLibre tự request tiếp** các `source.url`
5. rồi từ các source manifest đó, **MapLibre lại tự request tiếp** các tile URLs nằm trong `tiles[]`

Hệ quả:

- nếu BE chỉ proxy `assets/*.json` thì **chưa đủ**
- nếu BE chỉ proxy `sources/*.json` mà **không rewrite `tiles[]`** thì **vẫn lộ key ở request tile**

## 2. Luồng request thật hiện tại

### 2.1. App fetch trực tiếp style JSON

Frontend gọi trực tiếp:

1. `https://tiles.goong.io/assets/goong_satellite.json?api_key=...`
2. `https://tiles.goong.io/assets/goong_map_web.json?api_key=...`

Nguồn trong code:

- `GOONG_SATELLITE_STYLE_URL` ở [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:15)
- `GOONG_VECTOR_OVERLAY_STYLE_URL` ở [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:19)
- `loadGoongStyleDocument(...)` ở [tiles.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/tiles.ts:211)

Mục đích:

- `goong_satellite.json`
  - app lấy ra raster source đầu tiên
  - dùng làm nền satellite
- `goong_map_web.json`
  - app lấy ra các layer/source phục vụ:
    - `Country Borders`
    - `Province Borders`
    - `District Borders`
    - `Country Labels`
    - `Rivers`

### 2.2. MapLibre fetch source manifests

Sau khi app clone source spec từ style JSON và `addSource(...)`, MapLibre tự bắn tiếp các request `source.url`.

Các source URL đang xuất hiện trong style JSON:

#### Trong `goong_satellite.json`

- `https://tiles.goong.io/sources/satellite.json?api_key=...`
- `https://tiles.goong.io/sources/base.json?api_key=...`
- `https://tiles.goong.io/sources/goong.json?api_key=...`

#### Trong `goong_map_web.json`

- `https://tiles.goong.io/sources/base.json?api_key=...`
- `https://tiles.goong.io/sources/goong.json?api_key=...`

Ý nghĩa:

- `sources/satellite.json`
  - raster source manifest cho nền satellite
- `sources/base.json`
  - vector source manifest cho các lớp `boundary`, `worldcountriespoints`, `worldnationalcapitals`
- `sources/goong.json`
  - vector source manifest cho các lớp `riversandlakes`, `vietnam_administrator`

### 2.3. MapLibre fetch tile URLs nằm trong source manifests

Đây là phần dễ bị bỏ sót nhất.

Khi MapLibre đã tải `sources/satellite.json`, `sources/base.json`, `sources/goong.json`, nó sẽ tiếp tục request các URL nằm trong field:

- `tiles[]`

Tức là runtime thật của frontend hiện tại là:

1. fetch style JSON
2. fetch source manifest
3. fetch tile URL bên trong source manifest

Nếu backend muốn che key hoàn toàn, thì **bước 3 bắt buộc phải được proxy hoặc rewrite về domain backend**.

## 3. Những upstream Goong resource đang dùng thật

Tính theo runtime hiện tại, upstream Goong đang được dùng thật là:

### 3.1. Style JSON

- `assets/goong_satellite.json`
- `assets/goong_map_web.json`

### 3.2. Source manifests

- `sources/satellite.json`
- `sources/base.json`
- `sources/goong.json`

### 3.3. Tile endpoints bên trong source manifests

- raster tile URLs nằm trong `sources/satellite.json`
- vector tile URLs nằm trong `sources/base.json`
- vector tile URLs nằm trong `sources/goong.json`

Lưu ý:

- tile URL pattern chính xác phải đọc từ source manifest upstream ở runtime
- backend không nên hardcode khi chưa xác minh nội dung `tiles[]`

## 4. Những thứ frontend hiện tại dùng thêm hoặc KHÔNG dùng

### 4.1. Goong glyphs / fonts

Style JSON của Goong có field:

- `glyphs: https://tiles.goong.io/fonts/{fontstack}/{range}.pbf?api_key=...`

Flow hiện tại **có dùng glyphs của Goong qua proxy**.

Map đang trỏ `glyphs` vào:

- `/proxy/{encoded-https://tiles.goong.io/fonts/{fontstack}/{range}.pbf}`

Nguồn trong code:

- [useMapLayers.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/components/map/useMapLayers.ts:17)
- [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:12)

Kết luận:

- **backend proxy Goong fonts/glyphs là bắt buộc cho flow hiện tại**

### 4.2. Goong sprite

Style JSON của Goong có:

- `sprite: https://tiles.goong.io/sprite`

Nhưng flow hiện tại **không phụ thuộc sprite** vì:

- app không nạp toàn bộ Goong style vào map
- app chỉ nhặt `sources` và `layers`
- khi clone overlay labels, code còn chủ động loại bớt icon fields

Nguồn trong code:

- `cloneOverlayLayer(...)` ở [tiles.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/tiles.ts:411)

Kết luận:

- **không cần backend proxy Goong sprite cho flow hiện tại**

### 4.3. Các REST API khác của Goong

Không dùng:

- geocoding
- autocomplete
- directions
- distance matrix
- place details
- static map

## 5. Backend cần làm gì

### 5.1. Mục tiêu backend

Backend phải đảm bảo:

1. browser không gọi Goong trực tiếp
2. browser không nhìn thấy `api_key`
3. frontend vẫn nhận được dữ liệu theo format mà MapLibre/app hiện tại cần

### 5.2. Hai kiểu triển khai

Có 2 cách:

#### Cách A: Transparent proxy

BE trả về gần như đúng response của Goong, chỉ rewrite URL.

Ưu điểm:

- gần với Goong
- ít phải đổi frontend hơn

Nhược điểm:

- BE phải rewrite nhiều chỗ

#### Cách B: Normalize thành API nội bộ

BE không trả nguyên style/source của Goong mà trả dữ liệu đã xử lý sẵn cho FE.

Ưu điểm:

- hợp đồng BE-FE rõ hơn
- ít phụ thuộc format Goong hơn

Nhược điểm:

- cần sửa frontend nhiều hơn

Với frontend hiện tại, **Cách A** là hợp lý nhất.

## 6. Contract backend được khuyến nghị

### 6.1. Proxy style JSON

#### `GET /proxy/goong/assets/goong_satellite.json`

Upstream:

- `https://tiles.goong.io/assets/goong_satellite.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream bằng key server-side
- parse JSON
- rewrite `sources.*.url` về domain backend
- có thể giữ nguyên các field khác

Response:

- `Content-Type: application/json`
- body: style JSON đã rewrite

#### `GET /proxy/goong/assets/goong_map_web.json`

Upstream:

- `https://tiles.goong.io/assets/goong_map_web.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream bằng key server-side
- parse JSON
- rewrite `sources.*.url` về domain backend
- có thể giữ nguyên các field khác

Response:

- `Content-Type: application/json`
- body: style JSON đã rewrite

### 6.2. Proxy source manifests

#### `GET /proxy/goong/sources/satellite.json`

Upstream:

- `https://tiles.goong.io/sources/satellite.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream
- parse JSON
- rewrite mọi URL trong `tiles[]` về domain backend
- giữ nguyên metadata quan trọng:
  - `tileSize`
  - `minzoom`
  - `maxzoom`
  - `bounds`
  - `scheme`
  - `attribution`

Response:

- `Content-Type: application/json`
- body: source manifest đã rewrite

#### `GET /proxy/goong/sources/base.json`

Upstream:

- `https://tiles.goong.io/sources/base.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream
- parse JSON
- rewrite mọi URL trong `tiles[]` về domain backend
- giữ nguyên metadata tilejson khác

#### `GET /proxy/goong/sources/goong.json`

Upstream:

- `https://tiles.goong.io/sources/goong.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream
- parse JSON
- rewrite mọi URL trong `tiles[]` về domain backend
- giữ nguyên metadata tilejson khác

### 6.3. Proxy tile endpoints

Backend bắt buộc phải có route để trả tile thật.

Có thể làm generic, ví dụ:

- `GET /proxy/goong/tiles/*`

hoặc explicit hơn theo source:

- `GET /proxy/goong/tiles/satellite/...`
- `GET /proxy/goong/tiles/base/...`
- `GET /proxy/goong/tiles/goong/...`

Yêu cầu:

- request browser -> backend
- backend -> upstream Goong bằng key server-side
- stream response về browser
- pass through hoặc preserve:
  - `Content-Type`
  - `Cache-Control`
  - `ETag`
  - `Last-Modified`

Response type có thể là:

- raster image
- vector tile protobuf

## 7. Runtime dependency map cho BE

### 7.1. Satellite background

Luồng:

1. FE đọc `goong_satellite.json`
2. FE lấy `sources.satellite`
3. MapLibre gọi `sources/satellite.json`
4. MapLibre gọi raster tile URLs trong `tiles[]`

BE cần cover:

- style JSON
- source manifest
- raster tile URLs

### 7.2. Overlay borders / labels / rivers

Luồng:

1. FE đọc `goong_map_web.json`
2. FE lấy selected layers + selected sources
3. MapLibre gọi `sources/base.json`
4. MapLibre gọi `sources/goong.json`
5. MapLibre gọi vector tile URLs của 2 source manifest này

BE cần cover:

- style JSON
- 2 source manifests
- vector tile URLs tương ứng

## 8. Danh sách tối thiểu BE phải cover

Nếu chỉ làm đúng những gì frontend hiện tại dùng, checklist tối thiểu là:

1. proxy `assets/goong_satellite.json`
2. proxy `assets/goong_map_web.json`
3. proxy `sources/satellite.json`
4. proxy `sources/base.json`
5. proxy `sources/goong.json`
6. proxy toàn bộ tile URL được khai báo trong `sources/satellite.json`
7. proxy toàn bộ tile URL được khai báo trong `sources/base.json`
8. proxy toàn bộ tile URL được khai báo trong `sources/goong.json`

## 9. Những gì BE chưa cần làm ngay

Cho flow hiện tại, BE **chưa cần**:

- proxy Goong `glyphs`
- proxy Goong `sprite`
- proxy geocoding / directions / autocomplete

Điều này chỉ đúng khi frontend vẫn giữ kiến trúc hiện tại.

Nếu sau này frontend chuyển sang `map.setStyle(goongStyleJson)` trực tiếp, hãy đánh giá lại:

- `glyphs`
- `sprite`

vì khi đó chúng có thể trở thành dependency bắt buộc.

## 10. Gợi ý ngắn cho team BE

Nếu muốn làm ít rủi ro nhất:

1. làm proxy `assets/*.json`
2. rewrite `sources.*.url`
3. làm proxy `sources/*.json`
4. rewrite `tiles[]`
5. làm proxy generic cho tile

Nếu làm thiếu bước 4 hoặc 5 thì key vẫn có thể lộ ở request tile.
