import { API_URL_ROOT } from "../../../api";

const GOONG_TILES_BASE_URL = "https://tiles.goong.io";

export const API_BASE_URL = normalizeApiBaseUrl(API_URL_ROOT);
const GOONG_PROXY_BASE_PATH = `${API_BASE_URL}/proxy`;

export const GOONG_SATELLITE_STYLE_UPSTREAM_URL = `${GOONG_TILES_BASE_URL}/assets/goong_satellite.json`;
export const GOONG_VECTOR_OVERLAY_STYLE_UPSTREAM_URL = `${GOONG_TILES_BASE_URL}/assets/goong_map_web.json`;
export const GOONG_GLYPHS_UPSTREAM_URL = `${GOONG_TILES_BASE_URL}/fonts/{fontstack}/{range}.pbf`;

export const USE_EXTERNAL_BACKGROUND_RASTER = API_BASE_URL.length > 0;

function normalizeApiBaseUrl(rawUrl: string): string {
    return rawUrl.trim().replace(/\/+$/, "");
}

export function stripGoongApiKeyFromUrl(rawUrl: string): string {
    const [basePart, hashPart = ""] = rawUrl.split("#", 2);
    const [pathPart, queryString = ""] = basePart.split("?", 2);
    const sanitizedQuery = queryString
        .split("&")
        .filter((segment) => segment && !segment.toLowerCase().startsWith("api_key="))
        .join("&");

    return `${pathPart}${sanitizedQuery ? `?${sanitizedQuery}` : ""}${hashPart ? `#${hashPart}` : ""}`;
}

export function buildGoongProxyUrl(rawUrl: string): string {
    const sanitizedUrl = stripGoongApiKeyFromUrl(rawUrl);
    const templateTokens: string[] = [];
    const tokenizedUrl = sanitizedUrl.replace(/\{[^}]+\}/g, (match) => {
        const tokenId = `__UHM_GOONG_URL_TOKEN_${templateTokens.length}__`;
        templateTokens.push(match);
        return tokenId;
    });

    let encodedUrl = encodeURIComponent(tokenizedUrl);
    templateTokens.forEach((token, index) => {
        const encodedTokenId = encodeURIComponent(`__UHM_GOONG_URL_TOKEN_${index}__`);
        encodedUrl = encodedUrl.replace(encodedTokenId, token);
    });

    return `${GOONG_PROXY_BASE_PATH}/${encodedUrl}`;
}

export const GOONG_GLYPHS_PROXY_URL = buildGoongProxyUrl(GOONG_GLYPHS_UPSTREAM_URL);

export const API_ENDPOINTS = {
    geometries: `${API_BASE_URL}/geometries`,
    entities: `${API_BASE_URL}/entities`,
    wikis: `${API_BASE_URL}/wikis`,
    wikiContent: (id: string) => `${API_BASE_URL}/wikis/content/${id}`,
    // New API uses projects + commits + submissions (JWT-protected).
    authSignin: `${API_BASE_URL}/auth/signin`,
    authRefresh: `${API_BASE_URL}/auth/refresh`,
    authLogout: `${API_BASE_URL}/auth/logout`,
    currentUser: `${API_BASE_URL}/users/current`,
    currentUserProjects: `${API_BASE_URL}/users/current/project`,
    projects: `${API_BASE_URL}/projects`,
    submissions: `${API_BASE_URL}/submissions`,
} as const;
