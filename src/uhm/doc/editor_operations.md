# UHM Editor - ma trận thao tác

Cập nhật: 2026-05-22.

Tài liệu này là checklist thao tác cho editor ở `/editor/[id]`. Mục tiêu là trả lời nhanh 4 câu hỏi khi thêm hoặc audit một tính năng:

- Người dùng thao tác ở đâu?
- State nào bị đổi?
- Có cần undo không, undo đang dùng action nào?
- Commit snapshot có bị ảnh hưởng không?

Nguồn chính:

- `src/app/editor/[id]/page.tsx`
- `src/app/editor/[id]/featureCommands.ts`
- `src/uhm/lib/editor/state/useEditorState.ts`
- `src/uhm/lib/editor/project/useProjectCommands.ts`
- `src/uhm/lib/editor/snapshot/editorSnapshot.ts`

## 1. Quy ước phân loại

### Cần undo

Một thao tác cần undo nếu nó đổi dữ liệu sẽ đi vào commit snapshot hoặc đổi draft geometry chính:

- `mainDraft.features`
- `snapshotEntityRows`
- `snapshotWikis`
- `snapshotEntityWikiLinks`
- `replays`
- `activeReplayDraft.detail`

### Không cần undo

Một thao tác không cần undo nếu nó chỉ đổi trạng thái xem/điều hướng tạm thời:

- `mode`
- selection/focus/hover
- timeline year/filter UI
- background layer visibility
- geometry visibility local
- image trace overlay
- resize panel
- search query/result
- status message

### Undo action hiện có

| Action | Phạm vi | Ý nghĩa |
| --- | --- | --- |
| `create` | main draft | Gỡ geometry vừa tạo |
| `delete` | main draft | Khôi phục geometry đã xóa, có `index` để trả về vị trí cũ |
| `update` | main draft | Khôi phục `geometry` trước khi sửa vertex/circle |
| `properties` | main draft | Khôi phục `feature.properties` trước khi patch |
| `snapshot_entities` | snapshot | Khôi phục collection entity snapshot |
| `snapshot_wikis` | snapshot | Khôi phục collection wiki snapshot |
| `snapshot_entity_wiki` | snapshot | Khôi phục collection entity-wiki snapshot |
| `replay` | replay | Khôi phục một replay theo geometry id |
| `replays` | replay collection | Khôi phục toàn bộ `replays[]` |
| `replay_session` | replay mode | Khôi phục `activeReplayDraft` trong phiên replay |
| `group` | tổng hợp | Gom nhiều undo action thành một thao tác logic |

## 2. Geometry draft

| Thao tác | Entry point | State đổi | Undo | Snapshot/commit | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Vẽ polygon | `draw` mode, map drawing engine | Thêm feature vào `mainDraft` | `create` | `geometries[]`, `geometry_entity[]` nếu sau đó bind entity | Feature mới mặc định `type: country`, `geometry_preset: polygon`, chưa có entity |
| Tạo point | `add-point` mode | Thêm feature vào `mainDraft` | `create` | Như trên | Mặc định `type: city`, `geometry_preset: point` |
| Vẽ line | `add-line` mode | Thêm feature vào `mainDraft` | `create` | Như trên | Mặc định `type: defense_line`, `geometry_preset: line` |
| Vẽ path/route | `add-path` mode | Thêm feature vào `mainDraft` | `create` | Như trên | Mặc định `type: attack_route`, render thêm arrow layer |
| Vẽ circle | `add-circle` mode | Thêm polygon có `circle_center`, `circle_radius` | `create` | Như trên | Mặc định `type: war`, `geometry_preset: circle-area` |
| Import GEO từ search | Search `geo`, nút import | Thêm feature vào `mainDraft`, thêm entity ref nếu thiếu | `group` gồm `snapshot_entities` và `create` khi cả hai đổi | `geometries[]` và entity ref | Giữ nguyên timeline filter hiện tại |
| Chọn geometry | Click map/panel | `selectedFeatureIds` | Không | Không | Chỉ là UI state |
| Focus geometry từ panel | `GeometryBindingPanel` row click | Selection, `geometryFocusRequest`, có thể kéo timeline draft year về `time_start` | Không | Không | Không đổi dữ liệu commit |
| Sửa vertex/circle | Map edit engine trong `select` | `feature.geometry` | `update` | `geometries[]` | Không hoạt động trong replay mode |
| Sửa type/time metadata | `SelectedGeometryPanel` apply | `feature.properties.type/time_start/time_end/geometry_preset` | `properties` hoặc `group` khi multi-select | `geometries[]` | Validate time parse được và `time_start <= time_end` |
| Xóa một geometry | Map delete hoặc selected panel | Xóa feature khỏi `mainDraft` | `delete`, có thể group với `replays` | `geometries[]`, `geometry_entity[]` delete delta | Prune replay/target ids liên quan geometry bị xóa |
| Xóa nhiều geometry | Bulk selected panel/map callback | Xóa nhiều feature | `group` nhiều `delete`, có thể kèm `replays` | Như trên | Undo khôi phục theo index cũ |
| Ẩn/hiện geometry local | Eye button, map hide callback | `geometryVisibility` | Không | Không | Local UI only, không đi snapshot |
| Geometry status panel | `GeometryBindingPanel` | Derived từ draft/timeline/visibility | Không | Không | Hiện `no entity`, `no time`, `partial time`, `timeline`, `out timeline`, `hidden`, `bound`, `new`; ID chỉ nằm trong tooltip |

