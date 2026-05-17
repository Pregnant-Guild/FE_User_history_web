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

export type UIOptionName =
    | "timeline"                 // Ẩn/hiện timeline
    | "layer_panel"              // Ẩn/hiện panel layer
    | "wiki_panel"               // Ẩn/hiện panel wiki
    | "zoom_panel"               // Ẩn/hiện nút zoom
    | "wiki"                     // Mở/chọn wiki
    | "toast"                    // Hiển thị toast
    | "wiki_header"              // Focus header trong wiki
    | "playback_speed";          // Thay đổi tốc độ phát replay

export type MapFunctionName =
    | "set_camera_view"          // Đặt trạng thái camera (center, zoom, pitch, bearing)
    | "set_time_filter"          // Thay đổi bộ lọc thời gian trên bản đồ
    | "enable_timeline_filter"   // Bật timeline filter
    | "disable_timeline_filter"  // Tắt timeline filter
    | "toggle_labels"            // Legacy: bật/tắt hiển thị nhãn (labels) trên bản đồ
    | "show_labels"              // Hiện labels
    | "hide_labels"              // Ẩn labels
    | "reset_camera_north";      // Đưa camera về hướng bắc

export type GeoFunctionName =
    | "fly_to_geometry"          // Legacy: di chuyển mượt mà đến một geometry
    | "fly_to_geometries"        // Di chuyển mượt mà đến một hoặc nhiều geometry
    | "set_geometry_visibility"  // Legacy: ẩn/hiện một hoặc nhiều geometry
    | "show_geometries"          // Hiện một hoặc nhiều geometry
    | "hide_geometries"          // Ẩn một hoặc nhiều geometry
    | "fit_to_geometries"        // Legacy: fit camera theo nhiều geometry
    | "orbit_camera_around_geometry" // Quay camera quanh một geometry
    | "pulse_geometry"           // Hiệu ứng pulse/emphasis cho geometry
    | "animate_dashed_border"    // Hiệu ứng border nét đứt chuyển động
    | "set_geometry_style"       // Đổi style trực tiếp của geometry
    | "show_geometry_label"      // Hiện label riêng cho geometry
    | "follow_geometry_path"     // Legacy: cho camera bám theo một path geometry
    | "follow_geometries_path"   // Cho camera bám theo chuỗi path geometry
    | "dim_other_geometries";    // Làm mờ các geometry ngoài target set

export type NarrativeFunctionName =
    | "set_title"                // Đặt tiêu đề cho bước replay
    | "set_descriptions"         // Đặt mô tả/nội dung diễn giải
    | "show_dialog_box"          // Hiển thị hộp thoại dẫn chuyện (có avatar)
    | "display_historical_image" // Hiển thị hình ảnh tư liệu đè lên bản đồ
    | "set_step_subtitle";       // Hiển thị phụ đề phía dưới màn hình

export type ReplayAction<T> = {
    function_name: T;
    params: unknown[];
};

export type ReplayStep = {
    duration: number; // Trọng số thời gian của step trong 1 stage
    use_UI_function: ReplayAction<UIOptionName>[];
    use_map_function: ReplayAction<MapFunctionName>[];
    use_geo_function: ReplayAction<GeoFunctionName>[];
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
    id: string; // mirror của geometry_id để đồng bộ schema chung
    geometry_id: string; // geometry mà khi nhấn vào là có thể replay
    target_geometry_ids: string[]; // tập geometry được đưa vào replay, phần tử đầu nên là MAIN geo
    detail: ReplayStage[];
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
