import type { EntitySnapshot } from "@/uhm/types/entities";
import type { FeatureCollection, GeometryEntitySnapshot, GeometrySnapshot } from "@/uhm/types/geo";
import type { WikiSnapshot } from "@/uhm/types/wiki";

export type EntityWikiLinkSnapshot = {
    entity_id: string;
    wiki_id: string;
    // Relationship semantics (entity ↔ wiki).
    // - reference/binding: the link exists (assigned)
    // - delete: the link is removed
    operation?: "reference" | "binding" | "delete";
};

// BackEndGo uses Projects/Commits/Submissions. "Project" is legacy naming in FE.
export type ProjectStatus = string;
export type ProjectSubmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

// BackEndGo (new): project response includes submissions as a lightweight list.
export type SubmissionSimpleResponse = {
    id: string;
    status: ProjectSubmissionStatus;
};

export type ProjectState = {
    // Derived state from ProjectResponse (not persisted as-is in API mới).
    status: ProjectStatus;
    head_commit_id: string | null;
    locked_by?: string | null;
};

export type Project = {
    id: string;
    title: string;
    description: string | null;
    project_status?: string;
    latest_commit_id?: string | null;
    // Legacy (old BE): submission_ids?: string[]
    // New BE: submissions?: [{id,status}]
    submission_ids?: string[];
    submissions?: SubmissionSimpleResponse[];
    locked_by?: string | null;
    user_id?: string;
    created_at?: string;
    updated_at?: string;
    state?: {
        status?: string;
    };
};

export type ProjectCommit = {
    id: string;
    project_id: string;
    snapshot_json: EditorSnapshot;
    snapshot_hash: string;
    user_id: string;
    edit_summary: string;
    created_at?: string;
};

export type ProjectSubmission = {
    id: string;
    project_id: string;
    commit_id: string;
    user_id: string;
    created_at?: string;
    status: ProjectSubmissionStatus;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    review_note?: string | null;
    content?: string | null;
};

export type EditorSnapshot = {
    // Legacy: before BEGo flow moved fully to project/commit records, FE stored a minimal "project" ref
    // inside snapshot_json. New snapshots omit this entirely.
    project?: {
        id: string;
        title: string;
    };
    editor_feature_collection?: FeatureCollection;
    entities?: EntitySnapshot[];
    geometries?: GeometrySnapshot[];
    // Join table geometry ↔ entity (many-to-many).
    geometry_entity?: GeometryEntitySnapshot[];
    wikis?: WikiSnapshot[];
    entity_wiki?: EntityWikiLinkSnapshot[];
    replays?: BattleReplay[];
};

// ---- Replay / Scripting System ----

export type UIFunctionName =
    | "hide_timeline"            // Ẩn thanh timeline
    | "hide_layer_panel"         // Ẩn panel lớp bản đồ
    | "hide_wiki_panel"          // Ẩn panel wiki (bên phải)
    | "hide_zoom_panel"          // Ẩn các nút điều khiển zoom
    | "hide_all_UI"              // Ẩn toàn bộ giao diện điều khiển (cinematic mode)
    | "open_wiki"                // Mở panel wiki
    | "show_toast_message"       // Hiển thị thông báo ngắn (toast)
    | "focus_wiki_header"        // Cuộn đến đề mục cụ thể trong Wiki
    | "set_playback_speed";      // Thay đổi tốc độ phát replay

export type MapFunctionName =
    | "zoom_to_lnglat"           // Di chuyển camera đến tọa độ [lng, lat]
    | "zoom_scale"               // Thay đổi mức zoom của bản đồ
    | "zoom_geometries"          // Zoom bao quát danh sách các geometry
    | "change_geometry_color"    // Thay đổi màu của một geometry
    | "change_geometries_color"  // Thay đổi màu của danh sách geometry
    | "change_geometry_texture"  // Thay đổi texture của một geometry
    | "change_geometries_texture"// Thay đổi texture của danh sách geometry
    | "hide_geometries"          // Ẩn danh sách các geometry
    | "set_camera_view"          // Đặt trạng thái camera (center, zoom, pitch, bearing)
    | "fly_to_geometry"          // Di chuyển mượt mà đến một geometry
    | "rotate_around_point"      // Xoay camera quanh một điểm
    | "pulse_geometry"           // Hiệu ứng nhấp nháy cho geometry
    | "set_time_filter"          // Thay đổi bộ lọc thời gian trên bản đồ
    | "toggle_labels";           // Bật/tắt hiển thị nhãn (labels) trên bản đồ

export type NarrativeFunctionName =
    | "set_title"                // Đặt tiêu đề cho bước replay
    | "set_descriptions"         // Đặt mô tả/nội dung diễn giải
    | "show_dialog_box"          // Hiển thị hộp thoại dẫn chuyện (có avatar)
    | "display_historical_image" // Hiển thị hình ảnh tư liệu đè lên bản đồ
    | "set_step_subtitle";       // Hiển thị phụ đề phía dưới màn hình

export type ReplayAction<T> = {
    function_name: T;
    params: any[];
};

export type ReplayStep = {
    duration: number; // Trọng số thời gian của step trong 1 stage
    use_UI_function: ReplayAction<UIFunctionName>[];
    use_map_function: ReplayAction<MapFunctionName>[];
    use_narrow_function: ReplayAction<NarrativeFunctionName>[];
};

export type ReplayStage = {
    id: number; // số đếm thứ tự từ 0
    title?: string;
    detail_time_start: string;
    detail_time_stop: string;
    steps: ReplayStep[];
};

export type BattleReplay = {
    geometry_id: string; // geometry mà khi nhấn vào là có thể replay
    detail: ReplayStage[];
    // Local-only: separate draft for this specific replay
    replay_features?: FeatureCollection;
};


// Alias for clearer naming at API boundary: commits.snapshot_json is this shape.
export type CommitSnapshot = EditorSnapshot;

export type EditorLoadResponse = {
    project: Project;
    state: ProjectState;
    commit: ProjectCommit | null;
    snapshot: EditorSnapshot | null;
};

export type CreateProjectInput = {
    title: string;
    description?: string | null;
    status?: "PRIVATE" | "PUBLIC" | "ARCHIVE";
};

export type CreateCommitInput = {
    snapshot: EditorSnapshot;
    edit_summary: string;
};

export type RestoreCommitInput = {
    commit_id: string;
};

