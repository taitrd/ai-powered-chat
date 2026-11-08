import * as messagesApi from "../../../services/api/messages/messagesApi";
import type { Message, SendMessageArgs } from "../../../types";
import type { AppThunk } from "../../index";
import { createAppAsyncThunk, errorMessage } from "../../hooks";
import { conversationTitleUpdated } from "../conversations/conversationsSlice";
import { wakingUpSet } from "../ui/uiSlice";
import { showToast } from "../ui/uiThunks";
import {
  messageAdded,
  streamDelta,
  streamFailed,
  streamFinished,
  streamStarted,
  streamStopped,
} from "./chatSlice";

const DEFAULT_TITLE = "New Chat";
const AUTO_TITLE_LENGTH = 60;

// AbortController isn't serializable, so it lives here instead of in Redux state.
let activeController: AbortController | null = null;

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

    const controller = new AbortController();
    activeController = controller;
    let accumulated = "";

    await messagesApi.streamChat({
      conversationId,
      content: trimmed,
      providerId,
      signal: controller.signal,
      onDelta: (delta) => {
        accumulated += delta;
        dispatch(streamDelta(delta));
      },
      onEnd: () => {
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
      onError: (error) => {
        dispatch(streamFailed());
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

    if (activeController === controller) activeController = null;
  }
);

/** Stops the current reply. Text received so far stays on screen. */
export const stopStreaming = (): AppThunk => (dispatch) => {
  activeController?.abort();
  activeController = null;
  dispatch(streamStopped());
};
