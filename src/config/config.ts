import axios from "axios"
import { API_URL_ROOT } from "../../api"

const baseURL = API_URL_ROOT || "https://history-api.kain.id.vn"

const api = axios.create({
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

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (err.response?.status === 401 && !originalRequest._retry) {
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
        await axios.post(
          `${baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        )

        processQueue()

        return api(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr)

        window.location.href = "/signin"

        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

export default api