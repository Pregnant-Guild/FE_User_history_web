# UHM Editor - state và vòng đời dữ liệu

Tài liệu này mô tả state thật đang được dùng bởi editor hiện tại.
Entry point chính là `useEditorSessionState()` và `useEditorState()`.

## 1. Hai lớp state chính

Editor đang tách làm hai khối:

- `useEditorSessionState()`
  - state UI, session, form, project, timeline, background, wiki
- `useEditorState(initialData, snapshotUndo)`
  - state draft hình học, diff và undo

Nói ngắn gọn:

- `session state` quyết định editor đang nhìn cái gì và panel đang thao tác gì
- `editor state` quyết định geometry nào đang tồn tại trong draft và khác baseline ra sao

## 2. State geometry trung tâm

### `initialData`

- Nằm ở `useEditorSessionState()`
- Là `FeatureCollection` đang được nạp vào editor khi mở project hoặc restore commit
- Khi thay đổi, `useEditorState()` sẽ reset toàn bộ draft và baseline tương ứng

### `draft`

- Nằm trong `useEditorState()`
- Là nguồn dữ liệu render trực tiếp cho `Map`
- Mọi thao tác create/update/delete geometry đều đi qua đây

### `draftRef`

- Bản ref của `draft`
- Được dùng trong event handlers của map engine để luôn đọc được state mới nhất mà không phải rebind callback liên tục

### `initialMapRef`

- `Map<featureId, Feature>` tạo từ `initialData`
- Là baseline để tính diff giữa draft hiện tại và dữ liệu gốc của session

### `changes`

- Kết quả `diffDraftToInitial(draft, initialMapRef.current)`
- Map theo `feature.properties.id`
- Mỗi phần tử có thể là:
  - `create`
  - `update`
  - `delete`

Lưu ý: diff hiện chỉ là cơ chế nhận biết geometry nào đã thay đổi so với baseline. Snapshot commit thực tế vẫn được build từ toàn bộ `draft` cộng với các snapshot bảng phụ.

### `changeCount`

- Số lượng geometry thay đổi hiện tại
- Được cộng thêm dirty state của wiki/entity/entity-wiki để tạo `pendingSaveCount`

## 3. Undo state

Undo được quản lý bởi `useUndoStack()`.

Kiểu action hiện có:

- `create`
- `delete`
- `update`
- `properties`
- `snapshot_entities`
- `snapshot_wikis`
- `snapshot_entity_wiki`
- `group`

Ý nghĩa:

- geometry create/delete/update/properties undo được trực tiếp trên `draft`
- snapshot entity/wiki/link undo được apply qua `snapshotUndo` API truyền vào `useEditorState`
- `group` dùng để gom nhiều thay đổi thành một thao tác undo logic

Editor hiện có `undo`, nhưng chưa có redo.

## 4. Session state theo nhóm

### 4.1. Mode và selection

- `mode: EditorMode`
- `selectedFeatureIds`
- `selectedGeometryEntityIds`

`selectedFeatureIds` là state gốc cho:

- panel metadata geometry
- bind entity
- bind geometry
- focus geometry từ search/binding panel

### 4.2. Form state

- `entityForm`
  - dùng cho form tạo entity local
- `geometryMetaForm`
  - `type_key`
  - `time_start`
  - `time_end`
  - `binding`

`geometryMetaForm.binding` hiện chủ yếu là giá trị hiển thị/đồng bộ UI, còn chỉnh sửa binding thật đi qua `GeometryBindingPanel`.

### 4.3. Project/session task state

`useProjectSessionState()` gom các cờ async vào một state machine nhỏ:

- `sectionTask: "idle" | "saving" | "submitting" | "opening-project"`

Từ đó sinh ra:

- `isSaving`
- `isSubmitting`
- `isOpeningSection`

Ngoài ra còn có:

- `activeSection`
- `projectState`
- `sectionCommits`
- `baselineSnapshot`
- `commitTitle`

### 4.4. Timeline state

`useTimelineState()` giữ:

- `timelineYear`
- `timelineDraftYear`
- `isTimelineLoading`
- `timelineStatus`

Trong page hiện tại, timeline filter đang dùng `timelineDraftYear`.
Không có fetch dữ liệu project theo `timelineYear`; timeline đang là client-side visibility filter.

