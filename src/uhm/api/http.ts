import type { ApiEnvelope } from "@/uhm/types/api";
import { API_ENDPOINTS } from "@/uhm/api/config";

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

// BackEndGo auth flow: cookie-based (httpOnly access_token/refresh_token).
// We intentionally do not store bearer tokens in localStorage in this FE.

type RequestJsonOptions = {
    skipAuth?: boolean;
    skipRefresh?: boolean;
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
    const res = await fetch(input, nextInit);

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
        // Always include cookies (BackEndGo sets httpOnly access_token/refresh_token cookies).
        credentials: init?.credentials ?? "include",
    };

    // Cookie-based auth only.
    // Keep the function so call sites don't change, but never inject Authorization headers.
    if (options?.skipAuth) return baseInit;
    return baseInit;
}

async function tryRefreshTokens(): Promise<boolean> {
    try {
        await requestJson(
            API_ENDPOINTS.authRefresh,
            { method: "POST" },
            { skipAuth: true, skipRefresh: true }
        );
        return true;
    } catch {
        return false;
    }
}
