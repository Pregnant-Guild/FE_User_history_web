import type { DialogState } from "@/uhm/types/projects";

/**
 * Các hàm điều khiển nội dung dẫn chuyện và thuyết minh trong Replay.
 */
export const narrativeActions = {
    // Đặt kịch bản đối thoại/hình ảnh dẫn chuyện mới (hoặc null để xóa)
    set_dialog: (
        setDialog: (data: DialogState | null) => void,
        dialog: DialogState | null
    ) => {
        setDialog(dialog);
    }
};
