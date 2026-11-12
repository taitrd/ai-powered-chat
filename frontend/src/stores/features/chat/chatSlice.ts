import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Message } from "../../../types";
import type { RootState } from "../../index";
import { fetchMessages } from "./chatThunks";

/** A reply being streamed into one conversation. */
export interface ActiveStream {
  /** Text received so far. Empty while the model is still thinking. */
  content: string;
}

export interface ChatState {
  /** Messages for each conversation, keyed by conversation ID. */
  byConversation: Record<string, Message[]>;
  loadingMessages: boolean;
  /**
   * Replies in progress, keyed by conversation ID. Each conversation has its own
   * stream, so a new or different chat never shows another chat's "Thinking..." state,
   * and a reply keeps streaming into its own chat while you look at another one.
   */
  streams: Record<string, ActiveStream>;
}

export const initialState: ChatState = {
  byConversation: {},
  loadingMessages: false,
  streams: {},
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
      state.streams[action.payload] = { content: "" };
    },
    streamDelta(state, action: PayloadAction<{ conversationId: string; delta: string }>) {
      const stream = state.streams[action.payload.conversationId];
      if (stream) stream.content += action.payload.delta;
    },
    /** Ends the stream, keeping any reply text as a message. */
    streamFinished(state, action: PayloadAction<{ conversationId: string; message: Message | null }>) {
      const { conversationId, message } = action.payload;
      if (message) (state.byConversation[conversationId] ??= []).push(message);
      delete state.streams[conversationId];
    },
    /** The reply failed. The error is shown as a toast with Retry. */
    streamFailed(state, action: PayloadAction<string>) {
      delete state.streams[action.payload];
    },
    streamStopped(state, action: PayloadAction<string>) {
      delete state.streams[action.payload];
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

/** The reply streaming into the active conversation, if any. */
export const selectActiveStream = (state: RootState): ActiveStream | undefined => {
  const { activeId } = state.conversations;
  return activeId ? state.chat.streams[activeId] : undefined;
};

/** Whether a conversation is waiting for or receiving a reply. */
export const selectIsStreaming = (state: RootState, conversationId: string): boolean =>
  conversationId in state.chat.streams;

export default chatSlice.reducer;
