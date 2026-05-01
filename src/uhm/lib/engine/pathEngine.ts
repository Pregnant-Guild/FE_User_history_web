import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/useEditorState";
import type { ModeGetter } from "@/uhm/lib/engine/engineTypes";

const EMPTY_PREVIEW: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

// Khởi tạo engine vẽ path (gấp khúc, sẽ render có mũi tên ở layer path).
export function initPath(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onComplete: (geometry: Geometry) => void
) {
    let coords: [number, number][] = [];

    // Xóa dữ liệu preview path.
    const clearPreview = () => {
        (map.getSource("draw-path-preview") as maplibregl.GeoJSONSource | undefined)?.setData(
            EMPTY_PREVIEW
        );
    };

    // Cập nhật path preview theo danh sách tọa độ tạm.
    const updatePreview = (lineCoords: [number, number][]) => {
        if (lineCoords.length < 2) {
            clearPreview();
            return;
        }

        (map.getSource("draw-path-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "LineString",
                        coordinates: lineCoords,
                    },
                },
            ],
        });
    };

    // Chốt path khi đủ số đỉnh tối thiểu.
    const finishPath = () => {
        if (getMode() !== "add-path" || coords.length < 2) return;

        const geometry: Geometry = {
            type: "LineString",
            coordinates: [...coords],
        };

        onComplete(geometry);
        coords = [];
        clearPreview();
    };

    // Hủy phiên vẽ path hiện tại.
    const cancelPath = () => {
        coords = [];
        clearPreview();
    };

    // Xóa đỉnh cuối cùng của path đang vẽ.
    const removeLastVertex = () => {
        if (coords.length === 0) return;
        coords = coords.slice(0, -1);
        updatePreview(coords);
    };

    // Thêm một đỉnh path khi click map.
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (getMode() !== "add-path") return;

        coords.push([e.lngLat.lng, e.lngLat.lat]);
        updatePreview(coords);
    };

    // Cập nhật preview path động theo vị trí chuột.
    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
        const canvas = map.getCanvas();

        if (getMode() !== "add-path") {
            if (coords.length) {
                cancelPath();
            }
            if (canvas.style.cursor === "crosshair") {
                canvas.style.cursor = "";
            }
            return;
        }

        canvas.style.cursor = "crosshair";
        if (coords.length === 0) return;

        updatePreview([...coords, [e.lngLat.lng, e.lngLat.lat]]);
    };

    // Xử lý phím nóng Enter/Escape/Backspace cho chế độ vẽ path.
    const onKeyDown = (e: KeyboardEvent) => {
        if (getMode() !== "add-path") return;

        if (e.key === "Enter") {
            e.preventDefault();
            finishPath();
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            cancelPath();
            return;
        }

        if (e.key === "Backspace") {
            e.preventDefault();
            removeLastVertex();
        }
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);
    document.addEventListener("keydown", onKeyDown);

    const cleanup = () => {
        map.off("click", onClick);
        map.off("mousemove", onMove);
        document.removeEventListener("keydown", onKeyDown);
        cancelPath();
        if (map.getCanvas().style.cursor === "crosshair") {
            map.getCanvas().style.cursor = "";
        }
    };

    return {
        cleanup,
        cancel: cancelPath,
    };
}
