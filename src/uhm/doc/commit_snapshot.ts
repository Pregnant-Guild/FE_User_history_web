/**
 * Schema tham chiếu cho commit snapshot.
 *
 * Đây là file doc tự chứa, không import runtime types.
 * Mục tiêu là mô tả đúng shape dữ liệu hiện tại của editor/commit/replay
 * mà không phụ thuộc trực tiếp vào source code runtime.
 *
 * Ghi chú:
 * - Payload tạo commit hiện là `{ snapshot_json, edit_summary }`.
 * - `CommitSnapshot` hiện tương đương `EditorSnapshot`.
 * - Nhiều field root để optional vì frontend còn phải đọc snapshot cũ / partial.
 * - Replay actions trong dữ liệu thật dùng `params: unknown[]` theo positional tuple.
 * - Snapshot replay cũ còn `replay_features` sẽ được FE migrate sang `target_geometry_ids` khi load.
 * - Trước khi gửi API, frontend còn normalize thêm một số field, ví dụ
 *   `time_start/time_end` và `geometries[].type`.
 */

// ---- Root request ----

export type CreateCommitRequest = {
    snapshot_json: CommitSnapshot;
    edit_summary: string;
};

// ---- GeoJSON / FeatureCollection ----

export type GeometryPreset = "line" | "polygon" | "circle-area" | "point";

export type Geometry =
    | ({ type: "Point"; coordinates: [number, number] } & CircleGeometryMetadata)
    | ({ type: "MultiPoint"; coordinates: [number, number][] } & CircleGeometryMetadata)
    | ({ type: "LineString"; coordinates: [number, number][] } & CircleGeometryMetadata)
    | ({ type: "MultiLineString"; coordinates: [number, number][][] } & CircleGeometryMetadata)
    | ({ type: "Polygon"; coordinates: [number, number][][] } & CircleGeometryMetadata)
    | ({ type: "MultiPolygon"; coordinates: [number, number][][][] } & CircleGeometryMetadata);

export type CircleGeometryMetadata = {
    circle_center?: [number, number];
    circle_radius?: number;
};

export type FeatureId = string | number;

export type FeatureProperties = {
    id: FeatureId;
    type?: string | null;
    geometry_preset?: GeometryPreset | null;
    time_start?: number | null;
    time_end?: number | null;
    bound_with?: string | null;

    // UI/editor-only denormalized fields.
    entity_id?: string | null;
    entity_ids?: string[];
    entity_name?: string | null;
    entity_names?: string[];
    entity_label_candidates?: Array<{
        id: string;
        name: string;
        time_start?: number | null;
        time_end?: number | null;
    }>;
    entity_type_id?: string | null;
    point_label?: string | null;
    line_label?: string | null;
    polygon_label?: string | null;
};

export type Feature = {
    type: "Feature";
    properties: FeatureProperties;
    geometry: Geometry;
};

export type FeatureCollection = {
    type: "FeatureCollection";
    features: Feature[];
};

// ---- Snapshot rows ----

export type SnapshotSource = "inline" | "ref";
export type SnapshotOperation = "create" | "update" | "delete" | "reference";

export type EntitySnapshotOperation = SnapshotOperation;
export type GeometrySnapshotOperation = SnapshotOperation;
export type WikiSnapshotOperation = SnapshotOperation;

export type EntitySnapshot = {
    id: string;
    source: SnapshotSource;
    operation?: EntitySnapshotOperation;
    name?: string;
    description?: string | null;
    time_start?: number | null;
    time_end?: number | null;
};

export type GeometrySnapshot = {
    id: string;
    source: SnapshotSource;
    operation?: GeometrySnapshotOperation;
    type?: string | null;
    draw_geometry?: Geometry;
    geometry?: Geometry;
    bound_with?: string | null;
    time_start?: number | null;
    time_end?: number | null;
    bbox?: {
        min_lng: number;
        min_lat: number;
        max_lng: number;
        max_lat: number;
    } | null;
};

export type GeometryEntitySnapshot = {
    geometry_id: string;
    entity_id: string;
    operation?: "reference" | "binding" | "delete";
};

export type WikiDoc = string | null;

export type WikiSnapshot = {
    id: string;
    source: SnapshotSource;
    operation?: WikiSnapshotOperation;
    title: string;
    slug?: string | null;
    doc: WikiDoc;
};

export type EntityWikiLinkSnapshot = {
    entity_id: string;
    wiki_id: string;
    operation?: "reference" | "binding" | "delete";
};

// ---- Replay / Scripting System (runtime shape) ----

/**
 * Canonical UI action names trong snapshot hiện tại.
 * Không còn wrapper `function_name: "UI"` trong shape mới.
 */
export type UIOptionName =
    | "timeline"
    | "layer_panel"
    | "wiki_panel"
    | "close_wiki_panel"
    | "zoom_panel"
    | "wiki"
    | "toast"
    | "wiki_header"
    | "playback_speed";

export type MapFunctionName =
    | "set_camera_view"
    | "set_time_filter"
    | "enable_timeline_filter"
    | "disable_timeline_filter"
    | "toggle_labels"
    | "show_labels"
    | "hide_labels"
    | "show_all_geometries"
    | "reset_camera_north";

export type GeoFunctionName =
    | "fly_to_geometry"
    | "fly_to_geometries"
    | "set_geometry_visibility"
    | "show_geometries"
    | "hide_geometries"
    | "fit_to_geometries"
    | "orbit_camera_around_geometry"
    | "pulse_geometry"
    | "animate_dashed_border"
    | "set_geometry_style"
    | "show_geometry_label"
    | "follow_geometry_path"
    | "follow_geometries_path"
    | "dim_other_geometries";

