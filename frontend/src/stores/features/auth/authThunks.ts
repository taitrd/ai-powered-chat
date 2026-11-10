import {
  setAccessToken as setClientAccessToken,
  setDevUser as setClientDevUser,
} from "../../../services/http/client";
import {
  cognitoSignIn,
  cognitoSignUp,
  cognitoConfirmSignUp,
  cognitoRefreshToken,
  cognitoForgotPassword,
  cognitoConfirmForgotPassword,
} from "../../../services/auth/cognito";
import type { AppThunk } from "../../index";
import { clearPersistedState } from "../../persistence";
import { chatReset } from "../chat/chatSlice";
import { conversationsReset } from "../conversations/conversationsSlice";
import { fetchConversations } from "../conversations/conversationsThunks";
import {
  devUserSet,
  authInitializingSet,
  authStatusSet,
  authErrorSet,
  authSuccess,
  signedOut,
} from "./authSlice";

const TOKEN_STORAGE_KEY = "chat-app-auth-tokens";

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

export const signIn =
  (email: string, password: string): AppThunk =>
  async (dispatch) => {
    dispatch(authStatusSet("loading"));
    dispatch(authErrorSet(null));
    try {
      const tokens = await cognitoSignIn(email, password);
      setClientAccessToken(tokens.accessToken);
      localStorage.setItem(
        TOKEN_STORAGE_KEY,
        JSON.stringify({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          email,
        }),
      );
      dispatch(
        authSuccess({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          email,
        }),
      );
      dispatch(clearUserData());
      dispatch(fetchConversations());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      dispatch(authErrorSet(msg));
    }
  };

export const signUp =
  (email: string, password: string): AppThunk<Promise<boolean>> =>
  async (dispatch) => {
    dispatch(authStatusSet("loading"));
    dispatch(authErrorSet(null));
    try {
      await cognitoSignUp(email, password);
      dispatch(authStatusSet("idle"));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign up";
      dispatch(authErrorSet(msg));
      return false;
    }
  };

export const confirmSignUp =
  (email: string, code: string): AppThunk<Promise<boolean>> =>
  async (dispatch) => {
    dispatch(authStatusSet("loading"));
    dispatch(authErrorSet(null));
    try {
      await cognitoConfirmSignUp(email, code);
      dispatch(authStatusSet("idle"));
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Invalid confirmation code";
      dispatch(authErrorSet(msg));
      return false;
    }
  };

export const forgotPassword =
  (email: string): AppThunk<Promise<boolean>> =>
  async (dispatch) => {
    dispatch(authStatusSet("loading"));
    dispatch(authErrorSet(null));
    try {
      await cognitoForgotPassword(email);
      dispatch(authStatusSet("idle"));
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to send reset code";
      dispatch(authErrorSet(msg));
      return false;
    }
  };

export const confirmForgotPassword =
  (
    email: string,
    code: string,
    newPassword: string,
  ): AppThunk<Promise<boolean>> =>
  async (dispatch) => {
    dispatch(authStatusSet("loading"));
    dispatch(authErrorSet(null));
    try {
      await cognitoConfirmForgotPassword(email, code, newPassword);
      dispatch(authStatusSet("idle"));
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to reset password";
      dispatch(authErrorSet(msg));
      return false;
    }
  };

export const signOut = (): AppThunk => (dispatch) => {
  setClientAccessToken(null);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  dispatch(signedOut());
  dispatch(clearUserData());
};

export const initAuth = (): AppThunk => async (dispatch, getState) => {
  const state = getState();
  if (state.auth.authMode === "local") {
    setClientDevUser(state.auth.devUser);
    dispatch(authInitializingSet(false));
    return;
  }

  dispatch(authInitializingSet(true));
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) {
    dispatch(authInitializingSet(false));
    return;
  }

  try {
    const saved = JSON.parse(raw);
    if (saved.refreshToken) {
      try {
        const refreshed = await cognitoRefreshToken(saved.refreshToken);
        setClientAccessToken(refreshed.accessToken);
        dispatch(
          authSuccess({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            email: saved.email,
          }),
        );
        return;
      } catch {
        // Refresh token failed/expired
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        dispatch(signOut());
        return;
      }
    }

    if (saved.accessToken) {
      setClientAccessToken(saved.accessToken);
      dispatch(
        authSuccess({
          accessToken: saved.accessToken,
          email: saved.email,
        }),
      );
    }
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } finally {
    dispatch(authInitializingSet(false));
  }
};
