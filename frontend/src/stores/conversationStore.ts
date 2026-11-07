import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Conversation } from "../types";
import {
  fetchConversations,
  createConversation as apiCreateConversation,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
} from "../services/api";

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string | null) => void;
  createConversation: (title?: string) => Promise<Conversation>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => void;
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      loading: false,

      loadConversations: async () => {
        set({ loading: true });
        try {
          const res = await fetchConversations();
          set({ conversations: res.items, loading: false });
          if (!get().activeId && res.items.length > 0) {
            set({ activeId: res.items[0].id });
          }
        } catch {
          set({ loading: false });
        }
      },

      selectConversation: (id: string | null) => {
        set({ activeId: id });
      },

      createConversation: async (title?: string) => {
        const newConv = await apiCreateConversation(title);
        set((state) => ({
          conversations: [newConv, ...state.conversations],
          activeId: newConv.id,
        }));
        return newConv;
      },

      renameConversation: async (id: string, title: string) => {
        const updated = await apiRenameConversation(id, title);
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title: updated.title, updated_at: updated.updated_at } : c
          ),
        }));
      },

      updateConversationTitle: (id: string, title: string) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        }));
      },

      deleteConversation: async (id: string) => {
        await apiDeleteConversation(id);
        const { conversations, activeId } = get();
        const remaining = conversations.filter((c) => c.id !== id);
        let nextActive = activeId;
        if (activeId === id) {
          nextActive = remaining.length > 0 ? remaining[0].id : null;
        }
        set({ conversations: remaining, activeId: nextActive });
      },
    }),
    {
      name: "cached-conversations",
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
      }),
    }
  )
);