### 4.5. Background/session UI

`useBackgroundSessionState()` giữ:

- `backgroundVisibility`
- `isBackgroundVisibilityReady`

Giá trị thật được load từ `localStorage` key `uhm.backgroundLayerVisibility.v1`.

### 4.6. Wiki/session state

`useWikiSessionState()` giữ:

- `snapshotWikis`
- `snapshotEntityWikiLinks`

Đây là single source of truth cho phần wiki trong snapshot commit.

## 5. Snapshot state

Editor đang làm việc với 3 snapshot collection chính ngoài geometry:

- `snapshotEntities`
- `snapshotWikis`
- `snapshotEntityWikiLinks`

Chúng đại diện cho "current session snapshot", không phải danh sách delta thô.

Ví dụ:

- entity ref được giữ bằng `operation: "reference"`
- entity/wiki local mới tạo có thể mang `operation: "create"`
- link entity-wiki mới tạo dùng `operation: "binding"`

Khi commit, `buildEditorSnapshot()` sẽ so với `baselineSnapshot` để chuyển các collection này thành snapshot đúng semantic cho backend.

## 6. Baseline snapshot là gì

`baselineSnapshot` là snapshot đang được xem như gốc của session hiện tại.

Nó được cập nhật khi:

- mở project
- commit thành công
- restore từ một commit

`baselineSnapshot` được dùng để:

- biết link nào là `reference`, link nào là `binding`, link nào là `delete`
- biết wiki/entity nào là thay đổi thực sự so với snapshot trước
- giữ lại inline entity/wiki từ snapshot trước nếu user chưa xóa chúng

## 7. Derived state quan trọng trong page

### `timelineVisibleDraft`

- là `draft` đã qua filter timeline nếu `timelineFilterEnabled = true`
- geometry mới tạo trong session không bị timeline filter ẩn

### `snapshotEntitiesVisible`

- loại bỏ các row `delete`
- dedupe theo `id`

### `selectedFeatures`

- map từ `selectedFeatureIds` sang feature thật trong `editor.draft.features`

### `isMultiEditValid`

- chỉ `true` khi tất cả geometry đang chọn cùng `geometry.type`
- một số thao tác bind sẽ chặn nếu giá trị này là `false`

### `pendingSaveCount`

Được tính như sau:

- `editor.changeCount`
- `+1` nếu wiki dirty
- `+1` nếu entities dirty
- `+1` nếu entity-wiki dirty

Đây là con số dùng trong UI commit, không phải số record backend chắc chắn sẽ thay đổi.

## 8. Dirty detection

Dirty check của:

- `snapshotWikis`
- `snapshotEntities`
- `snapshotEntityWikiLinks`

đều đang làm bằng cách normalize trước rồi so `JSON.stringify`.

Điều này đủ thực dụng cho snapshot cỡ vừa, nhưng cần lưu ý:

- không tối ưu cho dữ liệu rất lớn
- phụ thuộc vào tính ổn định của thứ tự mảng sau normalize

## 9. State được persist vào localStorage

Hiện editor chỉ persist hai nhóm nhỏ:

- background layer visibility
  - key: `uhm.backgroundLayerVisibility.v1`
- map projection
  - key: `uhm:mapProjection`

Editor hiện không persist toàn bộ draft/project snapshot vào localStorage.
Nếu cần autosave local draft, đó là tính năng phải làm thêm, không phải behavior hiện tại.

## 10. Khi nào state bị reset

### Reset toàn phần

Xảy ra khi:

- mở project khác
- mở lại project
- restore commit

Hiệu ứng:

- `initialData` đổi
- `useEditorState()` reset `draft`
- `undoStack` bị clear
- baseline map được build lại

### Reset cục bộ

- đổi selection có thể reset `geometryMetaForm`
- đóng/mở wiki modal không reset snapshot wiki, chỉ reset form local của modal

## 11. Một số giới hạn hiện tại cần nhớ khi đọc code

- có `undo`, chưa có `redo`
- timeline state có `timelineYear`, nhưng page hiện dùng `timelineDraftYear` cho filtering
- dirty count của commit không tương ứng một-một với số mutation backend
- map selection, binding filter và timeline filter đều là state client-side
