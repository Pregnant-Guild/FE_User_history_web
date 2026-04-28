import axios from "axios";
import { API } from "../../api";

const axiosInstance = axios.create({
  baseURL: "/",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.data && response.data.status === false) {
      return handleRefreshToken(response);
    }
    return response;
  },
  async (error) => {
    return Promise.reject(error);
  }
);

async function handleRefreshToken(originalResponse: any) {
  try {
    const refreshRes = await axios.get(API.Auth.REFRESH, { withCredentials: true });
    
    if (refreshRes.data && refreshRes.data.status !== false) {
      return axiosInstance(originalResponse.config);
    }
  } catch (err) {
    console.error("Refresh token failed", err);
  }
  return originalResponse;
}

export default axiosInstance;