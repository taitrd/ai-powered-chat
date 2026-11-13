import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Conversation } from "../../../types";
import type { RootState } from "../../index";
import { clearMessages } from "../chat/chatThunks";
import {
  createConversation,
  deleteConversation,
  fetchConversations,
  renameConversation,
} from "./conversationsThunks";

export interface ConversationsState {
  items: Conversation[];
  activeId: string | null;
  loadingConversations: boolean;
  creatingConversation: boolean;
  /** IDs of conversations with a rename or delete in progress. */
  pendingIds: string[];
}

export const initialState: ConversationsState = {
  items: [],
  activeId: null,
  loadingConversations: false,
  creatingConversation: false,
  pendingIds: [],
};

function removePending(state: ConversationsState, id: string) {
  state.pendingIds = state.pendingIds.filter((pendingId) => pendingId !== id);
}

const conversationsSlice = createSlice({
  name: "conversations",
  initialState,
  reducers: {
    conversationSelected(state, action: PayloadAction<string | null>) {
      state.activeId = action.payload;
    },
    /** Optimistic title change, used for the auto-title after the first message. */
    conversationTitleUpdated(state, action: PayloadAction<{ id: string; title: string }>) {
      const conversation = state.items.find((c) => c.id === action.payload.id);
      if (conversation) conversation.title = action.payload.title;
    },
    /** The chat's size changed (a reply was saved, or the server reported it is full). */
    conversationCountsUpdated(
      state,
      action: PayloadAction<{ id: string; messages_left: number; message_count?: number }>,
    ) {
      const conversation = state.items.find((c) => c.id === action.payload.id);
      if (!conversation) return;
      conversation.messages_left = action.payload.messages_left;
      if (action.payload.message_count !== undefined) {
        conversation.message_count = action.payload.message_count;
      }
    },
    conversationsReset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.loadingConversations = true;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.loadingConversations = false;
        state.items = action.payload.items;
        const activeStillExists = state.items.some((c) => c.id === state.activeId);
        if (!activeStillExists) {
          state.activeId = state.items[0]?.id ?? null;
        }
      })
      .addCase(fetchConversations.rejected, (state) => {
        state.loadingConversations = false;
      })

      .addCase(createConversation.pending, (state) => {
        state.creatingConversation = true;
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        state.creatingConversation = false;
        state.items.unshift(action.payload);
        state.activeId = action.payload.id;
      })
      .addCase(createConversation.rejected, (state) => {
        state.creatingConversation = false;
      })

      .addCase(clearMessages.fulfilled, (state, action) => {
        const conversation = state.items.find((c) => c.id === action.meta.arg);
        if (conversation) {
          conversation.messages_left += conversation.message_count;
          conversation.message_count = 0;
        }
      })

      .addCase(renameConversation.pending, (state, action) => {
        state.pendingIds.push(action.meta.arg.id);
      })
      .addCase(renameConversation.fulfilled, (state, action) => {
        removePending(state, action.meta.arg.id);
        const conversation = state.items.find((c) => c.id === action.payload.id);
        if (conversation) {
          conversation.title = action.payload.title;
          conversation.updated_at = action.payload.updated_at;
        }
      })
      .addCase(renameConversation.rejected, (state, action) => {
        removePending(state, action.meta.arg.id);
      })

      .addCase(deleteConversation.pending, (state, action) => {
        state.pendingIds.push(action.meta.arg);
      })
      .addCase(deleteConversation.fulfilled, (state, action) => {
        const id = action.meta.arg;
        removePending(state, id);
        state.items = state.items.filter((c) => c.id !== id);
        if (state.activeId === id) {
          state.activeId = state.items[0]?.id ?? null;
        }
      })
      .addCase(deleteConversation.rejected, (state, action) => {
        removePending(state, action.meta.arg);
      });
  },
});

export const {
  conversationSelected,
  conversationTitleUpdated,
  conversationCountsUpdated,
  conversationsReset,
} =
  conversationsSlice.actions;

export const selectActiveConversation = (state: RootState): Conversation | undefined =>
  state.conversations.items.find((c) => c.id === state.conversations.activeId);

export default conversationsSlice.reducer;
