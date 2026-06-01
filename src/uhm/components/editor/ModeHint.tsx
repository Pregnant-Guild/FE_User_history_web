import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

export function ModeHint({ mode }: { mode: EditorMode }) {
    if (mode === "add-line" || mode === "add-path") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                <div style={{ marginBottom: 4 }}>Click trên bản đồ để thêm đỉnh.</div>
                <ul style={{ paddingLeft: 16, margin: 0, opacity: 0.85 }}>
                    <li><b>Enter</b>: Hoàn tất & Chốt hình</li>
                    <li><b>Esc</b>: Hủy bỏ thao tác vẽ</li>
                    <li><b>Backspace</b>: Xóa đỉnh vừa vẽ cuối cùng</li>
                    <li><b>Giữ Shift / Alt</b>: Bắt dính (Snap) vào hình khác</li>
                </ul>
            </div>
        );
    }
    if (mode === "add-circle") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                <div style={{ marginBottom: 4 }}>Kéo chuột để vẽ hình tròn.</div>
                <ul style={{ paddingLeft: 16, margin: 0, opacity: 0.85 }}>
                    <li><b>Nhấn giữ chuột trái</b>: Chọn tâm & kéo để tạo bán kính</li>
                    <li><b>Nhả chuột trái</b>: Hoàn tất chốt hình</li>
                    <li><b>Esc</b>: Hủy bỏ thao tác đang kéo vẽ dở</li>
                </ul>
            </div>
        );
    }
    if (mode === "add-point") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                <div style={{ marginBottom: 4 }}>Click trên bản đồ để tạo một Điểm.</div>
                <ul style={{ paddingLeft: 16, margin: 0, opacity: 0.85 }}>
                    <li><b>Giữ Shift / Alt</b>: Bắt dính (Snap) chính xác vào hình khác</li>
                </ul>
            </div>
        )
    }
    if (mode === "select") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                <div style={{ marginBottom: 4 }}>Click vào hình trên map để Chọn (Select).</div>
                <ul style={{ paddingLeft: 16, margin: 0, opacity: 0.85 }}>
                    <li>Trong chế độ Sửa đỉnh:
                        <ul style={{ paddingLeft: 16, margin: "2px 0 0 0" }}>
                            <li><b>Enter</b>: Lưu hình đã sửa</li>
                            <li><b>Delete</b>: Bật/Tắt chế độ Xóa đỉnh (click để xóa)</li>
                            <li><b>Giữ Shift</b>: Bắt dính (Snap) điểm đang kéo</li>
                        </ul>
                    </li>
                </ul>
            </div>
        )
    }
    if (mode === "draw") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                <div style={{ marginBottom: 4 }}>Click trên bản đồ để vẽ Đa giác (Polygon).</div>
                <ul style={{ paddingLeft: 16, margin: 0, opacity: 0.85 }}>
                    <li><b>Enter</b>: Hoàn tất & Chốt hình</li>
                    <li><b>Esc</b>: Hủy bỏ thao tác vẽ</li>
                    <li><b>Backspace</b>: Xóa đỉnh vừa vẽ cuối cùng</li>
                    <li><b>Giữ Shift / Alt</b>: Bắt dính (Snap) vào hình khác</li>
                </ul>
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
    if (mode === "replay_preview") {
        return (
            <div style={{ marginTop: 6, fontSize: 12, color: "#93c5fd" }}>
                Đang xem preview replay trên session tách biệt.
            </div>
        )
    }
    return null;
}
