import maplibregl from "maplibre-gl";
import { Geometry } from "@/uhm/lib/useEditorState";
import type { ModeGetter } from "@/uhm/lib/engine/engineTypes";

const EARTH_RADIUS_METERS = 6371008.8;
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
        (map.getSource("draw-circle-preview") as maplibregl.GeoJSONSource | undefined)?.setData(
            EMPTY_PREVIEW
        );
    };

    // Bật lại drag pan nếu trước đó bị tắt khi đang kéo vẽ circle.
    const releaseDragPan = () => {
        if (!dragPanDisabledByCircle) return;
        dragPanDisabledByCircle = false;
        if (!map.dragPan.isEnabled()) {
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
            if (canvas.style.cursor === "crosshair") {
                canvas.style.cursor = "";
            }
            if (isDragging) {
                resetDrawingState();
            }
            return;
        }

        canvas.style.cursor = "crosshair";
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
        map.off("mousedown", onMouseDown);
        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);
        document.removeEventListener("keydown", onKeyDown);
        resetDrawingState();
        if (map.getCanvas().style.cursor === "crosshair") {
            map.getCanvas().style.cursor = "";
        }
    };

    return {
        cleanup,
        cancel: resetDrawingState,
    };
}

// Tạo vòng polygon xấp xỉ hình tròn từ tâm, bán kính và số phân đoạn.
function buildCircleRing(
    center: [number, number],
    radiusMeters: number,
    segments: number
): [number, number][] {
    const ring: [number, number][] = [];
    for (let i = 0; i <= segments; i += 1) {
        const bearingDeg = (i / segments) * 360; // Chia đều 360 do quanh tâm để tạo các điểm trên vòng tròn.
        ring.push(destinationPoint(center, radiusMeters, bearingDeg));
    }
    return ring;
}

// Tính khoảng cách hai điểm theo công thức Haversine (đơn vị mét).
function distanceMeters(a: [number, number], b: [number, number]): number {
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const dLat = lat2 - lat1; // Delta vĩ độ (radian).
    const dLng = toRad(b[0] - a[0]); // Delta kinh độ (radian).

    const sinLat = Math.sin(dLat / 2); // Thành phần sin(dLat/2) của công thức Haversine.
    const sinLng = Math.sin(dLng / 2); // Thành phần sin(dLng/2) của công thức Haversine.
    const h =
        sinLat * sinLat +
        Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng; // h = haversine(d/R), độ lớn cung tròn chuẩn hóa.
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); // Góc tâm (radian) giữa hai điểm trên mặt cầu.
    return EARTH_RADIUS_METERS * c; // Khoảng cách cung tròn: d = R * c.
}

// Tính tọa độ điểm đích từ tâm, khoảng cách và góc phương vị.
function destinationPoint(
    center: [number, number],
    distance: number,
    bearingDeg: number
): [number, number] {
    const lat1 = toRad(center[1]);
    const lng1 = toRad(center[0]);
    const bearing = toRad(bearingDeg);
    const angularDistance = distance / EARTH_RADIUS_METERS; // d/R: khoảng cách góc trên mặt cầu.

    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinAngular = Math.sin(angularDistance);
    const cosAngular = Math.cos(angularDistance);

    const sinLat2 =
        sinLat1 * cosAngular +
        cosLat1 * sinAngular * Math.cos(bearing); // Công thức vĩ độ điểm đích theo great-circle.
    const lat2 = Math.asin(clamp(sinLat2, -1, 1)); // Kẹp [-1,1] để tránh sai số số học trước khi asin.

    const y = Math.sin(bearing) * sinAngular * cosLat1; // Tử số atan2 cho biến thiên kinh độ.
    const x = cosAngular - sinLat1 * Math.sin(lat2); // Mẫu số atan2 cho biến thiên kinh độ.
    const lng2 = lng1 + Math.atan2(y, x); // Kinh độ đích = kinh độ gốc + delta kinh độ.

    return [normalizeLng(toDeg(lng2)), toDeg(lat2)];
}

// Chuẩn hóa kinh độ về miền [-180, 180].
function normalizeLng(lng: number): number {
    let normalized = ((lng + 540) % 360) - 180; // Wrap về khoảng [-180, 180).
    if (normalized === -180) normalized = 180;
    return normalized;
}

// Kẹp giá trị trong đoạn [min, max].
function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

// Đổi đơn vị góc từ độ sang radian.
function toRad(value: number): number {
    return (value * Math.PI) / 180; // Đổi độ sang radian.
}

// Đổi đơn vị góc từ radian sang độ.
function toDeg(value: number): number {
    return (value * 180) / Math.PI; // Đổi radian sang độ.
}
