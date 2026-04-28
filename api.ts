export const API_URL_ROOT = process.env.NEXT_PUBLIC_API_URL_ROOT || "";
export const URL_MEDIA = process.env.NEXT_PUBLIC_URL_MEDIA || "";
export const HOME_URL = process.env.NEXT_PUBLIC_HOME_URL || "http://localhost:3000";
export const API = {
  User : {
    CURRENT: `${API_URL_ROOT}/users/current`,
    MEDIA: `${API_URL_ROOT}/users/current/media`,
    Update: `${API_URL_ROOT}/users/current`,
    CHANGE_PASSWORD: `${API_URL_ROOT}/users/current/password`,
    APPLICATION: `${API_URL_ROOT}/users/current/application`
  },
  Media:{
    GET_MEDIA: `${API_URL_ROOT}/media`,
    PRESIGNED: `${API_URL_ROOT}/media/presigned`,
    GET_MEDIA_BY_ID: (Id: number | string) => `${API_URL_ROOT}/media/${Id}`,
    DELETE_MEDIA_BY_ID: (Id: number | string) => `${API_URL_ROOT}/media/${Id}`,
    DELETE_MEDIA: `${API_URL_ROOT}/media`,
  },
  Auth : {
    LOGOUT: `${API_URL_ROOT}/auth/logout`,
    SIGNUP: `${API_URL_ROOT}/auth/signup`,
    SIGNIN: `${API_URL_ROOT}/auth/signin`,
    CREATEOTP: `${API_URL_ROOT}/auth/token/create`,
    VERIFYOTP: `${API_URL_ROOT}/auth/token/verify`,
    REFRESH: `${API_URL_ROOT}/auth/refresh`,
    GOOGLE_LOGIN: `${API_URL_ROOT}/auth/google/login`,
    FORGOT_PASSWORD: `${API_URL_ROOT}/auth/forgot-password`,
  },
  Admin:{
    GET_USER_BY_ID: (Id: number | string) => `${API_URL_ROOT}/users/${Id}`,
    GET_LIST_USERS: `${API_URL_ROOT}/users`,
    CHANGE_ROLE: (Id: number | string) => `${API_URL_ROOT}/users/${Id}/role`,
    DELETE_USER: (Id: number | string) => `${API_URL_ROOT}/users/${Id}`,
    RESTORE_USER: (Id: number | string) => `${API_URL_ROOT}/users/${Id}/restore`,
    GET_USER_MEDIA: (Id: number | string) => `${API_URL_ROOT}/users/${Id}/media`,
    GET_ALL_ROLE: `${API_URL_ROOT}/roles`,
    UPDATE_APPLICATION_STATUS: (Id: number | string) => `${API_URL_ROOT}/historian/application/${Id}/status`
    
  },
  Historian:{
    CREATE_CV: `${API_URL_ROOT}/historian/application`,
    APPLICATION: `${API_URL_ROOT}/historian/application`,
    DELETE_CV: (Id: number | string) => `${API_URL_ROOT}/historian/application/${Id}`,
  }
}