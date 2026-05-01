import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/useEditorState";
import type { ModeGetter } from "@/uhm/lib/engine/engineTypes";

// Khởi tạo engine vẽ polygon tự do theo chuỗi click.
export function initDrawing(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onComplete: (geometry: Geometry) => void
) {
    let coords: [number, number][] = [];

    const clearPreview = () => {
        (map.getSource("draw-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: [],
        });
    };

    const cancelDrawing = () => {
        coords = [];
        clearPreview();
    };

    // Đóng vòng polygon nếu điểm cuối chưa trùng điểm đầu.
    function closePolygon(c: [number, number][]) {
        if (c.length < 3) return c;
        const first = c[0];
        const last = c[c.length - 1];

        if (first[0] !== last[0] || first[1] !== last[1]) {
            return [...c, first];
        }
        return c;
    }

    // Cập nhật layer preview trong lúc đang vẽ.
    function update(c: [number, number][]) {
        const closed = closePolygon(c);

        (map.getSource("draw-preview") as maplibregl.GeoJSONSource)?.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [closed],
                    },
                },
            ],
        });
    }

    // Ghi nhận đỉnh polygon mới khi click map.
    function onClick(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "draw") return;

        coords.push([e.lngLat.lng, e.lngLat.lat] as [number, number]);
        update(coords);
    }

    // Render preview polygon với điểm chuột hiện tại.
    function onMove(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "draw" || coords.length === 0) return;

        const preview: [number, number][] = [
            ...coords,
            [e.lngLat.lng, e.lngLat.lat] as [number, number],
        ];
        update(preview);
    }

    // Hoàn tất polygon, trả geometry ra ngoài và reset preview.
    function finishDrawing() {
        if (getMode() !== "draw" || coords.length < 3) return;

        const geometry: Geometry = {
            type: "Polygon",
            coordinates: [closePolygon(coords)],
        };

        onComplete(geometry);
        cancelDrawing();
    }

    // Lắng nghe Enter để chốt polygon.
    function onKeyDown(e: KeyboardEvent) {
        if (getMode() !== "draw") return;
        if (e.key === "Enter") {
            e.preventDefault();
            finishDrawing();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            cancelDrawing();
            return;
        }
        if (e.key === "Backspace") {
            e.preventDefault();
            coords = coords.slice(0, -1);
            if (coords.length) {
                update(coords);
            } else {
                clearPreview();
            }
        }
    }

    map.on("click", onClick);
    map.on("mousemove", onMove);
    document.addEventListener("keydown", onKeyDown);

    const cleanup = () => {
        map.off("click", onClick);
        map.off("mousemove", onMove);
        document.removeEventListener("keydown", onKeyDown);
        cancelDrawing();
    };

    return {
        cleanup,
        cancel: cancelDrawing,
    };
}
