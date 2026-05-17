import type maplibregl from "maplibre-gl";
import type { FeatureCollection } from "@/uhm/types/geo";

/**
 * Các hàm xử lý tương tác bản đồ cho hệ thống Replay.
 * Hầu hết các hàm yêu cầu instance của MapLibre GL.
 */

export const mapActions = {
    // Đặt trạng thái camera toàn diện (center, zoom, pitch, bearing)
    set_camera_view: (
        map: maplibregl.Map,
        state: {
            center?: [number, number] | { lng: number; lat: number };
            zoom?: number;
            pitch?: number;
            bearing?: number;
            duration?: number;
        }
    ) => {
        const center = normalizeReplayCenter(state.center);
        const nextView: maplibregl.EaseToOptions = {
            duration: Number.isFinite(state.duration) ? state.duration : 2500,
        };

        if (center) {
            nextView.center = center;
        }
        if (Number.isFinite(state.zoom)) {
            nextView.zoom = state.zoom;
        }
        if (Number.isFinite(state.pitch)) {
            nextView.pitch = state.pitch;
        }
        if (Number.isFinite(state.bearing)) {
            nextView.bearing = state.bearing;
        }
        if (
            nextView.center == null &&
            nextView.zoom == null &&
            nextView.pitch == null &&
            nextView.bearing == null
        ) {
            return;
        }

        map.easeTo(nextView);
    },

    // Di chuyển mượt mà đến một geometry dựa trên ID
    fly_to_geometry: (map: maplibregl.Map, geometryId: string | number, draft: FeatureCollection) => {
        const feature = draft.features.find(f => String(f.properties.id) === String(geometryId));
        if (!feature) return;

        // Tính toán bounds từ geometry (giả định có helper hoặc dùng bbox của feature)
        // Ở đây tạm dùng center đơn giản nếu là Point, hoặc bounds nếu là đa giác
        if (feature.geometry.type === "Point") {
            map.flyTo({
                center: feature.geometry.coordinates as [number, number],
                zoom: Math.max(map.getZoom(), 10),
                duration: 3000,
            });
        } else {
            // Thực tế cần tính bbox, ở đây giả định map có hàm fitBounds hoặc tương đương
            // map.fitBounds(calculateBBox(feature.geometry), { padding: 50 });
        }
    },

    // Ẩn/hiện nhãn (labels) trên bản đồ
    toggle_labels: (map: maplibregl.Map, visible: boolean) => {
        const style = map.getStyle();
        if (!style) return;
        style.layers.forEach(layer => {
            const layout = "layout" in layer ? layer.layout : undefined;
            if (layer.type === 'symbol' && layout && typeof layout === "object" && "text-field" in layout) {
                map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
            }
        });
    },

    // Thay đổi bộ lọc thời gian trên bản đồ
    set_time_filter: (onYearChange: (year: number) => void, year: number) => {
        onYearChange(year);
    }
};

function normalizeReplayCenter(
    center: [number, number] | { lng: number; lat: number } | undefined
): [number, number] | null {
    if (Array.isArray(center) && center.length >= 2) {
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
    if (
        center &&
        typeof center === "object" &&
        "lng" in center &&
        "lat" in center
    ) {
        const lng = Number(center.lng);
        const lat = Number(center.lat);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
    return null;
}
