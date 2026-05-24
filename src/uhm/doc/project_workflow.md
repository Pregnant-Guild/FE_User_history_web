# UHM Editor - project workflow hiện tại

Tài liệu này mô tả đúng luồng project editor đang chạy ở frontend hiện tại.

## 1. Mở project

Editor vào từ route `/editor/[id]`.

Luồng mở project:

1. `fetchCurrentUser()` để chắc phiên đăng nhập còn hợp lệ.
2. `openSectionEditor(projectId)`:
   - gọi API project detail
   - gọi API commit list
   - lấy `latest_commit_id`
   - load `snapshot_json` của head commit nếu có
3. `normalizeEditorSnapshot()` để đưa snapshot về shape editor hiện tại.
4. `toEditorSessionSnapshot()` để chuyển snapshot thành session state:
   - entities
   - wikis
   - entity-wiki
   - feature collection đã rehydrate entity ids / names / metadata

Nếu project chưa có commit, editor mở với `EMPTY_FEATURE_COLLECTION`.

## 2. Rule khóa editor khi có pending submission

Backend mới chặn chỉnh sửa nếu project có submission `PENDING`.

Frontend xử lý như sau:

- `openSectionEditor()` ném `ApiError(409)` kèm `pending_submission_id`
- page editor bắt lỗi đó
- hiển thị màn hình lock riêng
- cho phép xóa submission pending để mở khóa

Trong trạng thái này:

- không vào map editor
- không commit
- không submit mới

## 3. Trạng thái project mà editor thực sự dùng

`ProjectState` đang được FE dùng gồm:

- `status`
- `head_commit_id`
- `locked_by`

Editor page không tự dựng đầy đủ workflow `Approved/Rejected` ở UI.
Phần nó thật sự quan tâm là:

- project có mở được không
- có `head_commit_id` để submit không
- có pending submission đang khóa project không

## 4. Vòng đời một phiên chỉnh sửa

### Bước 1: load baseline

- `baselineSnapshot` lấy từ head commit hoặc commit được restore
- `baselineFeatureCollection` lấy từ `baselineSnapshot.editor_feature_collection`
- `useEditorState()` reset draft và undo

### Bước 2: chỉnh sửa cục bộ

User có thể sửa:

- geometry
- entity snapshot
- wiki snapshot
- entity-wiki snapshot
- replay script

Tất cả thay đổi lúc này mới chỉ ở memory của frontend.

### Bước 3: commit

`commitSection()` chỉ chạy khi:

- đã mở được project
- `pendingSaveCount > 0`
- không còn orphan geometry

Luồng commit:

1. build geometry diff từ `editor.buildPayload()`
2. build snapshot đầy đủ bằng `buildEditorSnapshot(...)`
3. kiểm tra kích thước payload trước khi gửi
4. gọi `createProjectCommit(projectId, { snapshot, edit_summary })`
5. nếu thành công:
   - refresh `projectState`
   - refresh `sectionCommits`
   - cập nhật `baselineSnapshot`
   - set `baselineFeatureCollection = editor.mainDraft`
   - `editor.clearChanges()`
   - clear `commitTitle`

### Bước 4: submit

`submitCurrentSection(content)` chỉ chạy khi:

- project đang mở
- có `head_commit_id`
- `pendingSaveCount === 0`
- không còn orphan geometry

Frontend sẽ lấy latest commit từ project hiện tại rồi tạo submission mới.

## 5. Restore commit

Nút `Restore` trong `CommitHistoryPanel` hiện là restore phía frontend:

- chỉ chạy khi `pendingSaveCount === 0`
- tải commit list mới nhất
- lấy snapshot của commit được chọn
- normalize snapshot
- nạp lại vào editor state

Restore này:

- không gọi endpoint đổi head commit
- không thay đổi head trên backend
- chủ yếu để user tiếp tục edit từ snapshot cũ

Nói cách khác, đây là `load snapshot into editor`, không phải `server-side restore`.

## 6. Snapshot commit được build như thế nào

`buildEditorSnapshot()` nhận:

- `draft`
- `changes`
- `snapshotEntityRows`
- `snapshotWikis`
- `snapshotEntityWikiLinks`
- `effectiveReplays`
- `previousSnapshot`

và sinh ra:

- `editor_feature_collection`
- `entities`
- `geometries`
- `geometry_entity`
- `wikis`
- `entity_wiki`
- `replays`

Các điểm quan trọng:

- geometry many-to-many với entity được persist ở `geometry_entity[]`
- denormalized fields trên feature như `entity_ids`, `entity_name`, `bound_with`, `time_start` sẽ bị strip khỏi `editor_feature_collection` trước khi gửi API
- wiki/entity/link được chuẩn hóa lại thành `reference`, `binding`, `delete`, `create`, `update` tùy baseline
- replay script được persist ở `replays[]`; `replayDraft` không được gửi

## 7. Dirty state mà user nhìn thấy

Số ở nút `Commit` là `pendingSaveCount`.

Nó gồm:

- số geometry change thật
- cộng thêm 1 nếu entity dirty
- cộng thêm 1 nếu wiki dirty
- cộng thêm 1 nếu entity-wiki dirty
- cộng thêm 1 nếu replay dirty

Vì vậy:

- `Commit (3)` không có nghĩa là backend sẽ nhận đúng 3 record thay đổi
- nó là chỉ báo "có bao nhiêu nhóm thay đổi cần commit"

## 8. Những gì workflow hiện chưa làm

Editor hiện chưa có các behavior sau:

- autosave local draft toàn project
- collaborative locking nhiều user ở FE
- review UI cho `Approved/Rejected`
- restore head commit trên backend từ trang editor
- branch/merge nhiều phiên edit song song