export type NarrativeFunctionName =
    | "set_title"
    | "clear_title"
    | "set_descriptions"
    | "clear_descriptions"
    | "show_dialog_box"
    | "clear_dialog_box"
    | "display_historical_image"
    | "clear_historical_image"
    | "set_step_subtitle"
    | "clear_step_subtitle";

/**
 * Runtime thật hiện dùng positional array cho params.
 * File doc này giữ đúng shape đó.
 */
export type ReplayAction<T> = {
    function_name: T;
    params: unknown[];
};

export type ReplayStep = {
    duration: number;
    use_UI_function: ReplayAction<UIOptionName>[];
    use_map_function: ReplayAction<MapFunctionName>[];
    use_geo_function: ReplayAction<GeoFunctionName>[];
    use_narrow_function: ReplayAction<NarrativeFunctionName>[];
};

export type ReplayStage = {
    id: number;
    title?: string;
    detail_time_start: string;
    detail_time_stop: string;
    steps: ReplayStep[];
};

export type BattleReplay = {
    id: string;
    geometry_id: string;
    target_geometry_ids: string[];
    detail: ReplayStage[];
};

// ---- Replay tuple docs ----

/**
 * Doc-only helper để giải thích meaning của từng vị trí trong `params`.
 * Runtime không ép các tuple này; chúng chỉ là tài liệu tham chiếu.
 */

export type ReplayCameraViewStateDoc = {
    center?: [number, number] | { lng: number; lat: number };
    zoom?: number;
    pitch?: number;
    bearing?: number;
    duration?: number;
};

export type ReplayUiParamTupleDocs = {
    timeline: [visible: boolean];
    layer_panel: [visible: boolean];
    wiki_panel: [visible: boolean];
    close_wiki_panel: [];
    zoom_panel: [visible: boolean];
    wiki: [wiki_id: string];
    toast: [message: string];
    wiki_header: [header_id: string];
    playback_speed: [speed: number];
};

/**
 * Snapshot cũ kiểu `function_name: "UI"` chỉ còn là legacy input.
 * Frontend hiện normalize chúng sang `function_name: UIOptionName` khi load.
 */

export type ReplayMapFunctionParamTupleDocs = {
    set_camera_view: [state: ReplayCameraViewStateDoc];
    set_time_filter: [year: number];
    enable_timeline_filter: [];
    disable_timeline_filter: [];
    toggle_labels: [visible: boolean];
    show_labels: [];
    hide_labels: [];
    show_all_geometries: [];
    reset_camera_north: [];
};

export type ReplayGeoFunctionParamTupleDocs = {
    fly_to_geometry: [
        geometry_id: string,
        zoom?: number,
        padding?: number,
        duration?: number,
    ];
    fly_to_geometries: [geometry_ids: string[], duration?: number];
    set_geometry_visibility: [geometry_ids: string[], visible: boolean];
    show_geometries: [geometry_ids: string[]];
    hide_geometries: [geometry_ids: string[]];
    fit_to_geometries: [geometry_ids: string[], duration?: number];
    orbit_camera_around_geometry: [
        geometry_id: string,
        zoom?: number,
        pitch?: number,
        revolutions?: number,
        duration?: number,
    ];
    pulse_geometry: [
        geometry_id: string,
        color?: string,
        repeat?: number,
        duration?: number,
    ];
    animate_dashed_border: [
        geometry_id: string,
        color?: string,
        width?: number,
        speed?: number,
        duration?: number,
    ];
    set_geometry_style: [
        geometry_ids: string[],
        fill_color?: string,
        fill_opacity?: number,
        line_color?: string,
        line_width?: number,
    ];
    show_geometry_label: [
        geometry_id: string,
        text?: string,
        color?: string,
        size?: number,
    ];
    follow_geometry_path: [
        geometry_id: string,
        duration?: number,
        zoom?: number,
        pitch?: number,
    ];
    follow_geometries_path: [
        geometry_ids: string[],
        duration?: number,
        zoom?: number,
        pitch?: number,
    ];
    dim_other_geometries: [
        geometry_ids: string[],
    ];
};

export type ReplayNarrativeParamTupleDocs = {
    set_title: [title: string];
    clear_title: [];
    set_descriptions: [text: string];
    clear_descriptions: [];
    show_dialog_box: [
        avatar: string,
        text: string,
        side?: "left" | "right",
        speaker?: string,
    ];
    clear_dialog_box: [];
    display_historical_image: [
        url: string,
        caption?: string,
    ];
    clear_historical_image: [];
    set_step_subtitle: [subtitle: string | null];
    clear_step_subtitle: [];
};

export type ReplayParamTupleDocs =
    & ReplayUiParamTupleDocs
    & ReplayMapFunctionParamTupleDocs
    & ReplayGeoFunctionParamTupleDocs
    & ReplayNarrativeParamTupleDocs;

export type ReplayActionTupleDoc<T extends keyof ReplayParamTupleDocs> = {
    function_name: T;
    params: ReplayParamTupleDocs[T];
};

// ---- Snapshot root ----

export type EditorSnapshot = {
    // Legacy snapshots có thể còn field project embedded.
    project?: {
        id: string;
        title: string;
    };
    editor_feature_collection?: FeatureCollection;
    entities?: EntitySnapshot[];
    geometries?: GeometrySnapshot[];
    geometry_entity?: GeometryEntitySnapshot[];
    wikis?: WikiSnapshot[];
    entity_wiki?: EntityWikiLinkSnapshot[];
    replays?: BattleReplay[];
};

export type CommitSnapshot = EditorSnapshot;
