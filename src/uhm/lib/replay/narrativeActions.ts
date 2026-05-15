/**
 * Các hàm điều khiển nội dung dẫn chuyện và thuyết minh trong Replay.
 */

export const narrativeActions = {
    // Đặt tiêu đề cho cảnh hiện tại
    set_title: (setTitle: (t: string) => void, title: string) => {
        setTitle(title);
    },

    // Đặt nội dung mô tả chi tiết
    set_descriptions: (setDesc: (d: string) => void, descriptions: string) => {
        setDesc(descriptions);
    },

    // Hiển thị hộp thoại hội thoại (Dialogue)
    show_dialog_box: (setDialog: (data: { avatar: string; text: string; side: 'left' | 'right' }) => void, avatar: string, text: string) => {
        setDialog({ avatar, text, side: 'left' });
    },

    // Hiển thị hình ảnh lịch sử đè lên bản đồ
    display_historical_image: (setImage: (url: string | null) => void, imageUrl: string) => {
        setImage(imageUrl);
    },

    // Hiển thị phụ đề (Subtitle)
    set_step_subtitle: (setSubtitle: (s: string | null) => void, subtitle: string) => {
        setSubtitle(subtitle);
    }
};
