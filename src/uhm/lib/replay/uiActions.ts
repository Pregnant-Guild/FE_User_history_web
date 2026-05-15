/**
 * Các hàm điều khiển giao diện người dùng (UI) trong chế độ Replay.
 */

export const uiActions = {
    // Ẩn thanh Timeline
    hide_timeline: (setTimelineVisible: (v: boolean) => void) => {
        setTimelineVisible(false);
    },

    // Ẩn toàn bộ UI để có trải nghiệm điện ảnh (Cinematic)
    hide_all_UI: (setUIVisible: (v: boolean) => void) => {
        setUIVisible(false);
    },

    // Mở Wiki và tìm đến một ID cụ thể
    open_wiki: (setSidebarOpen: (v: boolean) => void, onSelectWiki: (id: string) => void, wikiId: string) => {
        setSidebarOpen(true);
        onSelectWiki(wikiId);
    },

    // Hiển thị thông báo (toast)
    show_toast_message: (addToast: (msg: string) => void, message: string) => {
        addToast(message);
    },

    // Thay đổi tốc độ phát Replay
    set_playback_speed: (setSpeed: (s: number) => void, speed: number) => {
        setSpeed(speed);
    }
};
