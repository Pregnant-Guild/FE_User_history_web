import axios from "axios"
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

let isRefreshing = false
let queue: any[] = []

const processQueue = (error?: any) => {
  queue.forEach((p) => {
    if (error) p.reject(error)
    else p.resolve()
  })
  queue = []
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    const headers: any = config.headers || {}
    // Do not override if caller set Authorization explicitly (case-insensitive).
    const already =
      typeof headers.get === "function"
        ? headers.get("Authorization")
        : headers.Authorization || headers.authorization
    if (!already) {
      if (typeof headers.set === "function") headers.set("Authorization", `Bearer ${token}`)
      else headers.Authorization = `Bearer ${token}`
    }
    config.headers = headers
  }
  return config
})

api.interceptors.response.use(
  (res) => {
    // Opportunistically persist tokens from signin/refresh responses.
    const tokens = extractTokensFromResponsePayload(res?.data)
    if (tokens) setStoredTokens(tokens)
    return res
  },
  async (err) => {
    const originalRequest = err.config

    const url = String(originalRequest?.url || "")
    if (err.response?.status === 401 && !originalRequest._retry && !url.includes("/auth/")) {
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
          return axios.post(
            `${baseURL}/auth/refresh`,
            {},
            { headers: { Authorization: `Bearer ${refreshToken}` } }
          )
        }

        const tryCookieRefresh = async () => {
          return axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
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
          const maybeAccess = (refreshRes?.data?.data?.access_token ??
            refreshRes?.data?.access_token) as unknown
          if (typeof maybeAccess === "string" && maybeAccess.trim()) {
            // Keep refresh token if we have one; otherwise rely on cookies.
            if (refreshToken) setStoredTokens({ access_token: maybeAccess, refresh_token: refreshToken })
          }
        }

        processQueue()

        return api(originalRequest)
      } catch (refreshErr: any) {
        processQueue(refreshErr)
        // Only force logout when refresh token/session is truly invalid (401).
        if (refreshErr?.response?.status === 401) {
          clearStoredTokens()
          window.location.href = "/signin"
        }

        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

export default api
