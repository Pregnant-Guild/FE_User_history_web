import type maplibregl from "maplibre-gl";
import type { FeatureCollection } from "@/uhm/types/geo";
import { fitMapToFeatureCollection, getFeatureCollectionBBox } from "@/uhm/components/map/mapUtils";

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

    // Di chuyển mượt mà đến một hoặc nhiều geometry dựa trên ID.
    fly_to_geometries: (
        map: maplibregl.Map,
        geometryIds: Array<string | number>,
        draft: FeatureCollection,
        duration = 2200
    ) => {
        const ids = new Set(
            geometryIds
                .map((id) => String(id).trim())
                .filter((id) => id.length > 0)
        );
        if (!ids.size) return;

        const targetFeatures = draft.features.filter((feature) =>
            ids.has(String(feature.properties.id))
        );
        if (!targetFeatures.length) return;

        fitMapToFeatureCollection(
            map,
            {
                type: "FeatureCollection",
                features: targetFeatures,
            },
            64,
            {
                duration,
                maxZoom: 8.5,
                pointZoom: 8,
            }
        );
    },

    orbit_camera_around_geometry: (
        map: maplibregl.Map,
        geometryId: string | number,
        draft: FeatureCollection,
        zoom = 8,
        pitch = 45,
        turns = 1,
        duration = 5000
    ) => {
        const feature = draft.features.find(
            (item) => String(item.properties.id) === String(geometryId)
        );
        if (!feature) return;

        const bbox = getFeatureCollectionBBox({
            type: "FeatureCollection",
            features: [feature],
        });
        if (!bbox) return;

        map.easeTo({
            center: [
                (bbox.minLng + bbox.maxLng) / 2,
                (bbox.minLat + bbox.maxLat) / 2,
            ],
            zoom,
            pitch,
            bearing: map.getBearing() + (Number.isFinite(turns) ? turns * 360 : 360),
            duration,
        });
    },

    // Ẩn/hiện nhãn (labels) trên bản đồ
    set_labels_visible: (map: maplibregl.Map, visible: boolean) => {
        const style = map.getStyle();
        if (!style) return;
        style.layers.forEach(layer => {
            const layout = "layout" in layer ? layer.layout : undefined;
            if (layer.type === 'symbol' && layout && typeof layout === "object" && "text-field" in layout) {
                map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
            }
        });
    },

    get_label_visibility: (map: maplibregl.Map): Record<string, "visible" | "none"> => {
        const style = map.getStyle();
        const state: Record<string, "visible" | "none"> = {};
        if (!style) return state;
        style.layers.forEach((layer) => {
            const layout = "layout" in layer ? layer.layout : undefined;
            if (layer.type !== "symbol" || !layout || typeof layout !== "object" || !("text-field" in layout)) {
                return;
            }
            state[layer.id] = layout.visibility === "none" ? "none" : "visible";
        });
        return state;
    },

    restore_label_visibility: (map: maplibregl.Map, state: Record<string, "visible" | "none">) => {
        const style = map.getStyle();
        if (!style) return;
        style.layers.forEach((layer) => {
            const layout = "layout" in layer ? layer.layout : undefined;
            if (layer.type === "symbol" && layout && typeof layout === "object" && "text-field" in layout) {
                const visibility = state[layer.id] ?? "visible";
                map.setLayoutProperty(layer.id, "visibility", visibility);
            }
        });
    },
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
