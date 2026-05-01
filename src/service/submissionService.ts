import api from "@/config/config";
import { API } from "../../api";
import type { CommonResponse } from "@/interface/common";
import type {
  NestedPaginatedResponse,
  SearchSubmissionsParams,
  Submission,
  UpdateSubmissionStatusPayload,
} from "@/interface/submission";

export async function apiSearchSubmissions(
  params: SearchSubmissionsParams
): Promise<CommonResponse<NestedPaginatedResponse<Submission>>> {
  const response = await api.get(API.Submission.SEARCH, { params });
  return response?.data;
}

export async function apiGetSubmissionById(
  id: string
): Promise<CommonResponse<Submission>> {
  const response = await api.get(API.Submission.GET_BY_ID(id));
  return response?.data;
}

export async function apiUpdateSubmissionStatus(
  id: string,
  payload: UpdateSubmissionStatusPayload
): Promise<CommonResponse<Submission>> {
  const response = await api.patch(API.Submission.UPDATE_STATUS(id), payload);
  return response?.data;
}

export async function apiDeleteSubmission(id: string): Promise<CommonResponse> {
  const response = await api.delete(API.Submission.DELETE(id));
  return response?.data;
}