## 3. Geometry binding

| Thao tác | Entry point | State đổi | Undo | Snapshot/commit | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Bind entity vào selected geometry | `ProjectEntityRefsPanel` checkbox | `entity_id`, `entity_ids`, `entity_name`, `entity_names` trên selected features | `properties` hoặc `group` | `geometry_entity[]` | Multi-select chỉ hợp lệ khi cùng shape type |
| Unbind entity | `ProjectEntityRefsPanel` checkbox | Các field entity trên feature | `properties` hoặc `group` | `geometry_entity[]` delete delta nếu baseline có link | Commit/submit chặn geometry không còn entity |
| Bind geometry-geometry | `GeometryBindingPanel` lock button | `feature.properties.binding` | `properties` hoặc `group` | `geometries[].binding` | Binding geometry không thay thế entity binding |
| Unbind geometry-geometry | `GeometryBindingPanel` unlock button | `feature.properties.binding` | `properties` hoặc `group` | `geometries[].binding` | Không ảnh hưởng `geometry_entity[]` |
| Bind nhiều geometry vào target | Map bind callback | `binding` của target geometry | `properties` | `geometries[].binding` | Tự bỏ target id khỏi source ids |
| Toggle binding filter | `GeometryBindingPanel` filter checkbox | `geometryBindingFilterEnabled` | Không | Không | Chỉ lọc hiển thị map theo selection/binding |

## 4. Entity snapshot

| Thao tác | Entry point | State đổi | Undo | Snapshot/commit | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Add entity ref từ search | Search `entity`, nút add | `snapshotEntityRows`, `entityCatalog` | `snapshot_entities` nếu collection đổi | `entities[]` với `source: ref`, `operation: reference` | Không gọi API create entity |
| Tạo entity local | `ProjectEntityRefsPanel` create form | `snapshotEntityRows`, `entityCatalog`, reset form | `snapshot_entities` | `entities[]` với `source: inline`, `operation: create` | Validate name bắt buộc, không trùng tên, time hợp lệ |
| Sửa entity trong project | Entity row edit | `snapshotEntityRows` | `snapshot_entities` | `entities[]` update/reference theo source | Validate name và time |
| Copy selected geometry time vào form entity | Entity panel button | Form state | Không | Không | Chỉ tiện ích UI |

## 5. Wiki và entity-wiki

