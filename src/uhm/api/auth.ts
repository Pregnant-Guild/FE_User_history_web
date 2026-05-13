import { API_ENDPOINTS } from "@/uhm/api/config";
import { jsonRequestInit, requestJson } from "@/uhm/api/http";
import { clearStoredTokens, setStoredTokens } from "@/auth/tokenStore";

export type AuthTokens = {
    access_token: string;
};

export type CurrentUser = {
    id: string;
    email?: string;
    display_name?: string;
    avatar_url?: string | null;
    roles?: string[];
};

export async function signIn(email: string, password: string): Promise<AuthTokens> {
    const res = await requestJson<AuthTokens>(
        API_ENDPOINTS.authSignin,
        jsonRequestInit("POST", { email, password }),
        { skipAuth: true }
    );
    if (res?.access_token) setStoredTokens(res);
    return res;
}

export async function logout(): Promise<void> {
    await requestJson(API_ENDPOINTS.authLogout, { method: "POST" });
    clearStoredTokens();
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
    return requestJson<CurrentUser>(API_ENDPOINTS.currentUser);
}
