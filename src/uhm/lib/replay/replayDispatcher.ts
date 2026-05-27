import type maplibregl from "maplibre-gl";
import type { FeatureCollection } from "@/uhm/types/geo";
import type {
    ReplayAction,
    DialogState,
} from "@/uhm/types/projects";
import { mapActions } from "./mapActions";
import { uiActions } from "./uiActions";
import { narrativeActions } from "./narrativeActions";

/**
 * Interface định nghĩa các controller cần thiết để thực thi Replay.
 * Các thành phần UI sẽ cung cấp các hàm setter này cho Dispatcher.
 */
export interface ReplayControllers {
    map: maplibregl.Map | null;
    draft: FeatureCollection;
    effects: any; // Type helper for ReplayMapEffects to avoid circular dependency
    
    // UI Setters
    setTimelineVisible: (v: boolean) => void;
    setTimelineFilterEnabled: (v: boolean) => void;
    setLayerPanelVisible: (v: boolean) => void;
    setZoomPanelVisible: (v: boolean) => void;
    setSidebarOpen: (v: boolean) => void;
    onSelectWiki: (id: string) => void;
    addToast: (msg: string) => void;
    setPlaybackSpeed: (s: number) => void;
    onYearChange: (y: number) => void;
    showGeometries: (ids: string[]) => void;
    hideGeometries: (ids: string[]) => void;
    showOnlyGeometries: (ids: string[]) => void;
    showAllGeometries: () => void;

    // Narrative Setters
    setDialog: (dialog: DialogState | null) => void;
    getDialog?: () => DialogState | null;
}

/**
 * Dispatcher trung tâm: Nhận một Action và thực thi logic tương ứng
 * bằng cách gọi đến các bộ Action con (map, ui, narrative).
 */
export const dispatchReplayAction = (
    controllers: ReplayControllers,
    rawAction: ReplayAction<any> | { function_name: string; params: unknown[] }
) => {
    const action = normalizeSingleAction(rawAction);
    if (!action) return;

    const { function_name, params } = action;

    // 1. Nhóm Map/Geo Actions
    if (controllers.map) {
        const map = controllers.map;
        switch (function_name) {
            case "set_camera_view":
                mapActions.set_camera_view(map, normalizeCameraViewState(params[0]));
                return;
            case "set_labels_visible":
                mapActions.set_labels_visible(map, asBooleanValue(params[0], true));
                return;
            case "set_timeline_filter":
                controllers.setTimelineFilterEnabled(asBooleanValue(params[0], true));
                return;
            case "fly_to_geometries":
                mapActions.fly_to_geometries(
                    map,
                    toStringValues(params[0]),
                    controllers.draft,
                    asNumberValue(params[1], 2200)
                );
                return;
            case "set_geometry_visibility": {
                const geometryIds = toStringValues(params[0]);
                const visible = asBooleanValue(params[1], true);
                if (visible) {
                    controllers.showGeometries(geometryIds);
                } else {
                    controllers.hideGeometries(geometryIds);
                }
                return;
            }
            case "follow_geometries_path":
                controllers.effects.followGeometriesPath(
                    map,
                    controllers.draft,
                    toStringValues(params[0]),
                    asNumberValue(params[1], 5000),
                    asNumberValue(params[2], 8),
                    asNumberValue(params[3], 50)
                );
                return;
            case "hide_others_geometries":
                controllers.showOnlyGeometries(toStringValues(params[0]));
                return;
            case "pulse_geometry":
                controllers.effects.pulseGeometry(
                    map,
                    controllers.draft,
                    asStringValue(params[0]),
                    asStringValue(params[1]) || "#f59e0b",
                    asNumberValue(params[2], 2),
                    asNumberValue(params[3], 1800)
                );
                return;
            case "animate_dashed_border":
                controllers.effects.animateDashedBorder(
                    map,
                    controllers.draft,
                    asStringValue(params[0]),
                    asStringValue(params[1]) || "#38bdf8",
                    asNumberValue(params[2], 2),
                    asNumberValue(params[3], 2),
                    asNumberValue(params[4], 3000)
                );
                return;
            case "set_geometry_style":
                controllers.effects.setGeometryStyle(
                    map,
                    controllers.draft,
                    toStringValues(params[0]),
                    asStringValue(params[1]) || "#f97316",
                    asNumberValue(params[2], 0.35),
                    asStringValue(params[3]) || "#fdba74",
                    asNumberValue(params[4], 2)
                );
                return;
            case "orbit_camera_around_geometry":
                mapActions.orbit_camera_around_geometry(
                    map,
                    asStringValue(params[0]),
                    controllers.draft,
                    asNumberValue(params[1], 8),
                    asNumberValue(params[2], 45),
                    asNumberValue(params[3], 1),
                    asNumberValue(params[4], 5000)
                );
                return;
        }
    }

    // 2. Nhóm UI Actions
    switch (function_name) {
        case "timeline":
            uiActions.timeline(controllers.setTimelineVisible, asBooleanValue(params[0], true));
            return;
        case "layer_panel":
            uiActions.layer_panel(controllers.setLayerPanelVisible, asBooleanValue(params[0], true));
            return;
        case "zoom_panel":
            uiActions.zoom_panel(controllers.setZoomPanelVisible, asBooleanValue(params[0], true));
            return;
        case "wiki":
            uiActions.wiki(
                controllers.setSidebarOpen,
                controllers.onSelectWiki,
                params[0] as string | null
            );
            return;
        case "toast":
            uiActions.toast(
                controllers.addToast,
                typeof params[0] === "string" ? params[0] : ""
            );
            return;
    }

    // 3. Nhóm Narrative Actions
    if (function_name === "set_dialog") {
        const nextDialog = params[0] as DialogState | null;
        if (nextDialog === null) {
            narrativeActions.set_dialog(controllers.setDialog, null);
        } else {
            // merge with existing dialog state if available
            const existing = controllers.getDialog ? controllers.getDialog() : null;
            narrativeActions.set_dialog(controllers.setDialog, {
                avatar: nextDialog.avatar ?? existing?.avatar ?? "",
                text: nextDialog.text ?? existing?.text ?? "",
                image_url: nextDialog.image_url ?? existing?.image_url,
                image_caption: nextDialog.image_caption ?? existing?.image_caption,
            });
        }
        return;
    }
};