| Thao tác | Entry point | State đổi | Undo | Snapshot/commit | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Add wiki ref từ search | Search `wiki`, nút add | `snapshotWikis`, active wiki request | `snapshot_wikis` nếu collection đổi | `wikis[]` với `source: ref`, `operation: reference` | Không fetch lại toàn bộ project |
| Tạo/sửa wiki local | `WikiSidebarPanel` | `snapshotWikis` | `snapshot_wikis` | `wikis[]` | `doc` ưu tiên HTML string, plaintext là fallback |
| Import HTML vào wiki | `WikiSidebarPanel` import | `snapshotWikis` sau khi lưu | `snapshot_wikis` | `wikis[]` | File import không tự commit |
| Export wiki | `WikiSidebarPanel` export | Không đổi editor state | Không | Không | Tạo file tải xuống phía browser |
| Xóa wiki khỏi snapshot | `WikiSidebarPanel` remove | `snapshotWikis` và các `snapshotEntityWikiLinks` trỏ tới wiki | `group` gồm `snapshot_wikis` và `snapshot_entity_wiki` | `wikis[]`, `entity_wiki[]` delta | Đây là thao tác kép, phải undo cùng nhau |
| Bind entity-wiki | `EntityWikiBindingsPanel` | `snapshotEntityWikiLinks` | `snapshot_entity_wiki` | `entity_wiki[]` với `binding` hoặc `reference` theo baseline | Link mới dùng `operation: binding` |
| Unbind entity-wiki | `EntityWikiBindingsPanel` | `snapshotEntityWikiLinks` | `snapshot_entity_wiki` | `entity_wiki[]` delete delta nếu baseline có link | Runtime chỉ remove row, snapshot builder sinh delta |
| Chèn wiki link trong editor Quill | Wiki toolbar custom link | `doc` của wiki đang sửa | `snapshot_wikis` khi lưu wiki | `wikis[].doc` | Link có thể là slug local/global hoặc marker `__missing__` |

## 6. Replay

| Thao tác | Entry point | State đổi | Undo | Snapshot/commit | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Vào replay mode | Selected geometry panel, replay button | `mode`, `activeReplayId`, `activeReplayDraft`, `replayDraft` | Không cho việc mở mode | Không trực tiếp | Nếu đổi replay đang mở, session cũ được flush |
| Tạo seed replay | `switchReplayContext` | `activeReplayDraft` với `geometry_id`, `target_geometry_ids`, `detail` | Không ngay lúc seed | `replays[]` khi mutate/flush | MAIN geo luôn đứng đầu target list |
| Sửa replay detail | `ReplayTimelineSidebar`, `ReplayEffectsSidebar` | `activeReplayDraft.detail` | `replay_session` | `replays[].detail` qua `effectiveReplays` | Replay mode không mutate geometry |
| Undo trong replay mode | Undo button khi `mode === replay` | `activeReplayDraft` | Pop `replayUndoStack` | Có nếu session còn dirty | Undo chính và undo replay tách stack |
| Thoát/chuyển replay | Exit hoặc đổi context | Flush `activeReplayDraft` vào `replays[]` | `replay` nếu flush có đổi | `replays[]` | Commit đọc `effectiveReplays`, nên không cần thoát replay trước commit |
| Xóa geometry có replay | Delete geometry | `mainDraft`, có thể prune `replays[]` | `group` với `replays` | `geometries[]`, `replays[]` | Target ids bị xóa cũng được prune |
| Preview replay | Preview overlay | Preview session, hidden ids, preview year | Không | Không | Chỉ là mô phỏng UI/map |

## 7. Timeline, map style và panel status

| Thao tác | State đổi | Undo | Commit | Ghi chú |
| --- | --- | --- | --- | --- |
| Đổi timeline year | `timelineDraftYear` | Không | Không | Client-side filter |
| Bật/tắt timeline filter | `timelineFilterEnabled` | Không | Không | Áp dụng cho cả geometry mới trong session |
| Geometry bị timeline lọc | Derived `mapRenderDraft` | Không | Không | Panel hiện `timeline` hoặc `out timeline`; selection/panel metadata vẫn đọc `editor.draft` |
| Geometry mồ côi | Derived từ `normalizeFeatureEntityIds(feature).length === 0` | Không riêng | Commit/submit bị chặn | Map không đổi màu riêng cho orphan; panel hiện `no entity` |
| Thiếu time | Derived từ `time_start/time_end` | Không riêng | Vẫn commit được | Panel hiện `no time` hoặc `partial time` |
| Selected style trên map | Feature-state selected | Không | Không | Vẫn giữ highlight selected màu xanh |
| Background layer visibility | `backgroundVisibility`, localStorage | Không | Không | UI preference |

## 8. Image overlay trace

| Thao tác | State đổi | Undo | Commit | Ghi chú |
| --- | --- | --- | --- | --- |
| Pick image overlay | `imageOverlay`, object URL | Không | Không | Overlay để trace, không vào snapshot |
| Paste image overlay | `imageOverlay`, object URL | Không | Không | Cần browser clipboard permission |
| Đổi opacity | `imageOverlay.opacity` | Không | Không | UI only |
| Dời/scale bằng keyboard | `imageOverlay.coordinates` | Không | Không | UI only |
| Remove overlay | `imageOverlay = null`, revoke URL | Không | Không | Không ảnh hưởng draft |

