import {
  setAccessToken as setClientAccessToken,
  setDevUser as setClientDevUser,
} from "../../../services/http/client";
import type { AppThunk } from "../../index";
import { clearPersistedState } from "../../persistence";
import { chatReset } from "../chat/chatSlice";
import { conversationsReset } from "../conversations/conversationsSlice";
import { fetchConversations } from "../conversations/conversationsThunks";
import { accessTokenSet, devUserSet, signedOut } from "./authSlice";

/** Clears one user's cached chats so the next user never sees them. */
const clearUserData = (): AppThunk => (dispatch) => {
  dispatch(conversationsReset());
  dispatch(chatReset());
  clearPersistedState();
};

/** Local development only: act as another user, then load that user's chats. */
export const switchDevUser =
  (name: string): AppThunk =>
  (dispatch, getState) => {
    if (getState().auth.devUser === name) return;
    setClientDevUser(name);
    dispatch(devUserSet(name));
    dispatch(clearUserData());
    dispatch(fetchConversations());
  };

export const setAccessToken =
  (token: string | null): AppThunk =>
  (dispatch) => {
    setClientAccessToken(token);
    dispatch(accessTokenSet(token));
  };

export const signOut = (): AppThunk => (dispatch) => {
  setClientAccessToken(null);
  dispatch(signedOut());
  dispatch(clearUserData());
};