/**
 * Lớp tương thích ngược (Backward Compatibility)
 * Chuẩn hóa các action cũ thành 16 action chính thức.
 */
function normalizeSingleAction(action: any): ReplayAction<any> | null {
    if (!action || typeof action !== "object") return null;

    let { function_name, params } = action;
    if (!Array.isArray(params)) {
        params = [];
    }

    if (function_name === "UI") {
        function_name = params[0];
        params = params.slice(1);
    }

    switch (function_name) {
        // UI Options
        case "timeline":
        case "layer_panel":
        case "zoom_panel":
        case "toast":
            return { function_name, params: [params[0]] };
        case "wiki":
            return { function_name: "wiki", params: [params[0] || null] };
        case "close_wiki_panel":
            return { function_name: "wiki", params: [null] };
        case "wiki_panel":
            return { function_name: "wiki", params: [params[0] ? "" : null] };
        case "playback_speed":
            return null;

        // Map Functions
        case "set_camera_view":
            return { function_name, params };
        case "set_timeline_filter":
            return { function_name, params: [Boolean(params[0])] };
        case "enable_timeline_filter":
        case "disable_timeline_filter":
            return { function_name: "set_timeline_filter", params: [function_name === "enable_timeline_filter"] };
        case "set_labels_visible":
        case "toggle_labels":
            return { function_name: "set_labels_visible", params: [Boolean(params[0])] };
        case "show_labels":
        case "hide_labels":
            return { function_name: "set_labels_visible", params: [function_name === "show_labels"] };
        case "reset_camera_north":
            return { function_name: "set_camera_view", params: [{ bearing: 0 }] };
        case "set_time_filter":
        case "show_all_geometries":
            return null;

        // Geo Functions
        case "fly_to_geometries":
            return { function_name, params };
        case "fly_to_geometry":
            return { function_name: "fly_to_geometries", params: [[params[0]], params[3]] };
        case "fit_to_geometries":
            return { function_name: "fly_to_geometries", params: [params[0], params[1]] };
        case "set_geometry_visibility":
            return { function_name, params: [params[0], params[1] !== undefined ? Boolean(params[1]) : true] };
        case "show_geometries":
            return { function_name: "set_geometry_visibility", params: [params[0], true] };
        case "hide_geometries":
            return { function_name: "set_geometry_visibility", params: [params[0], false] };
        case "follow_geometries_path":
            return { function_name, params };
        case "follow_geometry_path":
            return { function_name: "follow_geometries_path", params: [[params[0]], params[1], params[2], params[3]] };
        case "dim_other_geometries":
        case "hide_others_geometries":
            return { function_name: "hide_others_geometries", params: [params[0]] };
        case "pulse_geometry":
        case "animate_dashed_border":
        case "set_geometry_style":
        case "orbit_camera_around_geometry":
            return { function_name, params };
        case "show_geometry_label":
            return null;

        // Narrative Functions
        case "set_dialog":
            return { function_name, params };
        case "show_dialog_box":
            return { function_name: "set_dialog", params: [{ avatar: params[0], text: params[1] }] };
        case "set_title":
        case "set_descriptions":
        case "set_step_subtitle":
            return { function_name: "set_dialog", params: [{ text: params[0] }] };
        case "display_historical_image":
            return { function_name: "set_dialog", params: [{ image_url: params[0], image_caption: params[1] }] };
        case "clear_dialog_box":
        case "clear_title":
        case "clear_descriptions":
        case "clear_historical_image":
        case "clear_step_subtitle":
            return { function_name: "set_dialog", params: [null] };

        default:
            return null;
    }
}

function normalizeCameraViewState(value: unknown) {
    if (!value || typeof value !== "object") {
        return {};
    }

    const record = value as Record<string, unknown>;
    const nextState: {
        center?: [number, number] | { lng: number; lat: number };
        zoom?: number;
        pitch?: number;
        bearing?: number;
        duration?: number;
    } = {};

    const center = record.center;
    if (Array.isArray(center) && center.length >= 2) {
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
            nextState.center = [lng, lat];
        }
    }

    const zoom = asOptionalNumberValue(record.zoom);
    const pitch = asOptionalNumberValue(record.pitch);
    const bearing = asOptionalNumberValue(record.bearing);
    const duration = asOptionalNumberValue(record.duration);
    if (zoom != null) nextState.zoom = zoom;
    if (pitch != null) nextState.pitch = pitch;
    if (bearing != null) nextState.bearing = bearing;
    if (duration != null) nextState.duration = duration;

    return nextState;
}

function asStringValue(value: unknown) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asBooleanValue(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}

function asOptionalNumberValue(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function asNumberValue(value: unknown, fallback: number) {
    return asOptionalNumberValue(value) ?? fallback;
}

function toStringValues(value: unknown) {
    if (!Array.isArray(value)) {
        const single = asStringValue(value).trim();
        return single.length > 0 ? [single] : [];
    }
    return value
        .map((item) => asStringValue(item).trim())
        .filter((item) => item.length > 0);
}
