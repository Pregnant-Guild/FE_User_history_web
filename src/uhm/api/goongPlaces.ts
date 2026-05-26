import { buildGoongProxyUrl } from "@/uhm/api/config";

const GOONG_PLACE_API_URL = "https://rsapi.goong.io/Place";
const GOONG_GEOCODE_API_URL = "https://rsapi.goong.io/Geocode";

export type PresentPlacePrediction = {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
};

export type PresentPlaceSelection = {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
};

export type ReverseGeocodePlace = {
    label: string;
    address: string;
    lat: number;
    lng: number;
};

export function hasSearchMapApiKey(): boolean {
    return true;
}

export async function searchPresentPlaces(
    input: string,
    signal?: AbortSignal
): Promise<PresentPlacePrediction[]> {
    const keyword = input.trim();
    if (keyword.length < 2) return [];

    const proxyBase = buildGoongProxyUrl(`${GOONG_PLACE_API_URL}/AutoComplete`);
    const url = `${proxyBase}?input=${encodeURIComponent(keyword)}&limit=8`;

    const payload = await fetchGoongJson(url, signal);
    const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
    return predictions
        .map(normalizePrediction)
        .filter((prediction): prediction is PresentPlacePrediction => Boolean(prediction));
}

export async function fetchPresentPlaceDetail(
    placeId: string,
    signal?: AbortSignal
): Promise<PresentPlaceSelection> {
    const id = placeId.trim();
    if (!id) {
        throw new Error("Thiếu place_id.");
    }

    const proxyBase = buildGoongProxyUrl(`${GOONG_PLACE_API_URL}/Detail`);
    const url = `${proxyBase}?place_id=${encodeURIComponent(id)}`;

    const payload = await fetchGoongJson(url, signal);
    const result = isRecord(payload.result) ? payload.result : null;
    const location = isRecord(result?.geometry) && isRecord(result.geometry.location)
        ? result.geometry.location
        : null;
    const lat = toFiniteNumber(location?.lat);
    const lng = toFiniteNumber(location?.lng);

    if (lat === null || lng === null) {
        throw new Error("Không tìm thấy tọa độ địa điểm.");
    }

    const name = normalizeText(result?.name) || normalizeText(result?.formatted_address) || id;
    const address = normalizeText(result?.formatted_address) || normalizeText(result?.address) || name;
    return {
        placeId: id,
        name,
        address,
        lat,
        lng,
    };
}

export async function reverseGeocodePresentPlace(
    lng: number,
    lat: number,
    signal?: AbortSignal
): Promise<ReverseGeocodePlace> {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new Error("Tọa độ reverse geocode không hợp lệ.");
    }

    const proxyBase = buildGoongProxyUrl(GOONG_GEOCODE_API_URL);
    const url = `${proxyBase}?latlng=${lat},${lng}`;

    const payload = await fetchGoongJson(url, signal);
    const results = Array.isArray(payload.results) ? payload.results : [];
    const firstResult = results.find((item) => isRecord(item)) as Record<string, unknown> | undefined;
    if (!firstResult) {
        throw new Error("Không tìm thấy địa chỉ gần tọa độ này.");
    }

    const address = normalizeText(firstResult.formatted_address) ||
        normalizeText(firstResult.description) ||
        normalizeText(firstResult.name);
    const label = buildReverseGeocodeLabel(firstResult) || address;
    if (!label && !address) {
        throw new Error("Goong không trả về địa chỉ hợp lệ.");
    }

    return {
        label: label || address,
        address: address || label,
        lat,
        lng,
    };
}

async function fetchGoongJson(url: string | URL, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
        throw new Error(`Goong request failed (${response.status}).`);
    }

    const payload = await response.json() as unknown;
    if (!isRecord(payload)) {
        throw new Error("Goong response không hợp lệ.");
    }

    const status = normalizeText(payload.status).toUpperCase();
    if (status && status !== "OK") {
        const message = normalizeText(payload.error_message) || normalizeText(payload.message) || "Goong request failed.";
        throw new Error(message);
    }

    return payload;
}

function normalizePrediction(input: unknown): PresentPlacePrediction | null {
    if (!isRecord(input)) return null;

    const placeId = normalizeText(input.place_id);
    const description = normalizeText(input.description);
    if (!placeId || !description) return null;

    const structured = isRecord(input.structured_formatting) ? input.structured_formatting : null;
    const mainText = normalizeText(structured?.main_text) || description;
    const secondaryText = normalizeText(structured?.secondary_text);

    return {
        placeId,
        description,
        mainText,
        secondaryText,
    };
}

function buildReverseGeocodeLabel(result: Record<string, unknown>): string {
    const compound = isRecord(result.compound) ? result.compound : null;
    if (compound) {
        const parts = [
            normalizeText(compound.commune),
            normalizeText(compound.district),
            normalizeText(compound.province),
        ].filter((part) => part.length > 0);
        if (parts.length) {
            return Array.from(new Set(parts)).join(", ");
        }
    }

    return normalizeText(result.formatted_address) ||
        normalizeText(result.description) ||
        normalizeText(result.name);
}


function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value: unknown): number | null {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
