import type maplibregl from "maplibre-gl";
import type { FeatureCollection } from "@/uhm/types/geo";

/**
 * Các hàm xử lý tương tác bản đồ cho hệ thống Replay.
 * Hầu hết các hàm yêu cầu instance của MapLibre GL.
 */

export const mapActions = {
    // Di chuyển camera đến tọa độ [lng, lat]
    zoom_to_lnglat: (map: maplibregl.Map, lng: number, lat: number, zoom?: number) => {
        map.easeTo({
            center: [lng, lat],
            zoom: zoom ?? map.getZoom(),
            duration: 2000,
        });
    },

    // Thay đổi mức zoom của bản đồ
    zoom_scale: (map: maplibregl.Map, zoom: number) => {
        map.easeTo({
            zoom,
            duration: 1500,
        });
    },

    // Đặt trạng thái camera toàn diện (center, zoom, pitch, bearing)
    set_camera_view: (map: maplibregl.Map, state: { center: { lng: number; lat: number }; zoom: number; pitch: number; bearing: number }) => {
        map.easeTo({
            center: [state.center.lng, state.center.lat],
            zoom: state.zoom,
            pitch: state.pitch,
            bearing: state.bearing,
            duration: 2500,
        });
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

    // Xoay camera quanh một điểm
    rotate_around_point: (map: maplibregl.Map, duration: number = 5000) => {
        const startBearing = map.getBearing();
        map.easeTo({
            bearing: startBearing + 180,
            duration,
            easing: (t) => t,
        });
    },

    // Thay đổi màu của một geometry (thao tác trực tiếp trên layer map)
    change_geometry_color: (map: maplibregl.Map, geometryId: string | number, color: string) => {
        const layerId = `uhm-geo-${geometryId}`; // Giả định format ID layer
        if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'fill-color', color);
            map.setPaintProperty(layerId, 'line-color', color);
        }
    },

    // Ẩn/hiện nhãn (labels) trên bản đồ
    toggle_labels: (map: maplibregl.Map, visible: boolean) => {
        const style = map.getStyle();
        if (!style) return;
        style.layers.forEach(layer => {
            if (layer.type === 'symbol' && (layer as any).layout?.['text-field']) {
                map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
            }
        });
    },

    // Thay đổi bộ lọc thời gian trên bản đồ
    set_time_filter: (onYearChange: (year: number) => void, year: number) => {
        onYearChange(year);
    }
};
