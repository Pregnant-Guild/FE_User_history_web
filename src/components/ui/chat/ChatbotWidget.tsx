"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatbotPayload } from "@/interface/chatbot";
import { apiChatbot, apiChatbotHistory } from "@/service/chatbotService";
import { AxiosError } from "axios";

type Message = {
  id: string;
  sender: "user" | "bot";
  text: string;
};

const cleanAnswer = (text: string) => {
  if (!text) return "";
  return text.replace(/<\/?answer>/gi, "").trim();
};

export default function ChatbotWidget({
  projectId = "",
  hideFloatingButton = false,
}: {
  projectId?: string;
  hideFloatingButton?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [preCursor, setPreCursor] = useState<string | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessagesLength = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Toggle chatbot visibility via window event
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener("toggle-chatbot", handleToggle);
    return () => {
      window.removeEventListener("toggle-chatbot", handleToggle);
    };
  }, []);

  // Fetch history from API
  const loadHistory = async (cursor?: string) => {
    setIsFetchingHistory(true);
    try {
      const res = await apiChatbotHistory({ cursor, limit: 10 });
      if (res && res.status && res.data) {
        const historyItems = res.data.items || [];
        const newMessages: Message[] = [];

        // Parse questions and answers from history items
        historyItems.forEach((item: any) => {
          newMessages.push({
            id: `${item.id}_q`,
            sender: "user",
            text: item.question,
          });
          newMessages.push({
            id: `${item.id}_a`,
            sender: "bot",
            text: cleanAnswer(item.answer),
          });
        });

        if (cursor) {
          // Prepended older messages should go to the top of the conversation list
          setMessages((prev) => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
          setHasLoadedHistory(true);
        }

        setPreCursor(res.data.pre_cursor || null);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  // Load history when chatbot is first opened
  useEffect(() => {
    if (isOpen && !hasLoadedHistory) {
      loadHistory();
    }
  }, [isOpen, hasLoadedHistory]);

  // Scroll to bottom when first opened
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen]);

  // Scroll to bottom only when new live messages are added at the end (not when older history is prepended)
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      scrollToBottom();
    }
    prevMessagesLength.current = messages.length;
  }, [messages]);

  // Auto focus input when opened or loading ends
  useEffect(() => {
    if (isOpen && !isLoading) {
      inputRef.current?.focus();
    }
  }, [isOpen, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const payload: ChatbotPayload = {
        project_id: projectId,
        question: userText,
      };

      const res = await apiChatbot(payload);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: res?.status
          ? cleanAnswer(res?.data)
          : "Xin lỗi, tôi không thể trả lời lúc này.",
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const axiosError = error as AxiosError<{ message: string }>;
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text:
          axiosError.response?.data?.message ||
          "Có lỗi xảy ra khi kết nối. Vui lòng thử lại sau.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const initMessage: Message = {
    id: "init",
    sender: "bot",
    text: "Xin chào! Tôi là trợ lý lịch sử thân thiện. Tôi có thể giúp gì cho bạn?",
  };

  const allMessages = [initMessage, ...messages];

  return (
    <div className="fixed bottom-8 right-8 z-50">
      {!isOpen && !hideFloatingButton && (
        <button
          name="AI chat"
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-brand-500 hover:bg-brand-600 text-white rounded-full flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-transform hover:scale-105"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
        </button>
      )}

      {/* Khung Chat */}
      {isOpen && (
        <div className="w-[360px] h-[520px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="px-4 py-3 bg-brand-500 text-white flex items-center justify-between shadow-sm z-10">
            <div className="font-semibold flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
                />
              </svg>
              <span>Trợ lý lịch sử</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-brand-600 rounded-lg transition-colors text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Nội dung Chat */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-gray-50 dark:bg-[#0d1117] text-sm">
            {/* Load older messages button */}
            {preCursor && (
              <div className="flex justify-center mb-1">
                <button
                  onClick={() => loadHistory(preCursor)}
                  disabled={isFetchingHistory}
                  className="text-xs text-brand-500 hover:text-brand-600 font-medium py-1 px-3 bg-brand-50 dark:bg-brand-950/20 rounded-full transition-colors disabled:opacity-50"
                >
                  {isFetchingHistory ? "Đang tải..." : "Xem tin nhắn cũ hơn"}
                </button>
              </div>
            )}

            {allMessages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm ${
                  msg.sender === "user"
                    ? "bg-brand-500 text-white self-end rounded-br-sm animate-in fade-in duration-200 slide-in-from-bottom-1"
                    : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-300 border border-gray-100 dark:border-gray-700 self-start rounded-bl-sm animate-in fade-in duration-200 slide-in-from-bottom-1"
                }`}
              >
                {msg.text}
              </div>
            ))}

            {isLoading && (
              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 self-start rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5 max-w-[80%]">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            )}

            {isFetchingHistory && !preCursor && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Khu vực Nhập Input */}
          <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Nhập câu hỏi..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="flex-1 bg-gray-100 dark:bg-gray-800 border-transparent focus:border-brand-500 focus:bg-white dark:focus:bg-gray-900 focus:ring-1 focus:ring-brand-500/20 rounded-full px-4 py-2.5 text-sm outline-none transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`p-2.5 rounded-full transition-colors flex shrink-0 items-center justify-center ${
                  !input.trim() || isLoading
                    ? "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                    : "bg-brand-500 text-white hover:bg-brand-600"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
