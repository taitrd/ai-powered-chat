import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Message } from "../../../types";
import type { RootState } from "../../index";
import { fetchMessages } from "./chatThunks";

export type StreamStatus = "idle" | "streaming" | "error";

export interface ChatState {
  /** Messages for each conversation, keyed by conversation ID. */
  byConversation: Record<string, Message[]>;
  loadingMessages: boolean;
  streamStatus: StreamStatus;
  streamingContent: string;
  streamingConversationId: string | null;
}

export const initialState: ChatState = {
  byConversation: {},
  loadingMessages: false,
  streamStatus: "idle",
  streamingContent: "",
  streamingConversationId: null,
};

const EMPTY_MESSAGES: Message[] = [];

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    messageAdded(state, action: PayloadAction<{ conversationId: string; message: Message }>) {
      const { conversationId, message } = action.payload;
      (state.byConversation[conversationId] ??= []).push(message);
    },
    streamStarted(state, action: PayloadAction<string>) {
      state.streamStatus = "streaming";
      state.streamingContent = "";
      state.streamingConversationId = action.payload;
    },
    streamDelta(state, action: PayloadAction<string>) {
      state.streamingContent += action.payload;
    },
    /** Ends the stream, keeping any reply text as a message. */
    streamFinished(state, action: PayloadAction<{ conversationId: string; message: Message | null }>) {
      const { conversationId, message } = action.payload;
      if (message) (state.byConversation[conversationId] ??= []).push(message);
      state.streamStatus = "idle";
      state.streamingContent = "";
      state.streamingConversationId = null;
    },
    streamFailed(state) {
      state.streamStatus = "error";
      state.streamingConversationId = null;
    },
    streamStopped(state) {
      state.streamStatus = "idle";
      state.streamingContent = "";
      state.streamingConversationId = null;
    },
    chatReset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.loadingMessages = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loadingMessages = false;
        state.byConversation[action.meta.arg] = action.payload;
      })
      .addCase(fetchMessages.rejected, (state) => {
        state.loadingMessages = false;
      });
  },
});

export const {
  messageAdded,
  streamStarted,
  streamDelta,
  streamFinished,
  streamFailed,
  streamStopped,
  chatReset,
} = chatSlice.actions;

/** Messages of the active conversation. Returns a stable empty array when there are none. */
export const selectActiveMessages = (state: RootState): Message[] => {
  const { activeId } = state.conversations;
  return (activeId && state.chat.byConversation[activeId]) || EMPTY_MESSAGES;
};

export default chatSlice.reducer;
