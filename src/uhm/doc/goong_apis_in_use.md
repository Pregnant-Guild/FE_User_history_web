# Goong APIs In Use

Mục tiêu của tài liệu này:

- mô tả **chính xác** frontend hiện tại đang dùng gì từ Goong
- mô tả **backend cần proxy gì** để giấu `api_key`
- mô tả **response nào phải sanitize/rewrite**
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

1. app tự `fetch()` 2 style JSON của Goong qua backend proxy
2. app parse style JSON để lấy:
   - `raster source` từ `goong_satellite.json`
   - `sources + layers` cần thiết từ `goong_map_web.json`
3. nếu source dùng `url`, app tiếp tục fetch source manifest qua proxy trong `tiles.ts`
4. app rewrite `tiles[]` về backend proxy rồi `map.addSource(...)` và `map.addLayer(...)` thủ công
5. từ thời điểm đó, **MapLibre tự request tiếp** tile/font URLs đã là URL proxy

Hệ quả:

- nếu BE chỉ proxy `assets/*.json` thì **chưa đủ**
- proxy phải cover style JSON, source manifest, tile URLs và glyph PBF
- frontend hiện không nhúng `api_key` trong URL; backend proxy chịu trách nhiệm gọi upstream bằng key server-side nếu upstream yêu cầu

## 2. Luồng request thật hiện tại

### 2.1. App fetch style JSON qua proxy

Frontend gọi:

1. `${API_BASE_URL}/proxy/tiles.goong.io/assets/goong_satellite.json`
2. `${API_BASE_URL}/proxy/tiles.goong.io/assets/goong_map_web.json`

Upstream gốc trong code vẫn là:

1. `https://tiles.goong.io/assets/goong_satellite.json`
2. `https://tiles.goong.io/assets/goong_map_web.json`

Nguồn trong code:

- `GOONG_SATELLITE_STYLE_UPSTREAM_URL` ở [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:8)
- `GOONG_VECTOR_OVERLAY_STYLE_UPSTREAM_URL` ở [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:9)
- `buildGoongProxyUrl(...)` ở [config.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/config.ts:29)
- `loadGoongStyleDocument(...)` ở [tiles.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/tiles.ts:199)

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

### 2.2. Frontend fetch source manifests qua proxy

Khi style source có field `url`, `tiles.ts` tự fetch source manifest qua proxy trước khi gọi `map.addSource(...)`.

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

### 2.3. MapLibre fetch tile URLs đã rewrite

Đây là phần dễ bị bỏ sót nhất.

Khi `tiles.ts` đã tải `sources/satellite.json`, `sources/base.json`, `sources/goong.json`, nó rewrite mọi URL trong field:

- `tiles[]`

về `${API_BASE_URL}/proxy/tiles.goong.io/...`, rồi mới đưa source spec cho MapLibre.

Tức là runtime thật của frontend hiện tại là:

1. FE fetch style JSON qua proxy
2. FE fetch source manifest qua proxy
3. FE rewrite `tiles[]` về proxy
4. MapLibre fetch tile URL đã rewrite

Nếu backend muốn che key hoàn toàn, thì backend proxy phải xử lý cả các tile URL này bằng key server-side.

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
- frontend hiện giữ nguyên upstream target path trong proxy URL sau khi strip `api_key`

## 4. Những thứ frontend hiện tại dùng thêm hoặc KHÔNG dùng

### 4.1. Goong glyphs / fonts

Style JSON của Goong có field:

- `glyphs: https://tiles.goong.io/fonts/{fontstack}/{range}.pbf?api_key=...`

Flow hiện tại **có dùng glyphs của Goong qua proxy**.

Map đang trỏ `glyphs` vào:

- `${API_BASE_URL}/proxy/tiles.goong.io/fonts/{fontstack}/{range}.pbf`

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

Preview search hiện có dùng trực tiếp các REST API này từ browser:

- `Place/AutoComplete`
- `Place/Detail`
- `Geocode` reverse geocoding với `latlng=lat,lng`

Nguồn trong code:

- [goongPlaces.ts](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/api/goongPlaces.ts:1)
- [PresentPlaceSearch.tsx](/home/amoratran/wsp/ultimate-history-map/FrontEndUser/src/uhm/components/editor/PresentPlaceSearch.tsx:1)

Chưa dùng:

- directions
- distance matrix
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

BE trả về gần như đúng response của Goong, nhưng strip/sanitize mọi `api_key` lồng trong JSON.
Frontend hiện tự wrap các upstream URL đó bằng `buildGoongProxyUrl(...)`.

Ưu điểm:

- gần với Goong
- ít phải đổi frontend hơn

Nhược điểm:

- BE phải sanitize JSON response để không lộ key trong body response

#### Cách B: Normalize thành API nội bộ

BE không trả nguyên style/source của Goong mà trả dữ liệu đã xử lý sẵn cho FE.

Ưu điểm:

- hợp đồng BE-FE rõ hơn
- ít phụ thuộc format Goong hơn

Nhược điểm:

- cần sửa frontend nhiều hơn

Với frontend hiện tại, **Cách A** là hợp lý nhất.

