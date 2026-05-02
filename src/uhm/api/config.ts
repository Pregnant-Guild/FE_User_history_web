// Production BackEndGo API base URL.
// For local development, override with NEXT_PUBLIC_API_BASE_URL (e.g. http://localhost:3344).
const FALLBACK_API_BASE_URL = "https://history-api.kain.id.vn";

export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL || FALLBACK_API_BASE_URL;

export const API_ENDPOINTS = {
    geometries: `${API_BASE_URL}/geometries`,
    entities: `${API_BASE_URL}/entities`,
    wikis: `${API_BASE_URL}/wikis`,
    // New API uses projects + commits + submissions (JWT-protected).
    authSignin: `${API_BASE_URL}/auth/signin`,
    authRefresh: `${API_BASE_URL}/auth/refresh`,
    authLogout: `${API_BASE_URL}/auth/logout`,
    currentUser: `${API_BASE_URL}/users/current`,
    currentUserProjects: `${API_BASE_URL}/users/current/project`,
    projects: `${API_BASE_URL}/projects`,
    submissions: `${API_BASE_URL}/submissions`,
    vectorTiles: `${API_BASE_URL}/tiles/{z}/{x}/{y}`,
    rasterTiles: `${API_BASE_URL}/raster-tiles/{z}/{x}/{y}`,
    vectorTilesMetadata: `${API_BASE_URL}/tiles/metadata`,
    rasterTilesMetadata: `${API_BASE_URL}/raster-tiles/metadata`,
} as const;
