# FrontEndUser Technical README

## Scope

Tài liệu này mô tả phần **FrontEndUser** như một runtime web độc lập: biên dịch bằng Next.js, triển khai bằng Docker, phụ thuộc vào API backend để xử lý dữ liệu lịch sử, xác thực, media và proxy bản đồ. Nội dung ở đây không mô tả giá trị sản phẩm; nó mô tả ràng buộc hệ thống, quyết định kỹ thuật, điểm kiểm soát vận hành và số đo hiện có trong repository.

## Baseline Thực Nghiệm

Các số liệu dưới đây được đo trực tiếp tại working tree hiện tại.

```text
package name                 fe_admin_history_web
package version              2.2.3
runtime image                node:24-alpine
production server port       3000
docker-compose host port     3014
dependencies                 34
devDependencies              12
TypeScript/TSX files in src  232
Next app route files         20
TypeScript/TSX files in uhm  140
src size                     3.4M
public size                  43M
node_modules size            759M
.next size                   941M
.next/standalone size        58M
.next/static size            5.3M
```

Diễn giải vận hành:

* Kích thước `node_modules` và `.next` không được dùng làm runtime artifact. Runtime Docker chỉ cần standalone server, static assets và `public`.
* `.next/standalone` đang ở mức 58M, thấp hơn rất nhiều so với full build directory 941M. Đây là lý do bắt buộc giữ `output: "standalone"` trong `next.config.ts`.
* 140/232 file TS/TSX nằm trong `src/uhm`; rủi ro thay đổi tập trung ở module bản đồ, editor, wiki, replay và geospatial client logic.
* `npm ls --depth=0` hiện báo một package extraneous: `@emnapi/runtime@1.9.1`. Đây không phải lỗi build mặc định, nhưng là tín hiệu cần dọn dependency tree trước khi khóa môi trường CI nghiêm ngặt.

## Runtime Boundary

FrontEndUser không sở hữu dữ liệu lõi. Nó là boundary hiển thị và tương tác.

Các trách nhiệm nằm trong frontend:

* render route bằng Next.js App Router;
* giữ state tương tác của bản đồ/editor/wiki;
* gọi API backend qua Axios/fetch;
* xử lý token phía client khi backend trả token trong payload;
* gửi cookie theo `withCredentials: true`;
* rewrite request Goong qua backend proxy;
* render MapLibre layer/source sau khi nhận manifest/style đã sanitize từ backend.

Các trách nhiệm không được đặt vào frontend:

* giữ Goong API key thật;
* quyết định quyền truy cập dữ liệu;
* xử lý refresh token như một nguồn tin cậy;
* proxy trực tiếp tới upstream map provider từ browser;
* query geospatial nặng;
* normalize dữ liệu lịch sử ở quy mô database.

## Stack

Stack chính theo `package.json` và lockfile hiện tại:

```text
Next.js              16.x
React                19.x
TypeScript           5.9.x
Tailwind CSS         4.x
MapLibre GL          5.x
Axios                1.x
Redux Toolkit        2.x
Zustand              5.x
```

Các dependency nặng đã được tách chunk trong `next.config.ts`:

* `maplibre-gl` -> chunk `maplibre`
* `react-quill-new`, `quill`, `quill-blot-formatter` -> chunk `quill`
* `apexcharts`, `react-apexcharts` -> chunk `charts`
* `@fullcalendar/*` -> chunk `calendar`

Ràng buộc ở đây là rõ: bản đồ, rich text editor, chart và calendar không được kéo vào cùng một client bundle mặc định nếu route không cần chúng.

## Configuration Contract

Frontend đọc cấu hình từ environment tại thời điểm build.

```bash
NEXT_PUBLIC_API_URL_ROOT="https://api.uhm.io.vn"
NEXT_PUBLIC_URL_MEDIA="https://cdn.uhm.io.vn/history-app/"
NEXT_PUBLIC_HOME_URL="http://localhost:3000"

BACKGROUND_MAP_API_KEY=
SEARCH_MAP_API_KEY=
```

Biến đang được code client đọc trực tiếp:

* `NEXT_PUBLIC_API_URL_ROOT`
* `NEXT_PUBLIC_URL_MEDIA`
* `NEXT_PUBLIC_HOME_URL`

Quy tắc triển khai: mọi biến `NEXT_PUBLIC_*` phải đúng trước `npm run build` hoặc trước `docker build`. Đổi biến ở runtime container không đảm bảo đổi behavior phía browser vì Next.js đã inline các giá trị public vào client bundle.

## Backend Dependency Contract

`NEXT_PUBLIC_API_URL_ROOT` là contract trung tâm. Từ biến này, frontend tạo các endpoint:

```text
<API_ROOT>/users/current
<API_ROOT>/auth/signin
<API_ROOT>/auth/refresh
<API_ROOT>/projects
<API_ROOT>/submissions
<API_ROOT>/geometries
<API_ROOT>/entities
<API_ROOT>/wikis
<API_ROOT>/battle-replays
```

Map proxy contract:

```text
<API_ROOT>/map/proxy/tiles.goong.io/...
<API_ROOT>/api/proxy/rsapi.goong.io/...
```

Backend phải thỏa các điều kiện sau:

