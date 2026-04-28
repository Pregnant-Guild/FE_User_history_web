import api from "@/config/config";
import { API } from "../../api";
import { getUserDto } from "@/interface/admin";

export const apiGetListUser = async (payload: getUserDto) => {
  const response = await api.get(API.Admin.GET_LIST_USERS, {
    params: payload,
  });
  return response?.data;
};

export const apiChangeRole = async (id: string, payload: any) => {
  const response = await api.patch(API.Admin.CHANGE_ROLE(id), payload);
  return response?.data;
};
export const apiDeleteUser = async (id: string) => {
  const response = await api.delete(API.Admin.DELETE_USER(id));
  return response?.data;
};
export const apiRestoreUser = async (id: string) => {
  const response = await api.patch(API.Admin.RESTORE_USER(id));
  return response?.data;
};

export const apiGetAllRole = async () => {
  const response = await api.get(API.Admin.GET_ALL_ROLE);
  return response?.data;
};

export const apiGetUserMedia = async (id: string) => {
  const response = await api.get(API.Admin.GET_USER_MEDIA(id));
  return response?.data;
};

export const apiUpdateApplicationStatus = async (id: string, payload: any) => {
  const response = await api.put(API.Admin.UPDATE_APPLICATION_STATUS(id), payload);
  return response?.data;
};

export const apiGetUserById = async (userId: string) => {
  const response = await api.get(API.Admin.GET_USER_BY_ID(userId)); 
  return response?.data;
};