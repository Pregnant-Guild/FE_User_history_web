import api from "@/config/config";
import { API } from "../../api";

export const createHistorianCV = async (payload: any) => {
  const response = await api.post(API.Historian.CREATE_CV, payload);
  return response?.data;
};

export const apiGetUserApplications = async (payload :any) => {
  const response = await api.get(API.Historian.APPLICATION, { params: payload });
  return response?.data;
};

export const apiDeleteHistorianCV = async (id: number | string) => {
  const response = await api.delete(API.Historian.DELETE_CV(id));
  return response?.data;
};