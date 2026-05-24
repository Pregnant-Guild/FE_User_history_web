# Editor (/editor) - Local Store & Snapshot Conversion

Tài liệu này mô tả chi tiết **các nơi lưu trữ state (store) ở phía FrontEndUser** trong `/editor/[id]`, ý nghĩa từng biến state, state nào là “single source of truth”, state nào chỉ là cache/UI, và cách chuyển đổi qua lại giữa:

1. **Local session state** (React state trong phiên làm việc)
2. **Commit snapshot** (`commits.snapshot_json`)
3. **Reload trang** (mất state local, load lại từ commit snapshot)

Mục tiêu: dễ debug, nhất quán dữ liệu, tránh sai semantics `"reference"`/`"binding"`.

---

## 0) 5 Dataset Quan Trọng Nhất (GEO/ENT/WIKI/ENT_WIKI/GEO_ENT)

Trong `/editor`, 5 nhóm dữ liệu quan trọng nhất tương ứng trực tiếp với snapshot:

1. **GEO**: `snapshot_json.geometries[]` + `snapshot_json.editor_feature_collection`
2. **ENT**: `snapshot_json.entities[]`
3. **WIKI**: `snapshot_json.wikis[]`
4. **ENT_WIKI** (entity ↔ wiki): `snapshot_json.entity_wiki[]`
5. **GEO_ENT** (geometry ↔ entity): `snapshot_json.geometry_entity[]`

Điểm quan trọng về “store”:

- **ENT/WIKI/ENT_WIKI** có store snapshot riêng trong React session:
  - `snapshotEntities` -> `entities[]`
  - `snapshotWikis` -> `wikis[]`
  - `snapshotEntityWikiLinks` -> `entity_wiki[]`

- **GEO/GEO_ENT không có store snapshot riêng theo kiểu `snapshotGeometries` / `snapshotGeometryEntity`**.
  - Trong session, GEO sống ở **`editor.draft`** (GeoJSON FeatureCollection).
  - Khi commit, FE **build ra**:
    - `geometries[]` từ `editor.draft + editor.changes + baselineSnapshot.geometries`
    - `geometry_entity[]` từ `editor.draft.features[].properties.entity_ids`

Vì vậy, nếu bạn “tìm store của geo trong React state” thì bạn sẽ thấy nó nằm ở `useEditorState()` chứ không nằm trong `useEditorSessionState()`.

---

## 1) Nguyên tắc chung

### 1.1 Single source of truth theo lớp

- **Geometry (map/editor):** `useEditorState(initialData)` là state trung tâm cho `draft/changes/undo`.
- **Snapshot stores (phần sẽ đi vào commit snapshot):**
  - `snapshotEntities` -> `snapshot_json.entities`
  - `snapshotWikis` -> `snapshot_json.wikis`
  - `snapshotEntityWikiLinks` -> `snapshot_json.entity_wiki`
- **Catalog/cache để tìm kiếm & hiển thị:**
  - `entityCatalog` là danh sách entity “global” trong RAM (fetch + search merge). Không phải snapshot.

### 1.2 “reference” vs “binding”

- `"reference"` (entities/wikis/geometries.operation) nghĩa là **không sửa record** trong commit đó.
- `"binding"` (chỉ áp dụng cho `entity_wiki.operation`) nghĩa là **link entity ↔ wiki đang tồn tại** trong snapshot.
- `"delete"` nghĩa là xóa record (entities/wikis/geometries) hoặc unlink (entity_wiki).

Khi **mở 1 phiên editor mới từ commit**, mọi operation local đều bị “reset về baseline”:

- `entities[].operation` và `wikis[].operation` trong session -> `"reference"`
- `entity_wiki[].operation` trong session -> `"binding"` (nếu link còn active)

---

## 2) Local state: danh sách đầy đủ và ý nghĩa

Các state này được tạo từ `useEditorSessionState()` và `useEditorState()` trong:

- `FrontEndUser/src/app/editor/[id]/page.tsx`
- `FrontEndUser/src/uhm/lib/useEditorSessionState.ts`
- `FrontEndUser/src/uhm/lib/useEditorState.ts`

### 2.1 Geometry editor state (core)

Nguồn: `const editor = useEditorState(initialData)`

- `initialData: FeatureCollection`
  - Là **baseline** của session hiện tại để render Map ban đầu.
  - Được set khi:
    - mở project (load snapshot head),
    - restore FE-only từ 1 commit,
    - hoặc import/replace dữ liệu session.

- `editor.draft: FeatureCollection`
  - **Single source of truth** cho geometry đang hiển thị + chỉnh sửa.
  - Map render trực tiếp từ `draft` (hoặc bản “visibleDraft” đã filter theo timeline/binding).
  - Đây chính là **store runtime của GEO** trong session.

- `editor.changes: Map<id, Change>`
  - Diff giữa `draft` và baseline map nội bộ (initialMapRef).
  - Dùng để tính `pendingSaveCount` và để build snapshot geometries/update/delete.

