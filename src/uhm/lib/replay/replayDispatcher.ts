import type maplibregl from "maplibre-gl";
import type { FeatureCollection } from "@/uhm/types/geo";
import type {
    GeoFunctionName,
    MapFunctionName,
    NarrativeFunctionName,
    ReplayAction,
    UIOptionName,
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
    
    // UI Setters
    setTimelineVisible: (v: boolean) => void;
    setSidebarOpen: (v: boolean) => void;
    onSelectWiki: (id: string) => void;
    addToast: (msg: string) => void;
    setPlaybackSpeed: (s: number) => void;
    onYearChange: (y: number) => void;

    // Narrative Setters
    setTitle: (t: string) => void;
    setDescriptions: (d: string) => void;
    setDialog: (data: { avatar: string; text: string; side: "left" | "right" }) => void;
    setImage: (url: string | null) => void;
    setSubtitle: (s: string | null) => void;
}

/**
 * Dispatcher trung tâm: Nhận một Action và thực thi logic tương ứng
 * bằng cách gọi đến các bộ Action con (map, ui, narrative).
 */
export const dispatchReplayAction = (
    controllers: ReplayControllers,
    action: ReplayAction<UIOptionName | MapFunctionName | GeoFunctionName | NarrativeFunctionName> | {
        function_name: "UI";
        params: unknown[];
    }
) => {
    const { function_name, params } = action;

    // 1. Nhóm Map Actions
    if (controllers.map) {
        const map = controllers.map;
        switch (function_name as MapFunctionName | GeoFunctionName) {
            case "set_camera_view":
                mapActions.set_camera_view(map, normalizeCameraViewState(params[0]));
                return;
            case "fly_to_geometry":
                mapActions.fly_to_geometry(
                    map,
                    asStringValue(params[0]),
                    controllers.draft,
                );
                return;
            case "toggle_labels":
                mapActions.toggle_labels(map, asBooleanValue(params[0], true));
                return;
            case "show_labels":
                mapActions.toggle_labels(map, true);
                return;
            case "hide_labels":
                mapActions.toggle_labels(map, false);
                return;
            case "set_time_filter":
                mapActions.set_time_filter(controllers.onYearChange, asNumberValue(params[0], 0));
                return;
            case "reset_camera_north":
                mapActions.set_camera_view(map, { bearing: 0 });
                return;
            case "fly_to_geometries":
            case "enable_timeline_filter":
            case "disable_timeline_filter":
            case "show_geometries":
            case "hide_geometries":
            case "set_geometry_visibility":
            case "fit_to_geometries":
            case "orbit_camera_around_geometry":
            case "pulse_geometry":
            case "animate_dashed_border":
            case "set_geometry_style":
            case "show_geometry_label":
            case "follow_geometry_path":
            case "follow_geometries_path":
            case "dim_other_geometries":
                return;
        }
    }

    // 2. Nhóm UI Actions
    const uiDescriptor = getUiActionDescriptor(function_name, params);
    if (uiDescriptor) {
        const { option, payload } = uiDescriptor;
        switch (option) {
            case "timeline":
                uiActions.timeline(controllers.setTimelineVisible, Boolean(payload[0] ?? false));
                return;
            case "layer_panel":
                uiActions.layer_panel(Boolean(payload[0] ?? false));
                return;
            case "wiki_panel":
                uiActions.wiki_panel(controllers.setSidebarOpen, Boolean(payload[0] ?? false));
                return;
            case "zoom_panel":
                uiActions.zoom_panel(Boolean(payload[0] ?? false));
                return;
            case "wiki":
                uiActions.wiki(
                    controllers.setSidebarOpen,
                    controllers.onSelectWiki,
                    typeof payload[0] === "string" ? payload[0] : ""
                );
                return;
            case "toast":
                uiActions.toast(
                    controllers.addToast,
                    typeof payload[0] === "string" ? payload[0] : ""
                );
                return;
            case "wiki_header":
                uiActions.wiki_header(typeof payload[0] === "string" ? payload[0] : "");
                return;
            case "playback_speed":
                uiActions.playback_speed(
                    controllers.setPlaybackSpeed,
                    typeof payload[0] === "number" ? payload[0] : 1
                );
                return;
        }
    }

    // 3. Nhóm Narrative Actions
    switch (function_name as NarrativeFunctionName) {
        case "set_title":
            narrativeActions.set_title(controllers.setTitle, asStringValue(params[0]));
            return;
        case "set_descriptions":
            narrativeActions.set_descriptions(controllers.setDescriptions, asStringValue(params[0]));
            return;
        case "show_dialog_box":
            narrativeActions.show_dialog_box(
                controllers.setDialog,
                asStringValue(params[0]),
                asStringValue(params[1])
            );
            return;
        case "display_historical_image":
            narrativeActions.display_historical_image(controllers.setImage, asStringValue(params[0]));
            return;
        case "set_step_subtitle":
            narrativeActions.set_step_subtitle(controllers.setSubtitle, asStringValue(params[0]));
            return;
    }
};

function normalizeUiOption(value: unknown): UIOptionName | null {
    switch (value) {
        case "timeline":
        case "layer_panel":
        case "wiki_panel":
        case "zoom_panel":
        case "wiki":
        case "toast":
        case "wiki_header":
        case "playback_speed":
            return value;
        default:
            return null;
    }
}

function getUiActionDescriptor(function_name: unknown, params: unknown[]) {
    if (function_name === "UI") {
        const option = normalizeUiOption(params[0]);
        if (!option) return null;
        return {
            option,
            payload: params.slice(1),
        };
    }

    const option = normalizeUiOption(function_name);
    if (!option) return null;
    return {
        option,
        payload: params,
    };
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
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNumberValue(value: unknown, fallback: number) {
    return asOptionalNumberValue(value) ?? fallback;
}
