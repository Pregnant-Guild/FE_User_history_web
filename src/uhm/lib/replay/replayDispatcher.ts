import type maplibregl from "maplibre-gl";
import type { FeatureCollection } from "@/uhm/types/geo";
import type { ReplayAction, UIFunctionName, MapFunctionName, NarrativeFunctionName } from "@/uhm/types/projects";
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
    setUIVisible: (v: boolean) => void;
    setSidebarOpen: (v: boolean) => void;
    onSelectWiki: (id: string) => void;
    addToast: (msg: string) => void;
    setPlaybackSpeed: (s: number) => void;
    onYearChange: (y: number) => void;

    // Narrative Setters
    setTitle: (t: string) => void;
    setDescriptions: (d: string) => void;
    setDialog: (data: any) => void;
    setImage: (url: string | null) => void;
    setSubtitle: (s: string | null) => void;
}

/**
 * Dispatcher trung tâm: Nhận một Action và thực thi logic tương ứng
 * bằng cách gọi đến các bộ Action con (map, ui, narrative).
 */
export const dispatchReplayAction = (controllers: ReplayControllers, action: ReplayAction<any>) => {
    const { function_name, params } = action;

    // 1. Nhóm Map Actions
    if (controllers.map) {
        const map = controllers.map;
        switch (function_name as MapFunctionName) {
            case "zoom_to_lnglat":
                mapActions.zoom_to_lnglat(map, params[0], params[1], params[2]);
                return;
            case "zoom_scale":
                mapActions.zoom_scale(map, params[0]);
                return;
            case "set_camera_view":
                mapActions.set_camera_view(map, params[0]);
                return;
            case "fly_to_geometry":
                mapActions.fly_to_geometry(map, params[0], controllers.draft);
                return;
            case "rotate_around_point":
                mapActions.rotate_around_point(map, params[0]);
                return;
            case "toggle_labels":
                mapActions.toggle_labels(map, params[0]);
                return;
            case "set_time_filter":
                mapActions.set_time_filter(controllers.onYearChange, params[0]);
                return;
        }
    }

    // 2. Nhóm UI Actions
    switch (function_name as UIFunctionName) {
        case "hide_timeline":
            uiActions.hide_timeline(controllers.setTimelineVisible);
            return;
        case "hide_all_UI":
            uiActions.hide_all_UI(controllers.setUIVisible);
            return;
        case "open_wiki":
            uiActions.open_wiki(controllers.setSidebarOpen, controllers.onSelectWiki, params[0]);
            return;
        case "show_toast_message":
            uiActions.show_toast_message(controllers.addToast, params[0]);
            return;
        case "set_playback_speed":
            uiActions.set_playback_speed(controllers.setPlaybackSpeed, params[0]);
            return;
    }

    // 3. Nhóm Narrative Actions
    switch (function_name as NarrativeFunctionName) {
        case "set_title":
            narrativeActions.set_title(controllers.setTitle, params[0]);
            return;
        case "set_descriptions":
            narrativeActions.set_descriptions(controllers.setDescriptions, params[0]);
            return;
        case "show_dialog_box":
            narrativeActions.show_dialog_box(controllers.setDialog, params[0], params[1]);
            return;
        case "display_historical_image":
            narrativeActions.display_historical_image(controllers.setImage, params[0]);
            return;
        case "set_step_subtitle":
            narrativeActions.set_step_subtitle(controllers.setSubtitle, params[0]);
            return;
    }
};
