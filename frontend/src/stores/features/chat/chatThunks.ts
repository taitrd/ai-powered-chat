import * as messagesApi from "../../../services/api/messages/messagesApi";
import type { Message, SendMessageArgs } from "../../../types";
import type { AppThunk } from "../../index";
import { createAppAsyncThunk, errorMessage } from "../../hooks";
import { ApiError } from "../../../services/http/client";
import { conversationCountsUpdated, conversationTitleUpdated } from "../conversations/conversationsSlice";
import { wakingUpSet } from "../ui/uiSlice";
import { fetchServiceStatus, isDailyLimitError, showToast } from "../ui/uiThunks";
import {
  messageAdded,
  messageDiscarded,
  streamDelta,
  streamFailed,
  streamFinished,
  streamStarted,
  streamStopped,
} from "./chatSlice";

const DEFAULT_TITLE = "New Chat";
const AUTO_TITLE_LENGTH = 60;

// AbortControllers aren't serializable, so they live here instead of in Redux state.
// One per conversation, so stopping one chat's reply doesn't affect another's.
const controllers = new Map<string, AbortController>();

export const fetchMessages = createAppAsyncThunk(
  "chat/fetchMessages",
  async (conversationId: string, { rejectWithValue }) => {
    try {
      return await messagesApi.fetchMessages(conversationId);
    } catch (error) {
      return rejectWithValue(errorMessage(error, "Couldn't load messages."));
    }
  }
);

/** Loads the next older page of a conversation and puts it before the messages already shown. */
export const fetchOlderMessages = createAppAsyncThunk(
  "chat/fetchOlderMessages",
  async (conversationId: string, { getState, rejectWithValue }) => {
    const requestedCursor = getState().chat.nextCursor[conversationId] ?? null;
    try {
      const page = await messagesApi.fetchMessages(conversationId, requestedCursor ?? undefined);
      return { ...page, requestedCursor };
    } catch (error) {
      return rejectWithValue(errorMessage(error, "Couldn't load older messages."));
    }
  },
  {
    // Nothing older to load, or this chat is already loading a page.
    condition: (conversationId, { getState }) => {
      const { nextCursor, loadingOlder } = getState().chat;
      return Boolean(nextCursor[conversationId]) && !loadingOlder[conversationId];
    },
  }
);

/** Clears a chat (keeps its title and provider) so the user can keep going in it. */
export const clearMessages = createAppAsyncThunk(
  "chat/clearMessages",
  async (conversationId: string, { dispatch, rejectWithValue }) => {
    try {
      await messagesApi.clearMessages(conversationId);
    } catch (error) {
      const message = errorMessage(error, "Couldn't clear the chat.");
      dispatch(showToast({ type: "error", message }));
      return rejectWithValue(message);
    }
  }
);

function autoTitle(content: string): string {
  return content.length <= AUTO_TITLE_LENGTH
    ? content
    : `${content.slice(0, AUTO_TITLE_LENGTH - 3)}...`;
}

/** Sends a message and streams the reply into the store. */
export const sendMessage = createAppAsyncThunk(
  "chat/sendMessage",
  async ({ conversationId, content, providerId }: SendMessageArgs, { dispatch, getState }) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    dispatch(
      messageAdded({
        conversationId,
        message: {
          id: `temp-user-${Date.now()}`,
          role: "user",
          content: trimmed,
          created_at: new Date().toISOString(),
        },
      })
    );
    dispatch(streamStarted(conversationId));

    // Match the server's auto-title so the sidebar updates immediately.
    const conversation = getState().conversations.items.find((c) => c.id === conversationId);
    if (conversation?.title === DEFAULT_TITLE) {
      dispatch(conversationTitleUpdated({ id: conversationId, title: autoTitle(trimmed) }));
    }

    controllers.get(conversationId)?.abort(); // At most one reply per conversation.
    const controller = new AbortController();
    controllers.set(conversationId, controller);
    let accumulated = "";
    // True once a newer reply has replaced this one in the same conversation.
    // (A stopped reply is not superseded: its partial text is still kept.)
    const superseded = () => {
      const current = controllers.get(conversationId);
      return current !== undefined && current !== controller;
    };

    await messagesApi.streamChat({
      conversationId,
      content: trimmed,
      providerId,
      signal: controller.signal,
      onDelta: (delta) => {
        if (superseded()) return;
        accumulated += delta;
        dispatch(streamDelta({ conversationId, delta }));
      },
      onEnd: () => {
        if (superseded()) return;
        const message: Message | null = accumulated
          ? {
              id: `temp-asst-${Date.now()}`,
              role: "assistant",
              content: accumulated,
              provider: providerId,
              created_at: new Date().toISOString(),
            }
          : null;
        dispatch(streamFinished({ conversationId, message }));
        dispatch(wakingUpSet(false));
      },
      onCounts: (counts) => {
        dispatch(conversationCountsUpdated({ id: conversationId, ...counts }));
      },
      onError: (error) => {
        if (superseded()) return;
        dispatch(streamFailed(conversationId));
        if (error instanceof ApiError && error.code === "conversation_full") {
          // The chat filled up elsewhere: reload it so the full-chat panel appears.
          dispatch(conversationCountsUpdated({ id: conversationId, messages_left: 0 }));
          dispatch(messageDiscarded(conversationId));
          return;
        }
        if (isDailyLimitError(error)) {
          dispatch(fetchServiceStatus()); // Show the paused banner; retrying won't help today.
          dispatch(showToast({ type: "error", message: errorMessage(error, "Daily limit reached.") }));
          return;
        }
        dispatch(
          showToast({
            type: "error",
            message: errorMessage(error, "Failed to stream the reply."),
            retryMessage: { conversationId, content: trimmed, providerId },
          })
        );
      },
      onWaking: () => {
        dispatch(wakingUpSet(true));
      },
    });

    if (controllers.get(conversationId) === controller) controllers.delete(conversationId);
  }
);

/** Stops a conversation's reply. Text received so far stays on screen. */
export const stopStreaming =
  (conversationId: string): AppThunk =>
  (dispatch) => {
    controllers.get(conversationId)?.abort();
    controllers.delete(conversationId);
    dispatch(streamStopped(conversationId));
  };
