import type { ApiEnvelope } from "@/uhm/types/api";
import { API_ENDPOINTS } from "@/uhm/api/config";
import { getAccessToken, getRefreshToken, setStoredTokens, type StoredTokens, extractTokensFromResponsePayload } from "@/auth/tokenStore";

export class ApiError extends Error {
    status: number;
    body: string;
    errors: unknown[];

    constructor(message: string, status: number, body: string, errors: unknown[] = []) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
        this.errors = errors;
    }
}

// History API auth flow supports Bearer JWT and (in some deployments) cookie-based sessions.

type RequestJsonOptions = {
    skipAuth?: boolean;
    skipRefresh?: boolean;
    authToken?: string | null; // Override bearer token (used for refresh).
};

export async function requestJson<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: RequestJsonOptions
): Promise<T> {
    return requestJsonInternal<T>(input, init, options);
}

export function jsonRequestInit(method: string, body: unknown): RequestInit {
    return {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
}

async function requestJsonInternal<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: RequestJsonOptions
): Promise<T> {
    const nextInit = withAuthHeaders(init, options);
    let res: Response;
    try {
        res = await fetch(input, nextInit);
    } catch (err) {
        // Browser "TypeError: Failed to fetch" typically means:
        // - CORS blocked (common when using 127.0.0.1 instead of localhost in dev),
        // - DNS/TLS/network error,
        // - request blocked by the browser.
        const origin = typeof window !== "undefined" ? window.location.origin : "<server>";
        const url = typeof input === "string" ? input : String(input);
        const details = { origin, url, apiBase: API_ENDPOINTS.projects.split("/projects")[0] };
        throw new ApiError("Network error (failed to fetch)", 0, stringifyPayload(details));
    }

    // One-shot refresh + retry for protected endpoints.
    if (
        res.status === 401 &&
        !options?.skipRefresh &&
        !options?.skipAuth &&
        typeof input === "string" &&
        !String(input).includes("/auth/")
    ) {
        const refreshed = await tryRefreshTokens();
        if (refreshed) {
            return requestJsonInternal<T>(input, init, { ...(options || {}), skipRefresh: true });
        }
    }

    const payload = await parseJsonResponse(res);
    const envelope = isApiEnvelopeLike<T>(payload) ? payload : null;

    if (!res.ok) {
        const message = extractErrorMessage(payload, envelope) || `Request failed with status ${res.status}`;
        const body = envelope ? stringifyPayload(envelope) : stringifyPayload(payload);
        const errors = envelope?.errors ? normalizeErrors(envelope.errors) : [];
        throw new ApiError(message, res.status, body, errors);
    }

    if (envelope) {
        const isError =
            envelope.status === false ||
            envelope.status === "error";
        if (isError) {
            const message = extractErrorMessage(payload, envelope) || "Request failed";
            throw new ApiError(message, res.status, stringifyPayload(envelope), normalizeErrors(envelope.errors));
        }
        return (envelope.data ?? null) as T;
    }

    return payload as T;
}

async function parseJsonResponse(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text.length) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function isApiEnvelopeLike<T>(value: unknown): value is ApiEnvelope<T> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const source = value as Record<string, unknown>;
    return "status" in source && ("data" in source || "message" in source || "errors" in source);
}

function normalizeErrors(value: unknown): unknown[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    return [value];
}

function extractErrorMessage(payload: unknown, envelope: ApiEnvelope<unknown> | null): string | null {
    const msg =
        (typeof envelope?.message === "string" && envelope.message.trim()) ||
        (typeof (payload as any)?.message === "string" && String((payload as any).message).trim());
    if (msg) return msg;
    const errors = envelope?.errors ?? (payload as any)?.errors;
    if (typeof errors === "string" && errors.trim()) return errors.trim();
    if (Array.isArray(errors) && typeof errors[0] === "string") return errors[0];
    return null;
}

function stringifyPayload(payload: unknown): string {
    if (typeof payload === "string") return payload;
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}

function withAuthHeaders(init: RequestInit | undefined, options?: RequestJsonOptions): RequestInit | undefined {
    const baseInit: RequestInit = {
        ...init,
        credentials: init?.credentials ?? "include",
    };

    const headers = new Headers(baseInit.headers || undefined);

    const override = options?.authToken;
    if (override) {
        headers.set("Authorization", `Bearer ${override}`);
        return { ...baseInit, headers };
    }

    if (options?.skipAuth) return baseInit;

    const access = getAccessToken();
    if (access) headers.set("Authorization", `Bearer ${access}`);
    return { ...baseInit, headers };
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshTokens(): Promise<boolean> {
    // Single-flight refresh for concurrent 401s.
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
    try {
        const refreshToken = getRefreshToken();

        // Try header-based refresh first (per swagger), but fall back to cookie-based refresh if needed.
        let payload: unknown;
        try {
            payload = await requestJsonInternal<unknown>(
                API_ENDPOINTS.authRefresh,
                { method: "POST" },
                refreshToken
                    ? { skipRefresh: true, authToken: refreshToken }
                    : { skipRefresh: true, skipAuth: true }
            );
        } catch (err) {
            if (refreshToken && err instanceof ApiError && err.status === 401) {
                payload = await requestJsonInternal<unknown>(
                    API_ENDPOINTS.authRefresh,
                    { method: "POST" },
                    { skipRefresh: true, skipAuth: true }
                );
            } else {
                throw err;
            }
        }

        const next = extractTokensFromResponsePayload(payload) as StoredTokens | null;
        if (next) {
            setStoredTokens(next);
            return true;
        }

        // Fallback: if server returns only access_token, keep existing refresh token (if any).
        const maybeAccess = (payload as any)?.access_token ?? (payload as any)?.data?.access_token;
        if (typeof maybeAccess === "string" && maybeAccess.trim()) {
            if (refreshToken) setStoredTokens({ access_token: maybeAccess, refresh_token: refreshToken });
            return true;
        }

        return false;
    } catch {
        return false;
    }
    })();
    try {
        return await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}
