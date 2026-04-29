
import api from "@/config/config";
import { API } from "../../api";
import { Project, GetProjectsParams, UpdateProjectPayload, CreateProjectPayload, AddMemberPayload, UpdateMemberRolePayload, ChangeOwnerPayload, CreateCommitPayload, RestoreCommitPayload } from "@/interface/project";
import { CommonResponse, CursorPaginatedResponse, PaginatedResponse } from "@/interface/common";

export const apiCreateProject = async (payload: CreateProjectPayload): Promise<CommonResponse<Project>> => {
  const response = await api.post(API.Project.CREATE, payload);
  return response?.data;
};

export const apiGetProjectDetail = async (id: string): Promise<CommonResponse<Project>> => {
  const response = await api.get(API.Project.GET_DETAIL(id));
  return response?.data;
};

export const apiUpdateProject = async (id: string, payload: UpdateProjectPayload): Promise<CommonResponse<Project>> => {
  const response = await api.put(API.Project.UPDATE(id), payload);
  return response?.data;
};

export const apiDeleteProject = async (id: string): Promise<CommonResponse> => {
  const response = await api.delete(API.Project.DELETE(id));
  return response?.data;
};

export const getProjects = async (params: GetProjectsParams): Promise<PaginatedResponse<Project>> => {
  const response = await api.get(API.Project.GET_ALL, { params });
  return response?.data;
};

// ==========================================
// 2. NHÓM: QUẢN LÝ THÀNH VIÊN (MEMBERS)
// ==========================================

export const apiAddProjectMember = async (id: string, payload: AddMemberPayload): Promise<CommonResponse> => {
  const response = await api.post(API.Project.ADD_MEMBER(id), payload);
  return response?.data;
};

export const apiUpdateProjectMemberRole = async (id: string, userId: string, payload: UpdateMemberRolePayload): Promise<CommonResponse> => {
  const response = await api.put(API.Project.UPDATE_MEMBER(id, userId), payload);
  return response?.data;
};

export const apiRemoveProjectMember = async (id: string, userId: string): Promise<CommonResponse> => {
  const response = await api.delete(API.Project.REMOVE_MEMBER(id, userId));
  return response?.data;
};

export const apiChangeProjectOwner = async (id: string, payload: ChangeOwnerPayload): Promise<CommonResponse> => {
  const response = await api.put(API.Project.CHANGE_OWNER(id), payload);
  return response?.data;
};

// ==========================================
// 3. NHÓM: LỊCH SỬ BẢN LƯU (COMMITS)
// ==========================================

export const apiCreateProjectCommit = async (id: string, payload: CreateCommitPayload): Promise<CommonResponse> => {
  const response = await api.post(API.Project.CREATE_COMMIT(id), payload);
  return response?.data;
};

export const apiGetProjectCommits = async (id: string): Promise<CommonResponse> => { // Assuming it returns a list of commits
  const response = await api.get(API.Project.GET_COMMITS(id));
  return response?.data;
};

export const apiRestoreProjectCommit = async (id: string, payload: RestoreCommitPayload): Promise<CommonResponse> => {
  const response = await api.post(API.Project.RESTORE_COMMIT(id), payload);
  return response?.data;
};

export const getCurrentProject = async (params?: { cursor_id?: string; limit?: number }): Promise<CursorPaginatedResponse<Project>> => {
  const response = await api.get(API.Project.GET_CURRENT_PROJECT, { params });
  return response?.data;
};
