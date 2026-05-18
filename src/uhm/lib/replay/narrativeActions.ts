/**
 * Các hàm điều khiển nội dung dẫn chuyện và thuyết minh trong Replay.
 */

export const narrativeActions = {
    // Đặt tiêu đề cho cảnh hiện tại
    set_title: (setTitle: (t: string) => void, title: string) => {
        setTitle(title);
    },

    clear_title: (setTitle: (t: string) => void) => {
        setTitle("");
    },

    // Đặt nội dung mô tả chi tiết
    set_descriptions: (setDesc: (d: string) => void, descriptions: string) => {
        setDesc(descriptions);
    },

    clear_descriptions: (setDesc: (d: string) => void) => {
        setDesc("");
    },

    // Hiển thị hộp thoại hội thoại (Dialogue)
    show_dialog_box: (
        setDialog: (data: {
            avatar: string;
            text: string;
            side: "left" | "right";
            speaker?: string | null;
        }) => void,
        avatar: string,
        text: string,
        side: "left" | "right",
        speaker: string | null
    ) => {
        setDialog({ avatar, text, side, speaker });
    },

    clear_dialog_box: (
        setDialog: (data: {
            avatar: string;
            text: string;
            side: "left" | "right";
            speaker?: string | null;
        } | null) => void
    ) => {
        setDialog(null);
    },

    // Hiển thị hình ảnh lịch sử đè lên bản đồ
    display_historical_image: (
        setImage: (image: { url: string; caption?: string | null } | null) => void,
        imageUrl: string,
        caption: string | null
    ) => {
        if (!imageUrl.trim().length) {
            setImage(null);
            return;
        }
        setImage({ url: imageUrl, caption });
    },

    clear_historical_image: (
        setImage: (image: { url: string; caption?: string | null } | null) => void,
    ) => {
        setImage(null);
    },

    // Hiển thị phụ đề (Subtitle)
    set_step_subtitle: (setSubtitle: (s: string | null) => void, subtitle: string) => {
        setSubtitle(subtitle);
    },

    clear_step_subtitle: (setSubtitle: (s: string | null) => void) => {
        setSubtitle(null);
    },
};
