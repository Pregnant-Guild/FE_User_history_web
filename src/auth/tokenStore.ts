export type StoredTokens = {
    access_token: string;
};

let cached: StoredTokens | null = null;

export function getStoredTokens(): StoredTokens | null {
    return cached;
}

export function setStoredTokens(tokens: StoredTokens | null): void {
    cached = tokens;
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
    const tokenContainer = data?.tokens ?? data?.token_set ?? data;

    const access =
        tokenContainer?.access_token ??
        tokenContainer?.accessToken ??
        tokenContainer?.token ??
        tokenContainer?.access ??
        tokenContainer?.jwt ??
        null;

    if (typeof access === "string" && access.trim()) {
        return { access_token: access };
    }
    return null;
}