- `editor.undoStack`
  - Danh sách thao tác gần nhất (create/update/properties/delete).

- `editor.changeCount`
  - Số lượng changes (để chặn commit khi không đổi gì).

- `editor.hasPersistedFeature(id)`
  - `true` nếu feature đã tồn tại trong baseline map nội bộ.
  - Dùng để phân biệt geometry mới khi build snapshot và hiển thị trạng thái `new`.

### 2.2 Snapshot stores (persisted on commit)

Các state này là “source of truth” cho những phần non-geometry trong commit snapshot.

#### a) `snapshotEntities: EntitySnapshot[]`

- Dùng để build `snapshot_json.entities`.
- Bao gồm:
  - entity “pin” vào project (`source:"ref"`, `operation:"reference"`),
  - entity tạo mới local (`source:"inline"`, `operation:"create"`),
  - entity bị xóa (nếu có) (`operation:"delete"`).

Lưu ý quan trọng:

- `snapshotEntities` là nơi “giữ entity” **qua các commit**, kể cả entity tạo mới chưa bind geometry.
- `buildEditorSnapshot()` có logic carry-forward inline entity từ `previousSnapshot` để tránh mất entity sau commit/reload.

#### b) `snapshotWikis: WikiSnapshot[]`

- Dùng để build `snapshot_json.wikis`.
- Wiki hiện lưu `doc` là **string (HTML)** (Quill) hoặc `null` với ref wiki.
- Tiptap JSON cũ: được normalize sang HTML để hiển thị.

#### c) `snapshotEntityWikiLinks: EntityWikiLinkSnapshot[]`

- Dùng để build `snapshot_json.entity_wiki`.
- `operation`:
  - `"binding"`: link đang tồn tại
  - `"delete"`: unlink trong snapshot
  - (compat) `"reference"` từ snapshot cũ được normalize thành `"binding"` khi load.

### 2.3 Catalog/cache state (không persist)

#### `entityCatalog: Entity[]`

Đây là **RAM cache** để:

- hiển thị tên/description/status của entity,
- merge kết quả fetch + search,
- giảm tình trạng UI “cùng 1 entity nhưng 2 object khác nhau”.

Không ghi thẳng vào snapshot. Snapshot vẫn lấy từ `snapshotEntities`.

Trong page, danh sách `entities` dùng cho UI được merge:

`entities = mergeEntitySearchResults(entityCatalog, snapshotEntitiesAsEntities)`

Nghĩa là: snapshot entities (local) luôn được ưu tiên hiển thị trong UI.

### 2.4 UI-only state (không persist)

Các state sau chỉ phục vụ UX, mất khi reload:

- `mode` (idle/select/add-*)
- `selectedFeatureId`
- `selectedGeometryEntityIds` (list bind tạm thời cho UI, map patch sẽ sync vào feature properties)
- `geometryMetaForm`
- `entityForm` (tạo entity mới)
- `entityFormStatus` (toast/status 3s)
- `searchKind`, `searchQuery`
- `entitySearchResults`, `wikiSearchResults`, `geoSearchResults`
- `timelineDraftYear`, `timelineFilterEnabled`
- panel widths (`leftPanelWidth`, `rightPanelWidth`)

### 2.5 LocalStorage (trên browser)

Hiện tại chỉ có **1 thứ** persist sang LocalStorage:

- `backgroundVisibility` (ẩn/hiện layer nền)

Các snapshot stores (`snapshotEntities`, `snapshotWikis`, `snapshotEntityWikiLinks`, `draft`) **không** lưu LocalStorage; chúng được persist qua commit snapshot (backend).

---

## 3) Chuyển đổi giữa local session ↔ snapshot

### 3.1 Load snapshot -> mở session

Luồng: `openSectionEditor()` -> `normalizeEditorSnapshot()` -> `toEditorSessionSnapshot()`

Khi mở session mới:

1. `baselineSnapshot = toEditorSessionSnapshot(snapshot)`
2. `initialData = baselineSnapshot.editor_feature_collection || EMPTY_FEATURE_COLLECTION`
3. `snapshotEntities = baselineSnapshot.entities || []`
4. `snapshotWikis = baselineSnapshot.wikis || []`
5. `snapshotEntityWikiLinks = baselineSnapshot.entity_wiki || []`

Riêng về GEO/GEO_ENT khi load:

- `baselineSnapshot.editor_feature_collection` là dữ liệu map gốc đưa vào `initialData`.
- `normalizeEditorSnapshot()` sẽ **rehydrate** `feature.properties.entity_ids/entity_id` từ `snapshot.geometry_entity[]` (hoặc legacy `link_scopes`) để UI bind entity hoạt động.
  - Lưu ý: đây là rehydrate phục vụ editor UX, **không phải** dữ liệu persist chính thức trên `feature.properties` trong snapshot.

Điểm mấu chốt: **toEditorSessionSnapshot() reset operation** để snapshot trở thành “baseline state”:

- entities/wikis -> `"reference"`
- entity_wiki active -> `"binding"`

