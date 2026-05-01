import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/useEditorState";
import type { ModeGetter } from "@/uhm/lib/engine/engineTypes";

// Khởi tạo engine thêm point bằng click đơn.
export function initPoint(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onComplete: (geometry: Geometry) => void
) {
    // Thêm point mới khi đang ở chế độ add-point.
    function onClick(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "add-point") return;

        const geometry: Geometry = {
            type: "Point",
            coordinates: [e.lngLat.lng, e.lngLat.lat],
        };

        onComplete?.(geometry);
    }

    // Cập nhật trạng thái con trỏ theo mode add-point.
    function onMove() {
        const canvas = map.getCanvas();
        if (getMode() === "add-point") {
            canvas.style.cursor = "crosshair";
            return;
        }
        if (canvas.style.cursor === "crosshair") {
            canvas.style.cursor = "";
        }
    }

    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
        map.off("click", onClick);
        map.off("mousemove", onMove);
        if (map.getCanvas().style.cursor === "crosshair") {
            map.getCanvas().style.cursor = "";
        }
    };
}
