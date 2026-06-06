import api from "@/config/config";
import type { AxiosRequestConfig } from "axios";
import { API } from "../../api";
import { clearStoredTokens, extractTokensFromResponsePayload, setStoredTokens } from "@/auth/tokenStore";

export interface SignUpPayload {
  display_name: string;
  email: string;
  password: string;
  token_id: string;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface ResetPasswordPayload {
  email: string;
  new_password: string;
  token_id: string;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export const apiCreateOTP = async (email: string, token_type: number = 2) => {
  const response = await api.post(API.Auth.CREATEOTP, { 
    email, 
    token_type 
  });
  return response.data;
};

export const apiVerifyOTP = async (email: string, token: string, token_type: number = 2) => {
  const body = { email, token, token_type };
  const response = await api.post(API.Auth.VERIFYOTP, body);
  return response.data; 
};

export const apiSignUp = async (payload: SignUpPayload) => {
  const response = await api.post(API.Auth.SIGNUP, payload);
  return response.data;
};

export const apiLogout = async () => {
  const response = await api.post(API.Auth.LOGOUT);
  clearStoredTokens();
  return response.data;
};

export const apiSignIn = async (payload: SignInPayload) => {
  const response = await api.post(API.Auth.SIGNIN, payload);
  const tokens = extractTokensFromResponsePayload(response?.data);
  if (tokens) setStoredTokens(tokens);
  return response.data;
};

export const apiResetPassword = async (payload: ResetPasswordPayload) => {
  const response = await api.post(API.Auth.FORGOT_PASSWORD, payload);
  return response.data;
};

type AuthRequestConfig = AxiosRequestConfig & {
  skipAuth?: boolean;
  skipRefresh?: boolean;
  authToken?: string | null;
};

export const apiGetCurrentUser = async (config?: AuthRequestConfig) => {
  const response = await api.get(API.User.CURRENT, config);
  return response?.data;
};

export const apiChangePassword = async (payload: ChangePasswordPayload) => {
  const response = await api.patch(API.User.CHANGE_PASSWORD, payload);
  return response?.data;
};