## 9. Project lifecycle

| Thao tác | Entry point | State đổi | Undo | Snapshot/API | Validation |
| --- | --- | --- | --- | --- | --- |
| Mở project | Project panel/open route | Reset session state, `baselineFeatureCollection`, baseline snapshot | Không | Fetch project/commit snapshot | Nếu có pending changes khi đổi project thì confirm bỏ thay đổi |
| Tạo project mới | Project panel | Project list, active project, baseline empty | Không | API create project | Title bắt buộc |
| Commit | `CommitPanel` | Baseline snapshot, `baselineFeatureCollection`, clear undo/changes | Không undo sau commit | `createProjectCommit` với `buildEditorSnapshot` | Chặn nếu không có thay đổi, chặn orphan geometry, guard payload lớn |
| Submit | Submit modal | Submission status | Không | `submitSection` | Chỉ submit khi không pending save và không orphan geometry |
| Restore commit | Commit history | Reset draft/snapshot/session theo commit | Không | Fetch/convert commit snapshot | Chặn nếu còn pending changes; không đổi head trên BE |
| Delete pending submission lock | Banner unlock | `blockedPendingSubmissionId`, mở lại project | Không | `deleteSubmission` | Dùng khi backend báo project đang bị pending submission khóa |

## 10. Undo coverage checklist

Khi thêm một thao tác mới, kiểm theo thứ tự này:

1. Thao tác có đổi `mainDraft`, snapshot collection hoặc replay detail không?
2. Nếu có, nó phải đi qua một trong các API undoable:
   - `editor.createFeature`
   - `editor.createFeatureWithSnapshotEntityRows`
   - `editor.updateFeature`
   - `editor.deleteFeature` hoặc `editor.deleteFeatures`
   - `editor.patchFeatureProperties` hoặc `editor.patchFeaturePropertiesBatch`
   - `editor.setSnapshotEntityRows`
   - `editor.setSnapshotWikis`
   - `editor.setSnapshotEntityWikiLinks`
   - `editor.setSnapshotWikisAndEntityWikiLinks`
   - `editor.mutateActiveReplay`
3. Nếu thao tác đổi nhiều vùng state trong cùng một ý nghĩa người dùng, dùng `group`.
4. Nếu xóa geometry, kiểm replay target/replay collection có cần prune không.
5. Nếu xóa wiki, kiểm entity-wiki links trỏ tới wiki đó có cần xóa cùng undo không.
6. Nếu thao tác có thể tạo geometry không entity, commit/submit guard vẫn phải bắt được.
7. Nếu thao tác chỉ đổi UI view/filter/focus, ghi rõ là không undo và không snapshot.

## 11. Snapshot checklist

Khi một thao tác cần đi vào commit, kiểm output snapshot:

- Geometry body nằm trong `geometries[]`.
- Geometry-entity relation nằm trong `geometry_entity[]`, không chỉ trong `feature.properties.entity_ids`.
- Entity rows nằm trong `entities[]`.
- Wiki rows nằm trong `wikis[]`.
- Entity-wiki rows nằm trong `entity_wiki[]`.
- Replay script nằm trong `replays[]`, không lưu `replayDraft`.
- Generate-only fields trên feature như `entity_id`, `entity_ids`, `entity_name`, `entity_names`, `entity_label_candidates`, `time_start`, `time_end`, `binding`, `type` được snapshot builder xử lý/loại bỏ đúng chỗ trước API payload.

## 12. Các thao tác cần audit lại nếu editor đổi lớn

- Multi-select khác shape hiện bị chặn ở bind entity/geometry, nhưng selected panel vẫn phải giữ rule này nếu thêm action mới.
- Timeline filter đang là client-side, nếu sau này fetch theo timeline từ backend thì `timelineStatus` trong panel cần đổi nguồn truth.
- Image overlay hiện không persist. Nếu cần lưu overlay vào project, phải thêm snapshot schema và undo.
- Background visibility hiện là localStorage. Nếu cần lưu theo project/user, phải tách khỏi nhóm UI-only.
- Replay mode hiện không mutate geometry. Nếu cho sửa geometry trong replay, phải thiết kế lại undo và commit boundary.
