const EARTH_RADIUS_METERS = 6371008.8;

// Đổi đơn vị góc từ độ sang radian.
export function toRad(value: number): number {
    return (value * Math.PI) / 180;
}

// Đổi đơn vị góc từ radian sang độ.
export function toDeg(value: number): number {
    return (value * 180) / Math.PI;
}

// Kẹp giá trị trong đoạn [min, max].
export function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

// Chuẩn hóa kinh độ về miền [-180, 180].
export function normalizeLng(lng: number): number {
    let normalized = ((lng + 540) % 360) - 180;
    if (normalized === -180) normalized = 180;
    return normalized;
}

// Tính khoảng cách hai điểm theo công thức Haversine (đơn vị mét).
export function distanceMeters(a: [number, number], b: [number, number]): number {
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const dLat = lat2 - lat1;
    const dLng = toRad(b[0] - a[0]);

    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_METERS * c;
}

// Tính tọa độ điểm đích từ tâm, khoảng cách và góc phương vị.
export function destinationPoint(
    center: [number, number],
    distance: number,
    bearingDeg: number
): [number, number] {
    const lat1 = toRad(center[1]);
    const lng1 = toRad(center[0]);
    const bearing = toRad(bearingDeg);
    const angularDistance = distance / EARTH_RADIUS_METERS;

    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinAngular = Math.sin(angularDistance);
    const cosAngular = Math.cos(angularDistance);

    const sinLat2 = sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearing);
    const lat2 = Math.asin(clamp(sinLat2, -1, 1));

    const y = Math.sin(bearing) * sinAngular * cosLat1;
    const x = cosAngular - sinLat1 * Math.sin(lat2);
    const lng2 = lng1 + Math.atan2(y, x);

    return [normalizeLng(toDeg(lng2)), toDeg(lat2)];
}

// Tạo vòng polygon xấp xỉ hình tròn từ tâm, bán kính và số phân đoạn.
export function buildCircleRing(
    center: [number, number],
    radiusMeters: number,
    segments: number = 72
): [number, number][] {
    const ring: [number, number][] = [];
    for (let i = 0; i <= segments; i += 1) {
        const bearingDeg = (i / segments) * 360;
        ring.push(destinationPoint(center, radiusMeters, bearingDeg));
    }
    return ring;
}
