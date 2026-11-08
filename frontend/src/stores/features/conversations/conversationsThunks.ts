import * as conversationsApi from "../../../services/api/conversations/conversationsApi";
import type { Conversation } from "../../../types";
import type { AppThunk } from "../../index";
import { createAppAsyncThunk, errorMessage } from "../../hooks";
import { fetchMessages } from "../chat/chatThunks";
import { fetchModels, showToast } from "../ui/uiThunks";
import { conversationSelected } from "./conversationsSlice";

export const fetchConversations = createAppAsyncThunk(
  "conversations/fetch",
  async (_: void, { dispatch, rejectWithValue }) => {
    try {
      return await conversationsApi.fetchConversations();
    } catch (error) {
      const message = errorMessage(error, "Couldn't load conversations.");
      dispatch(showToast({ type: "error", message }));
      return rejectWithValue(message);
    }
  }
);

export const createConversation = createAppAsyncThunk<Conversation, string | undefined>(
  "conversations/create",
  async (title, { dispatch, rejectWithValue }) => {
    try {
      return await conversationsApi.createConversation(title);
    } catch (error) {
      const message = errorMessage(error, "Couldn't create a conversation.");
      dispatch(showToast({ type: "error", message }));
      return rejectWithValue(message);
    }
  }
);

export const renameConversation = createAppAsyncThunk(
  "conversations/rename",
  async ({ id, title }: { id: string; title: string }, { dispatch, rejectWithValue }) => {
    try {
      return await conversationsApi.renameConversation(id, title);
    } catch (error) {
      const message = errorMessage(error, "Couldn't rename the conversation.");
      dispatch(showToast({ type: "error", message }));
      return rejectWithValue(message);
    }
  }
);

export const deleteConversation = createAppAsyncThunk(
  "conversations/delete",
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await conversationsApi.deleteConversation(id);
    } catch (error) {
      const message = errorMessage(error, "Couldn't delete the conversation.");
      dispatch(showToast({ type: "error", message }));
      return rejectWithValue(message);
    }
  }
);

/** Makes a conversation active and loads its messages. */
export const openConversation =
  (id: string): AppThunk =>
  (dispatch) => {
    dispatch(conversationSelected(id));
    dispatch(fetchMessages(id));
  };

/** Initial load: providers and conversations, then the active conversation's messages. */
export const loadInitialData = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  dispatch(fetchModels());
  await dispatch(fetchConversations());
  const { activeId } = getState().conversations;
  if (activeId) dispatch(fetchMessages(activeId));
};
