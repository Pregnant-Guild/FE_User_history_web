import api from "@/config/config";
import { API } from "../../api";

export const apiCreateOTP = async (email: string) => {
  const token_type = 2;
  const response = await api.post(API.Auth.CREATEOTP, { 
    email, 
    token_type 
  });
  return response.data;
};

export const apiVerifyOTP = async (email: string, token: string) => {
  const body = { email, token, token_type: 2 };
  const response = await api.post(API.Auth.VERIFYOTP, body);
  return response.data; 
};

export const apiSignUp = async (payload: any) => {
  const response = await api.post(API.Auth.SIGNUP, payload);
  return response.data;
};

export const apiLogout = async () => {
  const response = await api.post(API.Auth.LOGOUT);
  return response.data;
};

export const apiSignIn = async (payload: any) => {
  const response = await api.post(API.Auth.SIGNIN, payload);
  return response.data;
};

export const apiResetPassword = async (payload: any) => {
  const response = await api.post(API.Auth.FORGOT_PASSWORD, payload);
  return response.data;
};

export const apiGetCurrentUser = async () => {
  const response = await api.get(API.User.CURRENT);
  return response?.data;
};

export const apiChangePassword = async (payload: any) => {
  const response = await api.patch(API.User.CHANGE_PASSWORD, payload);
  return response?.data;
};