Lưu ý quan trọng: frontend hiện mong nhận `sources.*.url` và `tiles[]` ở dạng upstream URL hoặc relative URL. Không rewrite các URL này thành `/proxy/...` trong JSON response hiện tại, vì FE sẽ tự gọi `buildGoongProxyUrl(...)`; rewrite sẵn sẽ dễ bị double-proxy.

## 6. Contract backend được khuyến nghị

### 6.1. Proxy style JSON

#### `GET /proxy/tiles.goong.io/assets/goong_satellite.json`

Upstream:

- `https://tiles.goong.io/assets/goong_satellite.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream bằng key server-side
- parse JSON
- strip `api_key` khỏi `sources.*.url`, `glyphs`, `sprite` nếu các field đó xuất hiện trong body
- giữ URL upstream/relative để frontend tự wrap bằng `buildGoongProxyUrl(...)`
- có thể giữ nguyên các field khác

Response:

- `Content-Type: application/json`
- body: style JSON đã sanitize, chưa rewrite sang `/proxy/...`

#### `GET /proxy/tiles.goong.io/assets/goong_map_web.json`

Upstream:

- `https://tiles.goong.io/assets/goong_map_web.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream bằng key server-side
- parse JSON
- strip `api_key` khỏi `sources.*.url`, `glyphs`, `sprite` nếu các field đó xuất hiện trong body
- giữ URL upstream/relative để frontend tự wrap bằng `buildGoongProxyUrl(...)`
- có thể giữ nguyên các field khác

Response:

- `Content-Type: application/json`
- body: style JSON đã sanitize, chưa rewrite sang `/proxy/...`

### 6.2. Proxy source manifests

#### `GET /proxy/tiles.goong.io/sources/satellite.json`

Upstream:

- `https://tiles.goong.io/sources/satellite.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream
- parse JSON
- strip `api_key` khỏi mọi URL trong `tiles[]`
- giữ URL upstream/relative để frontend tự wrap bằng `buildGoongProxyUrl(...)`
- giữ nguyên metadata quan trọng:
  - `tileSize`
  - `minzoom`
  - `maxzoom`
  - `bounds`
  - `scheme`
  - `attribution`

Response:

- `Content-Type: application/json`
- body: source manifest đã sanitize, chưa rewrite sang `/proxy/...`

#### `GET /proxy/tiles.goong.io/sources/base.json`

Upstream:

- `https://tiles.goong.io/sources/base.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream
- parse JSON
- strip `api_key` khỏi mọi URL trong `tiles[]`
- giữ URL upstream/relative để frontend tự wrap bằng `buildGoongProxyUrl(...)`
- giữ nguyên metadata tilejson khác

#### `GET /proxy/tiles.goong.io/sources/goong.json`

Upstream:

- `https://tiles.goong.io/sources/goong.json?api_key=<server-side-key>`

Backend phải:

- fetch upstream
- parse JSON
- strip `api_key` khỏi mọi URL trong `tiles[]`
- giữ URL upstream/relative để frontend tự wrap bằng `buildGoongProxyUrl(...)`
- giữ nguyên metadata tilejson khác

### 6.3. Proxy tile endpoints

Backend bắt buộc phải có route để trả tile thật.

Frontend hiện build URL proxy generic theo upstream target:

- `GET /proxy/tiles.goong.io/...`

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
3. FE gọi `sources/satellite.json` qua proxy trong `tiles.ts`
4. FE rewrite `tiles[]` về proxy URL
5. MapLibre gọi raster tile URLs đã rewrite

BE cần cover:

- style JSON
- source manifest
- raster tile URLs

### 7.2. Overlay borders / labels / rivers

Luồng:

1. FE đọc `goong_map_web.json`
2. FE lấy selected layers + selected sources
3. FE gọi `sources/base.json` qua proxy trong `tiles.ts`
4. FE gọi `sources/goong.json` qua proxy trong `tiles.ts`
5. FE rewrite `tiles[]` về proxy URL
6. MapLibre gọi vector tile URLs đã rewrite

BE cần cover:

- style JSON
- 2 source manifests
- vector tile URLs tương ứng

## 8. Danh sách tối thiểu BE phải cover

Nếu chỉ làm đúng những gì frontend hiện tại dùng, checklist tối thiểu là:

1. proxy `tiles.goong.io/assets/goong_satellite.json`
2. proxy `tiles.goong.io/assets/goong_map_web.json`
3. proxy `tiles.goong.io/sources/satellite.json`
4. proxy `tiles.goong.io/sources/base.json`
5. proxy `tiles.goong.io/sources/goong.json`
6. proxy `tiles.goong.io/fonts/{fontstack}/{range}.pbf`
7. proxy toàn bộ tile URL được khai báo trong `sources/satellite.json`
8. proxy toàn bộ tile URL được khai báo trong `sources/base.json`
9. proxy toàn bộ tile URL được khai báo trong `sources/goong.json`

## 9. Những gì BE chưa cần làm ngay

Cho flow hiện tại, BE **chưa cần**:

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
2. sanitize nested `api_key` trong style JSON
3. làm proxy `sources/*.json`
4. sanitize nested `api_key` trong source manifests
5. làm proxy generic cho tile
6. làm proxy Goong fonts/glyphs

Nếu sanitize JSON thiếu thì key có thể lộ ngay trong response style/source. Nếu proxy tile/font thiếu thì map background hoặc labels có thể không tải được.
