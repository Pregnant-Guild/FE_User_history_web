import type { ApiEnvelope } from "@/uhm/types/api";
import api from "@/config/config";
import type { AxiosError, AxiosRequestConfig } from "axios";

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

type RequestJsonOptions = {
    skipAuth?: boolean;
    skipRefresh?: boolean;
    authToken?: string | null; // Override bearer token (used for refresh).
};

type AuthAxiosRequestConfig = AxiosRequestConfig & RequestJsonOptions;

export async function requestJson<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: RequestJsonOptions
): Promise<T> {
    const url = typeof input === "string" ? input : String(input);
    const method = init?.method || "GET";
    
    // Convert RequestInit.body to object if it's a JSON string.
    let data = init?.body;
    if (typeof data === "string" && data.length > 0) {
        try {
            data = JSON.parse(data);
        } catch {
            // Keep as string if not JSON.
        }
    }

    try {
        const requestConfig: AuthAxiosRequestConfig = {
            url,
            method,
            data,
            headers: normalizeRequestHeaders(init?.headers),
            // Custom properties for our axios interceptor.
            skipAuth: options?.skipAuth,
            authToken: options?.authToken,
            skipRefresh: options?.skipRefresh,
        };
        const response = await api.request(requestConfig);

        const payload = response.data;
        const envelope = isApiEnvelopeLike<T>(payload) ? payload : null;

        if (envelope) {
            const isError = envelope.status === false || envelope.status === "error";
            if (isError) {
                const message = extractErrorMessage(payload, envelope) || "Request failed";
                throw new ApiError(message, response.status, stringifyPayload(envelope), normalizeErrors(envelope.errors));
            }
            return (envelope.data ?? null) as T;
        }

        return payload as T;
    } catch (err: unknown) {
        if (err instanceof ApiError) throw err;

        const axiosError = err as AxiosError<unknown>;
        const status = axiosError.response?.status || 0;
        const payload = axiosError.response?.data;
        const envelope = isApiEnvelopeLike<T>(payload) ? payload : null;
        const message = extractErrorMessage(payload, envelope) || (err instanceof Error ? err.message : "") || "Request failed";
        const body = envelope ? stringifyPayload(envelope) : stringifyPayload(payload);
        const errors = envelope?.errors ? normalizeErrors(envelope.errors) : [];

        throw new ApiError(message, status, body, errors);
    }
}

export function jsonRequestInit(method: string, body: unknown): RequestInit {
    return {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
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
    const payloadRecord = isRecord(payload) ? payload : null;
    const msg =
        (typeof envelope?.message === "string" && envelope.message.trim()) ||
        (typeof payloadRecord?.message === "string" && payloadRecord.message.trim());
    if (msg) return msg;
    const errors = envelope?.errors ?? payloadRecord?.errors;
    if (typeof errors === "string" && errors.trim()) return errors.trim();
    if (Array.isArray(errors) && typeof errors[0] === "string") return errors[0];
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRequestHeaders(headers: RequestInit["headers"]): Record<string, string> | undefined {
    if (!headers) return undefined;
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers.map(([key, value]) => [key, value]));
    }
    return headers;
}

function stringifyPayload(payload: unknown): string {
    if (typeof payload === "string") return payload;
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}
