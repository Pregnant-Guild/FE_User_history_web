# UHM Wiki system - trạng thái hiện tại

Wiki trong UHM editor hiện chạy qua hai phần:

- editor: `WikiSidebarPanel.tsx`
- viewer/sidebar public: `PublicWikiSidebar.tsx`

## 1. Storage format của wiki doc

Field `doc` trong `WikiSnapshot` hiện là `string | null`.
Frontend hiện hỗ trợ hai dạng:

- HTML string
- plain text fallback

Quy ước hiện tại:

- format ghi mới từ editor Quill là HTML

`normalizeWikiDocForQuill()` và `normalizeWikiContentToHtml()` hiện chỉ xử lý HTML hoặc plain text.

## 2. Editor hiện dùng Quill, không dùng Tiptap

Trong editor project, wiki đang dùng:

- `react-quill-new`
- theme `snow`
- toolbar custom
- dynamic import để tránh SSR issues

Toolbar hiện có:

- heading `h1`, `h2`, `h3`
- align
- `bold`, `italic`, `underline`, `strike`
- ordered list, bullet list
- `blockquote`
- `code-block`
- `link`
- `image`
- `clean`

## 3. Tạo, sửa và xóa wiki trong project editor

`WikiSidebarPanel` hỗ trợ:

- tạo wiki local từ panel
- sửa `title`, `slug`, `doc`
- xóa wiki khỏi `snapshotWikis`
- mở modal để sửa nội dung chi tiết

Quy ước operation:

- wiki mới local: `source: "inline"`, `operation: "create"`
- wiki ref thêm từ search: `source: "ref"`, `operation: "reference"`
- wiki đã tồn tại nhưng sửa nội dung: `operation: "update"`
- wiki bị remove khỏi current state: được chuyển thành `delete` khi build snapshot so với baseline

## 4. Slug

Slug trong editor hiện:

- không tự generate bắt buộc ở lúc save
- có helper `slugifyWikiTitle()` để fill nhanh khi tạo mới
- được kiểm tra uniqueness bằng `checkWikiSlugExists(slug)` khi tạo wiki mới

Với wiki mới:

- nếu slug trống thì không cho create
- nếu slug đã tồn tại trên server thì chặn create/save

## 5. Import và export

### Import

Editor chỉ hỗ trợ import file HTML:

- chấp nhận `.html`, `.htm`, `text/html`
- nội dung phải parse được như HTML thô
- nếu file không phải HTML thì báo lỗi

### Export

Export hiện chỉ là download text từ `wikiDocHtml`.
Định dạng file được đoán từ nội dung hiện tại:

- bắt đầu bằng `<` -> `html`
- còn lại -> `txt`

Đây là export client-side, không có API export chuyên biệt.

## 6. Link nội bộ giữa các wiki

### Cách link đang được lưu

Quill link hiện lưu trực tiếp `href = slug`.

Ví dụ:

- `dai-viet`
- `tran-dynasty`

Quill sanitize mặc định đã được patch để chấp nhận slug/relative href, miễn không phải `javascript:`.

### Modal chọn link

Khi bấm nút link trên toolbar:

- editor lấy selection hiện tại
- mở modal search
- tìm trong wiki local của project
- đồng thời có thể search wiki global từ server

User có thể:

- chọn một wiki local/global để chèn link
- chèn `__missing__` như một link placeholder
- remove link hiện tại

### `__missing__`

`__missing__` là sentinel để đánh dấu một link chưa map được tới wiki cụ thể.

Trong editor:

- link này được tô đỏ

Trong viewer:

- link này không click được
- vẫn được render như tín hiệu nội dung còn thiếu

## 7. Render wiki phía public/sidebar

`PublicWikiSidebar.tsx` xử lý wiki render như sau:

1. normalize `content` về HTML
2. parse HTML bằng `DOMParser`
3. remove `<script>`
4. rewrite link nội bộ từ slug thành `#wiki:{slug}`
5. giữ external links mở tab mới
6. sinh TOC từ `h1..h6`

Viewer này còn hỗ trợ:

- auto tạo heading id
- TOC dạng chip ngang
- intercept click vào `a[data-wiki-slug]` để điều hướng wiki nội bộ bằng logic app

## 8. Wiki và entity-wiki binding

Link giữa entity và wiki không nằm trong field của chính wiki.
Nó sống ở collection riêng:

- `snapshotEntityWikiLinks`
- payload commit: `entity_wiki[]`

`EntityWikiBindingsPanel` cho phép:

- chọn entity
- chọn wiki
- link/unlink cặp đó

Khi build snapshot:

- cặp mới -> `binding`
- cặp đã có từ baseline -> `reference`
- cặp bị gỡ -> `delete`

## 9. Những gì wiki system hiện chưa có

Hiện tại chưa có:

- media upload workflow riêng lên server cho Quill image
- version history riêng cho từng wiki ngoài commit history của project
- markdown storage/render
- schema block editor mới cho project wiki
- cross-project link graph UI

File `doc/commit_snapshot.ts` có chứa schema `replays[]`, nhưng phần replay narrative đó chưa được nối với wiki editor hiện tại.
