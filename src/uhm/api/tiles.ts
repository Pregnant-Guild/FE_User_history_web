import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";

export type TileMetadata = Record<string, string>;

export function getVectorTileTemplateUrl(): string {
    return API_ENDPOINTS.vectorTiles;
}

export function getRasterTileTemplateUrl(): string {
    return API_ENDPOINTS.rasterTiles;
}

export async function fetchVectorTilesMetadata(): Promise<TileMetadata> {
    return requestJson<TileMetadata>(API_ENDPOINTS.vectorTilesMetadata);
}

export async function fetchRasterTilesMetadata(): Promise<TileMetadata> {
    return requestJson<TileMetadata>(API_ENDPOINTS.rasterTilesMetadata);
}
