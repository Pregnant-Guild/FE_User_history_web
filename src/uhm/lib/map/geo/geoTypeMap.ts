import rows from "@/uhm/lib/map/geo/geoTypeMap.json";

export type GeoTypeMapRow = {
    type_key: string;
    geo_type_code: number;
};

const MAP_ROWS: GeoTypeMapRow[] = rows as GeoTypeMapRow[];

export const GEO_TYPE_KEYS: string[] = Array.from(
    new Set(
        MAP_ROWS
            .map((row) => (typeof row?.type_key === "string" ? row.type_key.trim().toLowerCase() : ""))
            .filter((key) => key.length > 0)
    )
);

const CODE_BY_KEY = new Map<string, number>();
const KEY_BY_CODE = new Map<number, string>();

for (const row of MAP_ROWS) {
    const key = typeof row?.type_key === "string" ? row.type_key.trim().toLowerCase() : "";
    const code = typeof row?.geo_type_code === "number" ? row.geo_type_code : Number.NaN;
    if (!key.length) continue;
    if (!Number.isFinite(code)) continue;
    CODE_BY_KEY.set(key, Math.trunc(code));
    KEY_BY_CODE.set(Math.trunc(code), key);
}

export function typeKeyToGeoTypeCode(key: string | null | undefined): number | null {
    if (!key) return null;
    const normalized = key.trim().toLowerCase();
    if (!normalized.length) return null;
    return CODE_BY_KEY.get(normalized) ?? null;
}

export function geoTypeCodeToTypeKey(code: number | null | undefined): string | null {
    if (code == null) return null;
    if (!Number.isFinite(code)) return null;
    return KEY_BY_CODE.get(Math.trunc(code)) ?? null;
}

export function normalizeGeoTypeKey(value: unknown): string | null {
    if (typeof value === "number") {
        return geoTypeCodeToTypeKey(value);
    }

    if (typeof value !== "string") return null;

    const normalized = value.trim().toLowerCase();
    if (!normalized.length) return null;

    if (/^-?\d+$/.test(normalized)) {
        return geoTypeCodeToTypeKey(Number(normalized));
    }

    return normalized;
}
