import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Message } from "../types";
import { fetchMessages, streamChat } from "../services/api";
import { useUiStore } from "./uiStore";
import { useConversationStore } from "./conversationStore";

interface ChatState {
  messages: Record<string, Message[]>;
  loadingMessages: boolean;
  streamStatus: "idle" | "streaming" | "error";
  streamingContent: string;
  abortController: AbortController | null;

  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, providerId?: string) => Promise<void>;
  stopStreaming: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: {},
      loadingMessages: false,
      streamStatus: "idle",
      streamingContent: "",
      abortController: null,

      loadMessages: async (conversationId: string) => {
        set({ loadingMessages: true });
        try {
          const list = await fetchMessages(conversationId);
          set((state) => ({
            messages: { ...state.messages, [conversationId]: list },
            loadingMessages: false,
          }));
        } catch {
          set({ loadingMessages: false });
        }
      },

      sendMessage: async (
        conversationId: string,
        content: string,
        providerId?: string
      ) => {
        const trimmed = content.trim();
        if (!trimmed) return;

        // 1. Optimistically insert user message
        const tempUserMsg: Message = {
          id: `temp-user-${Date.now()}`,
          role: "user",
          content: trimmed,
          created_at: new Date().toISOString(),
        };

        const currentMessages = get().messages[conversationId] || [];
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: [...currentMessages, tempUserMsg],
          },
          streamStatus: "streaming",
          streamingContent: "",
        }));

        // Auto-update conversation title in UI if it's currently "New Chat"
        const conv = useConversationStore.getState().conversations.find((c) => c.id === conversationId);
        if (conv && conv.title === "New Chat") {
          const autoTitle = trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}...`;
          useConversationStore.getState().updateConversationTitle(conversationId, autoTitle);
        }

        const controller = new AbortController();
        set({ abortController: controller });

        let accumulated = "";

        await streamChat({
          conversationId,
          content: trimmed,
          providerId,
          signal: controller.signal,
          onDelta: (delta: string) => {
            accumulated += delta;
            set({ streamingContent: accumulated });
          },
          onEnd: () => {
            const finalContent = accumulated || get().streamingContent;
            if (finalContent) {
              const assistantMsg: Message = {
                id: `temp-asst-${Date.now()}`,
                role: "assistant",
                content: finalContent,
                provider: providerId,
                created_at: new Date().toISOString(),
              };
              set((state) => ({
                messages: {
                  ...state.messages,
                  [conversationId]: [...(state.messages[conversationId] || []), assistantMsg],
                },
              }));
            }
            set({
              streamStatus: "idle",
              streamingContent: "",
              abortController: null,
            });
            useUiStore.getState().setIsWakingUp(false);
          },
          onError: (error: Error) => {
            set({
              streamStatus: "error",
              abortController: null,
            });
            useUiStore.getState().addToast({
              type: "error",
              message: error.message || "Failed to stream message response.",
              retry: () => get().sendMessage(conversationId, trimmed, providerId),
            });
          },
          onWaking: () => {
            useUiStore.getState().setIsWakingUp(true);
          },
        });
      },

      stopStreaming: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
        }
        set({
          streamStatus: "idle",
          streamingContent: "",
          abortController: null,
        });
      },
    }),
    {
      name: "cached-messages",
      partialize: (state) => ({
        messages: state.messages,
      }),
    }
  )
);
