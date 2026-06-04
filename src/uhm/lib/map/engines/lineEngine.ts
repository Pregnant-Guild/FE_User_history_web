import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import type { ModeGetter } from "@/uhm/lib/map/engines/engineTypes";
import { snapToNearestGeometry } from "@/uhm/lib/map/engines/snapUtils";

const EMPTY_PREVIEW: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

// Khởi tạo engine vẽ line (gấp khúc, không mũi tên).
export function initLine(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onComplete: (geometry: Geometry) => void
) {
    let coords: [number, number][] = [];

    // Xóa dữ liệu preview line.
    const clearPreview = () => {
        if (!map.isStyleLoaded()) return;
        (map.getSource("draw-line-preview") as maplibregl.GeoJSONSource | undefined)?.setData(
            EMPTY_PREVIEW
        );
    };

    // Hủy phiên vẽ line hiện tại.
    const cancelLine = () => {
        coords = [];
        clearPreview();
    };

    // Cập nhật line preview theo danh sách tọa độ tạm.
    const updatePreview = (lineCoords: [number, number][]) => {
        if (lineCoords.length < 2) {
            clearPreview();
            return;
        }

        if (!map.isStyleLoaded()) return;
        (map.getSource("draw-line-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
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

    // Chốt line khi đủ số đỉnh tối thiểu.
    const finishLine = () => {
        if (getMode() !== "add-line" || coords.length < 2) return;

        const geometry: Geometry = {
            type: "LineString",
            coordinates: [...coords],
        };

        onComplete(geometry);
        cancelLine();
    };

    // Xóa đỉnh cuối cùng trong line đang vẽ.
    const removeLastVertex = () => {
        if (!coords.length) return;
        coords = coords.slice(0, -1);
        updatePreview(coords);
    };

    // Thêm một đỉnh line khi click map.
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (getMode() !== "add-line") return;

        const lngLat = e.originalEvent.shiftKey
            ? snapToNearestGeometry(map, e.lngLat, e.point)
            : e.lngLat;

        coords.push([lngLat.lng, lngLat.lat]);
        updatePreview(coords);
    };

    // Cập nhật preview động theo vị trí chuột.
    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
        const canvas = map.getCanvas();

        if (getMode() !== "add-line") {
            if (coords.length) {
                cancelLine();
            }
            if (canvas && canvas.style.cursor === "crosshair") {
                canvas.style.cursor = "";
            }
            return;
        }

        if (canvas) {
            canvas.style.cursor = "crosshair";
        }
        if (coords.length === 0) return;

        const lngLat = e.originalEvent.shiftKey
            ? snapToNearestGeometry(map, e.lngLat, e.point)
            : e.lngLat;
        updatePreview([...coords, [lngLat.lng, lngLat.lat]]);
    };

    // Xử lý phím nóng Enter/Escape/Backspace cho chế độ vẽ line.
    const onKeyDown = (e: KeyboardEvent) => {
        if (getMode() !== "add-line") return;

        if (e.key === "Enter") {
            e.preventDefault();
            finishLine();
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            cancelLine();
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
        try {
            map.off("click", onClick);
            map.off("mousemove", onMove);
            document.removeEventListener("keydown", onKeyDown);
            cancelLine();
            if (map.isStyleLoaded()) {
                const canvas = map.getCanvas();
                if (canvas && canvas.style.cursor === "crosshair") {
                    canvas.style.cursor = "";
                }
            }
        } catch {
            // ignore
        }
    };

    return {
        cleanup,
        cancel: cancelLine,
    };
}
