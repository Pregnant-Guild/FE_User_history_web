import api from "@/config/config";
import { API } from "../../api";
import { Profile } from "@/interface/user";

export const apiGetCurrentUserMedia = async () => {
  const response = await api.get(API.User.MEDIA);
  return response?.data;
};

export const apiGetCurrentUserApplications = async () => {
  const response = await api.get(API.User.APPLICATION);
  return response?.data;
};

export const apiUpdateUser = async (payload: Profile) => {
  const response = await api.put(API.User.Update, payload);
  return response?.data;
};
