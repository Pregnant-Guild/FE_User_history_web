/**
 * Các hàm điều khiển giao diện người dùng (UI) trong chế độ Replay.
 */

export const uiActions = {
    // Ẩn/hiện thanh Timeline
    timeline: (setTimelineVisible: (v: boolean) => void, visible: boolean) => {
        setTimelineVisible(visible);
    },

    // Ẩn/hiện panel layer. Runtime hiện chưa có controller riêng nên tạm no-op.
    layer_panel: (visible: boolean) => {
        void visible;
        return;
    },

    // Ẩn/hiện panel wiki.
    wiki_panel: (setSidebarOpen: (v: boolean) => void, visible: boolean) => {
        setSidebarOpen(visible);
    },

    // Ẩn/hiện panel zoom. Runtime hiện chưa có controller riêng nên tạm no-op.
    zoom_panel: (visible: boolean) => {
        void visible;
        return;
    },

    // Mở Wiki và tìm đến một ID cụ thể
    wiki: (setSidebarOpen: (v: boolean) => void, onSelectWiki: (id: string) => void, wikiId: string) => {
        setSidebarOpen(true);
        onSelectWiki(wikiId);
    },

    // Hiển thị thông báo (toast)
    toast: (addToast: (msg: string) => void, message: string) => {
        addToast(message);
    },

    // Focus header trong wiki. Runtime hiện chưa có controller riêng nên tạm no-op.
    wiki_header: (headerId: string) => {
        void headerId;
        return;
    },

    // Thay đổi tốc độ phát Replay
    playback_speed: (setSpeed: (s: number) => void, speed: number) => {
        setSpeed(speed);
    }
};
