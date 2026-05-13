export type StoredTokens = {
    access_token: string;
};

const LS_KEY = "uhm_auth_tokens_v1";

let cached: StoredTokens | null = null;

function safeParseTokens(raw: string | null): StoredTokens | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as Partial<StoredTokens>;
        if (!v || typeof v !== "object") return null;
        if (typeof v.access_token !== "string") return null;
        if (!v.access_token.trim()) return null;
        return { access_token: v.access_token };
    } catch {
        return null;
    }
}

export function getStoredTokens(): StoredTokens | null {
    if (cached) return cached;
    if (typeof window === "undefined") return null;
    cached = safeParseTokens(window.localStorage.getItem(LS_KEY));
    return cached;
}

export function setStoredTokens(tokens: StoredTokens | null): void {
    cached = tokens;
    if (typeof window === "undefined") return;
    if (!tokens) {
        window.localStorage.removeItem(LS_KEY);
        return;
    }
    window.localStorage.setItem(LS_KEY, JSON.stringify(tokens));
}

export function getAccessToken(): string | null {
    return getStoredTokens()?.access_token ?? null;
}

export function clearStoredTokens(): void {
    setStoredTokens(null);
}

// Helper for dealing with CommonResponse where token payload shape is not strictly typed.
export function extractTokensFromResponsePayload(payload: any): StoredTokens | null {
    const data = payload?.data ?? payload;
    // Common shapes observed in various backends:
    // - { status: true, data: { access_token, refresh_token } }
    // - { data: { tokens: { access_token, refresh_token } } }
    // - { data: { token: <access>, refresh_token } }
    // - { accessToken, refreshToken }
    const tokenContainer = data?.tokens ?? data?.token_set ?? data;

    const access =
        tokenContainer?.access_token ??
        tokenContainer?.accessToken ??
        tokenContainer?.token ??
        tokenContainer?.access ??
        tokenContainer?.jwt ??
        null;

    const refresh =
        tokenContainer?.refresh_token ??
        tokenContainer?.refreshToken ??
        tokenContainer?.refresh ??
        null;
    if (typeof access === "string" && access.trim()) {
        return { access_token: access };
    }
    return null;
}
