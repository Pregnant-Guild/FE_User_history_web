import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

export function ModeHint({ mode }: { mode: EditorMode }) {
    if (mode === "add-line" || mode === "add-path") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Click để thêm điểm, Enter để hoàn tất, Esc để hủy.
            </div>
        );
    }
    if (mode === "add-circle") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Giữ chuột trái kéo để mở bán kính, thả chuột để hoàn tất.
            </div>
        );
    }
    if (mode === "add-point") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Chọn 1 điểm trên bản đồ để đặt địa điểm.
            </div>
        )
    }
    if (mode === "select") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Chọn 1 hình, đường, điểm trên bản đồ để xem chi tiết.
            </div>
        )
    }
    if (mode === "draw") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Chọn các điểm trên bản đồ để vẽ hình, ENTER để kết thúc, ESC để hủy.
            </div>
        )
    }
    if (mode === "replay") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Đang trong chế độ trình diễn diễn biến kịch bản.
            </div>
        )
    }
    return null;
}
