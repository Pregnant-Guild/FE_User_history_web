import api from "@/config/config";
import { API } from "../../api";
import { ChatbotPayload, ChatbotResponse } from "@/interface/chatbot";

export const apiChatbot = async (payload: ChatbotPayload): Promise<ChatbotResponse> => {
  const response = await api.post(API.Chatbot.CHAT,payload);
  return await response?.data;
};