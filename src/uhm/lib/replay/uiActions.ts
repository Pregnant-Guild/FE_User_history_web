/**
 * Các hàm điều khiển giao diện người dùng (UI) trong chế độ Replay.
 */

export const uiActions = {
    // Ẩn/hiện thanh Timeline
    timeline: (setTimelineVisible: (v: boolean) => void, visible: boolean) => {
        setTimelineVisible(visible);
    },

    // Ẩn/hiện panel layer trong preview.
    layer_panel: (setLayerPanelVisible: (v: boolean) => void, visible: boolean) => {
        setLayerPanelVisible(visible);
    },

    // Ẩn/hiện cụm control zoom/projection trên map preview.
    zoom_panel: (setZoomPanelVisible: (v: boolean) => void, visible: boolean) => {
        setZoomPanelVisible(visible);
    },

    // Mở Wiki và tìm đến một ID cụ thể. Nếu wikiId là null/rỗng thì đóng panel wiki.
    wiki: (setSidebarOpen: (v: boolean) => void, onSelectWiki: (id: string) => void, wikiId: string | null) => {
        if (!wikiId) {
            setSidebarOpen(false);
            onSelectWiki("");
        } else {
            setSidebarOpen(true);
            onSelectWiki(wikiId);
        }
    },

    // Hiển thị thông báo (toast)
    toast: (addToast: (msg: string) => void, message: string) => {
        addToast(message);
    },
};
