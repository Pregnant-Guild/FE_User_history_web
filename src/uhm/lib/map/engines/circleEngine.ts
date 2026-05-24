import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/editor/state/useEditorState";
import type { ModeGetter } from "@/uhm/lib/map/engines/engineTypes";
import { buildCircleRing, distanceMeters } from "@/uhm/lib/map/geo/geoMath";

const CIRCLE_SEGMENTS = 72;
const MIN_RADIUS_METERS = 1;
const EMPTY_PREVIEW: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

// Khởi tạo engine vẽ circle bằng thao tác kéo chuột từ tâm ra biên.
export function initCircle(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onComplete: (geometry: Geometry) => void
) {
    let center: [number, number] | null = null;
    let radiusMeters = 0;
    let isDragging = false;
    let dragPanDisabledByCircle = false;

    // Xóa dữ liệu preview circle trên map.
    const clearPreview = () => {
        if (!map.isStyleLoaded()) return;
        (map.getSource("draw-circle-preview") as maplibregl.GeoJSONSource | undefined)?.setData(
            EMPTY_PREVIEW
        );
    };

    // Bật lại drag pan nếu trước đó bị tắt khi đang kéo vẽ circle.
    const releaseDragPan = () => {
        if (!dragPanDisabledByCircle) return;
        dragPanDisabledByCircle = false;
        if (map.isStyleLoaded() && !map.dragPan.isEnabled()) {
            map.dragPan.enable();
        }
    };

    // Reset toàn bộ trạng thái vẽ circle tạm thời.
    const resetDrawingState = () => {
        center = null;
        radiusMeters = 0;
        isDragging = false;
        clearPreview();
        releaseDragPan();
    };

    // Cập nhật polygon preview theo tâm và bán kính hiện tại.
    const updatePreview = () => {
        if (!center || radiusMeters < MIN_RADIUS_METERS) {
            clearPreview();
            return;
        }

        if (!map.isStyleLoaded()) return;
        const ring = buildCircleRing(center, radiusMeters, CIRCLE_SEGMENTS);
        (map.getSource("draw-circle-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [ring],
                    },
                },
            ],
        });
    };

    // Bắt đầu phiên vẽ circle khi nhấn chuột trái.
    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
        if (getMode() !== "add-circle") return;
        if ((e.originalEvent as MouseEvent | undefined)?.button !== 0) return;

        center = [e.lngLat.lng, e.lngLat.lat];
        radiusMeters = 0;
        isDragging = true;
        clearPreview();

        if (map.dragPan.isEnabled()) {
            map.dragPan.disable();
            dragPanDisabledByCircle = true;
        } else {
            dragPanDisabledByCircle = false;
        }
    };

    // Cập nhật bán kính theo vị trí chuột trong lúc kéo.
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
        const canvas = map.getCanvas();
        if (getMode() !== "add-circle") {
            if (canvas && canvas.style.cursor === "crosshair") {
                canvas.style.cursor = "";
            }
            if (isDragging) {
                resetDrawingState();
            }
            return;
        }

        if (canvas) {
            canvas.style.cursor = "crosshair";
        }
        if (!isDragging || !center) return;

        radiusMeters = distanceMeters(center, [e.lngLat.lng, e.lngLat.lat]);
        updatePreview();
    };

    // Hoàn tất circle và trả geometry cho callback.
    const finishCircle = () => {
        if (!isDragging || !center) {
            resetDrawingState();
            return;
        }

        if (radiusMeters < MIN_RADIUS_METERS) {
            resetDrawingState();
            return;
        }

        const ring = buildCircleRing(center, radiusMeters, CIRCLE_SEGMENTS);
        onComplete({
            type: "Polygon",
            coordinates: [ring],
            circle_center: center,
            circle_radius: radiusMeters,
        });
        resetDrawingState();
    };

    // Kết thúc thao tác kéo bằng mouseup chuột trái.
    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
        if (getMode() !== "add-circle") return;
        if ((e.originalEvent as MouseEvent | undefined)?.button !== 0) return;
        finishCircle();
    };

    // Hủy phiên vẽ circle khi nhấn Escape.
    const onKeyDown = (e: KeyboardEvent) => {
        if (getMode() !== "add-circle") return;
        if (e.key !== "Escape") return;
        e.preventDefault();
        resetDrawingState();
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);

    const cleanup = () => {
        try {
            map.off("mousedown", onMouseDown);
            map.off("mousemove", onMouseMove);
            map.off("mouseup", onMouseUp);
            document.removeEventListener("keydown", onKeyDown);
            resetDrawingState();
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
        cancel: resetDrawingState,
    };
}
