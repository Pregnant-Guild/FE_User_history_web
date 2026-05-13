import axios, { AxiosResponse } from "axios"
import { API_URL_ROOT } from "../../api"
import {
  clearStoredTokens,
  extractTokensFromResponsePayload,
  getAccessToken,
  getRefreshToken,
  setStoredTokens,
} from "@/auth/tokenStore"

const baseURL = API_URL_ROOT || "https://history-api.kain.id.vn"

const api = axios.create({
  baseURL,
  // Support both cookie-based auth (httpOnly) and Bearer JWT.
  withCredentials: true
})

// Dedicated instance for refresh to avoid interceptor loops and handle baseURL correctly.
const refreshApi = axios.create({
  baseURL,
  withCredentials: true
})

let isRefreshing = false
let queue: any[] = []

const processQueue = (error?: any) => {
  queue.forEach((p) => {
    if (error) p.reject(error)
    else p.resolve()
  })
  queue = []
}

api.interceptors.request.use((config: any) => {
  if (config.skipAuth) return config

  const token = config.authToken || getAccessToken()
  if (token) {
    const headers: any = config.headers || {}
    // If it's a retry after refresh, we MUST update the Authorization header with the fresh token.
    // Otherwise, we only set it if not already present.
    const hasAuth = !!(headers.Authorization || headers.authorization || (typeof headers.get === "function" && headers.get("Authorization")))
    
    if (config._retry || !hasAuth) {
      if (typeof headers.set === "function") headers.set("Authorization", `Bearer ${token}`)
      else headers.Authorization = `Bearer ${token}`
    }
    config.headers = headers
  }
  return config
})

function isAuthTokenExpiredMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  if (!normalized) return false
  // Be specific: don't match general "unauthorized" or "access denied" which could be 403.
  // Match only messages clearly indicating token expiration or invalidity.
  return (
    normalized.includes("invalid or expired jwt") ||
    normalized.includes("jwt expired") ||
    normalized.includes("token expired") ||
    normalized.includes("invalid token") ||
    normalized.includes("expired token") ||
    normalized.includes("token is invalid") ||
    normalized.includes("not authenticated")
  )
}

api.interceptors.response.use(
  async (res: AxiosResponse): Promise<AxiosResponse> => {
    // Opportunistically persist tokens from signin/refresh responses.
    const tokens = extractTokensFromResponsePayload(res?.data)
    if (tokens) setStoredTokens(tokens)

    // Handle backends that return 200 OK with status:false + expired token message.
    const data = res.data
    const originalRequest = res.config as any
    const url = String(originalRequest?.url || "")

    if (
      data &&
      data.status === false &&
      isAuthTokenExpiredMessage(data.message || "") &&
      !originalRequest._retry &&
      !originalRequest.skipRefresh &&
      !url.includes("/auth/")
    ) {
      return performRefreshAndRetry(originalRequest)
    }

    return res
  },
  async (err) => {
    const originalRequest = err.config as any

    const url = String(originalRequest?.url || "")
    if (err.response?.status === 401 && !originalRequest._retry && !originalRequest.skipRefresh && !url.includes("/auth/")) {
      return performRefreshAndRetry(originalRequest)
    }

    return Promise.reject(err)
  }
)

async function performRefreshAndRetry(originalRequest: any): Promise<AxiosResponse> {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      queue.push({
        resolve: () => resolve(api(originalRequest)),
        reject
      })
    })
  }

  originalRequest._retry = true
  isRefreshing = true

  try {
    const refreshToken = getRefreshToken()

    const tryHeaderRefresh = async () => {
      if (!refreshToken) return null
      // Use dedicated refreshApi to handle baseURL and credentials consistently.
      return refreshApi.post("/auth/refresh", {}, {
        headers: { Authorization: `Bearer ${refreshToken}` }
      })
    }

    const tryCookieRefresh = async () => {
      return refreshApi.post("/auth/refresh", {})
    }

    let refreshRes: any = null
    try {
      refreshRes = (await tryHeaderRefresh()) || (await tryCookieRefresh())
    } catch (e: any) {
      // If header-based refresh fails (wrong token type), fall back to cookie refresh.
      if (refreshToken && e?.response?.status === 401) {
        refreshRes = await tryCookieRefresh()
      } else {
        throw e
      }
    }

    const nextTokens = extractTokensFromResponsePayload(refreshRes?.data)
    if (nextTokens) setStoredTokens(nextTokens)
    // Some backends may return only a new access token; keep refresh token.
    else {
      const maybeAccess = (refreshRes?.data?.data?.access_token ?? refreshRes?.data?.access_token) as unknown
      if (typeof maybeAccess === "string" && maybeAccess.trim()) {
        if (refreshToken) setStoredTokens({ access_token: maybeAccess, refresh_token: refreshToken })
      }
    }

    processQueue()
    return api(originalRequest)
  } catch (refreshErr: any) {
    processQueue(refreshErr)
    // Only force logout when refresh token/session is truly invalid (401).
    // CRITICAL: Only redirect if we HAD a refresh token. If we didn't, it means 
    // the user was anonymous, and we should just let the error bubble up.
    const refreshToken = getRefreshToken()
    if (refreshToken && refreshErr?.response?.status === 401) {
      clearStoredTokens()
      if (typeof window !== "undefined") {
        window.location.href = "/signin"
      }
    }
    return Promise.reject(refreshErr)
  } finally {
    isRefreshing = false
  }
}

export default api
