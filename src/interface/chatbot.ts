export interface ChatbotPayload {
  project_id?: string;
  question: string;
}

export interface ChatbotResponse {
  status: boolean;
  data: string;
}