### 3.2 Commit session -> snapshot_json

Luồng: `commitSection()` -> `buildEditorSnapshot({ draft, changes, snapshotEntities, snapshotWikis, snapshotEntityWikiLinks, previousSnapshot: baselineSnapshot })`

`buildEditorSnapshot()` sẽ tạo:

- `editor_feature_collection` (draft đã strip các field denormalized)
- `geometries[]` (create/update/delete dựa trên changes + previousSnapshot)
- `geometry_entity[]` (join table từ feature.properties.entity_ids)
- `entities[]` (từ snapshotEntities + carry-forward inline + ensure entities referenced by joins)
- `wikis[]` (từ snapshotWikis, tương tự)
- `entity_wiki[]` (từ snapshotEntityWikiLinks, đã dedupe/sort)

Sau khi commit thành công:

- `baselineSnapshot` cập nhật = `toEditorSessionSnapshot(snapshot)` của commit mới
- snapshot stores cập nhật theo baseline mới (operation reset về `"reference"/"binding"`)

### 3.3 Reload trang -> mất local state

Khi reload:

- Toàn bộ React state reset
- App sẽ load lại snapshot từ backend (head commit)
- Các thứ bạn “tạo/sửa” chỉ còn lại nếu đã nằm trong commit snapshot

Vì vậy:

- Entity/Wiki/Link/Geometry muốn “không mất” phải đi qua **Commit**.
- Các state UI (selected geo, search results, form đang nhập) sẽ mất.

---

## 4) GEO Search (`/geometries/entity`) và tác động lên local store

Search GEO gọi:

`GET /geometries/entity?name=<keyword>&limit=<n>`

Khi bấm **Import** một geometry từ kết quả search:

1. Giữ nguyên `timelineFilterEnabled`; geometry import vẫn tuân theo filter năm hiện tại.
2. Add entity tương ứng vào:
   - `snapshotEntities` (source:"ref", operation:"reference")
   - `entityCatalog` (để UI có name/description)
3. Nếu geometry chưa có trong `editor.draft`:
   - tạo `Feature` mới với `id = geometry.id`
   - set `properties.type` từ `geo_type` (map qua `geoTypeCodeToTypeKey`)
   - set `time_start/time_end/binding`
   - set denormalized `entity_id/entity_ids/entity_name/entity_names` để UI/joins hoạt động
4. `editor.createFeature(feature)` và auto select feature đó.

Lưu ý: Import geo tạo ra “create change” trong editor session, nên sẽ đi vào commit snapshot.

---

## 4.1 Nhìn nhanh “5 dataset nằm ở đâu” trong session

- GEO:
  - Runtime store: `editor.draft.features[]`
  - Persisted on commit: `snapshot_json.geometries[]` (build khi commit)

- ENT:
  - Runtime store (snapshot): `snapshotEntities`
  - Persisted on commit: `snapshot_json.entities[]`

- WIKI:
  - Runtime store (snapshot): `snapshotWikis`
  - Persisted on commit: `snapshot_json.wikis[]`

- ENT_WIKI:
  - Runtime store (snapshot): `snapshotEntityWikiLinks`
  - Persisted on commit: `snapshot_json.entity_wiki[]`

- GEO_ENT:
  - Runtime store: denormalized tạm thời trên `editor.draft.features[].properties.entity_ids` (để UI chạy)
  - Persisted on commit: `snapshot_json.geometry_entity[]` (build khi commit)

---

## 5) Checklist khi debug “mất dữ liệu”

1. Dữ liệu có nằm trong `snapshotEntities/snapshotWikis/snapshotEntityWikiLinks/editor.draft` không?
2. Có bấm **Commit** chưa?
3. `pendingSaveCount` có > 0 không (Commit button có enable không)?
4. Khi reload, snapshot head commit load lên có chứa các rows đó không?
5. Nếu entity tạo mới bị mất:
  - kiểm tra commit snapshot có `entities[].source:"inline"` không
  - nếu có mà reload vẫn mất, kiểm tra `normalizeEditorSnapshot()` có parse đúng không

---

## 6) File/entrypoints liên quan

- Session stores:
  - `FrontEndUser/src/uhm/lib/useEditorSessionState.ts`
  - `FrontEndUser/src/uhm/lib/editor/session/useEntitySessionState.ts`
  - `FrontEndUser/src/uhm/lib/editor/session/useWikiSessionState.ts`
  - `FrontEndUser/src/uhm/lib/editor/session/useSectionSessionState.ts`

- Geometry editor core:
  - `FrontEndUser/src/uhm/lib/useEditorState.ts`

- Snapshot normalization + build snapshot:
  - `FrontEndUser/src/uhm/lib/editor/snapshot/editorSnapshot.ts`

- Open/commit/restore commands:
  - `FrontEndUser/src/uhm/lib/editor/section/useSectionCommands.ts`

- Page wiring / UI state:
  - `FrontEndUser/src/app/editor/[id]/page.tsx`