* CORS cho phép frontend origin production.
* Cookie policy tương thích cross-origin nếu deploy khác domain.
* `/auth/refresh` hoạt động với cookie httpOnly hoặc trả access token mới theo payload mà frontend hiểu.
* Proxy Goong không trả JSON chứa `api_key`.
* Proxy Goong giữ shape đủ tương thích để frontend tiếp tục rewrite nested resource URLs.

## Map Constraint

MapLibre không được gọi trực tiếp Goong bằng URL chứa key. Flow hiện tại:

1. Frontend gọi style/source/font/tile qua backend proxy.
2. Backend gọi upstream Goong bằng server-side key.
3. Backend sanitize URL lồng bên trong response.
4. Frontend rewrite URL sạch qua `buildGoongProxyUrl`.
5. MapLibre chỉ thấy proxy URL.

Constraint quan trọng: backend không nên rewrite sẵn mọi nested URL thành `/proxy/...` nếu frontend vẫn gọi `buildGoongProxyUrl`; làm vậy có rủi ro double-proxy. Contract hiện tại yêu cầu backend trả upstream URL sạch hoặc relative URL, không trả URL đã chứa key.

## Auth Constraint

Axios instance dùng `withCredentials: true` và request interceptor gắn Bearer token nếu có token trong client storage. Response interceptor xử lý hai loại hết hạn token:

* HTTP `401`;
* response `200` nhưng body có `status: false` và message cho thấy token hết hạn/không hợp lệ.

Khi refresh thất bại với `401` hoặc `404`, frontend xóa token local và redirect về `/signin`.

Ràng buộc vận hành:

* backend không được trả message hết hạn token mơ hồ nếu muốn frontend tự refresh;
* refresh endpoint không được tạo vòng lặp interceptor;
* cookie refresh phải có domain, path, SameSite và Secure tương thích domain deploy.

## Build And Deployment

Development:

```bash
npm ci
npm run dev
```

Dev server khác port:

```bash
npm run dev -- --port 3005
```

Quality gates cục bộ:

```bash
npm run lint
npm run build
```

Production bằng Docker Compose:

```bash
docker compose up -d --build
```

Port mapping:

```text
host:3014 -> container:3000
```

Dockerfile hiện có ba lớp logic:

1. `deps`: cài dependency bằng `npm ci`.
2. `builder`: build Next.js standalone bằng `npm run build`.
3. `runner`: chạy `node server.js` từ `.next/standalone`.

Do `Dockerfile` copy `.env` vào build stage, file `.env` production phải được kiểm soát trước khi build image. Không dùng `.env.local` như nguồn cấu hình production trừ khi Dockerfile được đổi có chủ đích.

## Operational Checks

Sau khi deploy, kiểm tra theo thứ tự phụ thuộc:

1. `GET /` trả HTML và load client bundle không lỗi.
2. Browser không request trực tiếp `tiles.goong.io` hoặc `rsapi.goong.io`.
3. Map request đi qua `<API_ROOT>/map/proxy/...`.
4. Place search/reverse geocode request đi qua `<API_ROOT>/api/proxy/...`.
5. `/auth/signin` ghi được cookie hoặc trả token mà client lưu được.
6. `/auth/refresh` trả token mới khi access token hết hạn.
7. `/users/current` hoạt động sau refresh.
8. `/wiki/[slug]`, `/editor`, `/user/projects` không crash khi reload trực tiếp.
9. Media URL dưới `NEXT_PUBLIC_URL_MEDIA` trả được ảnh/video cần render.

## Failure Modes

Các lỗi có xác suất cao nhất khi triển khai:

* Build image bằng sai `NEXT_PUBLIC_API_URL_ROOT`: frontend deploy thành công nhưng mọi API call trỏ sai host.
* Backend CORS đúng cho API thường nhưng sai cho credentialed request: sign in được một phần, refresh/session hỏng.
* Goong proxy trả URL còn `api_key`: lộ key qua DevTools và cache layer.
* Goong proxy rewrite nested URL quá sớm: MapLibre nhận URL double-proxy và tile/font hỏng.
* Thêm dependency bản đồ/editor/chart vào shared component: tăng client bundle của route không liên quan.
* Deploy sau khi `npm install` tạo dependency tree khác lockfile: `npm ci` trong Docker/CI có thể fail hoặc build khác local.

## Change Control

Các thay đổi cần được xem như thay đổi kiến trúc, không phải chỉnh UI đơn thuần:

* đổi `NEXT_PUBLIC_API_URL_ROOT` semantics;
* đổi đường dẫn `/map/proxy` hoặc `/api/proxy`;
* đổi cơ chế refresh token;
* đưa Goong key xuống browser;
* bỏ `output: "standalone"`;
* thay MapLibre style loading từ incremental source/layer sang `map.setStyle(goongStyleJson)` trực tiếp;
* đưa `maplibre-gl`, Quill, chart hoặc calendar vào layout dùng chung.

## Measurement Commands

Dùng các lệnh này để cập nhật baseline khi cần:

```bash
du -sh .next node_modules public src
du -sh .next/standalone .next/static
find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
find src/app -type f \( -name 'page.tsx' -o -name 'layout.tsx' \) | wc -l
find src/uhm -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).length, Object.keys(p.devDependencies||{}).length)"
npm ls --depth=0
```
