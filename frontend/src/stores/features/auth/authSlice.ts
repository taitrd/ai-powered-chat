import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { authConfig } from "../../../lib/config/auth";

export interface AuthState {
  authMode: "local" | "cognito";
  devUser: string;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  authModalOpen: boolean;
  status: "idle" | "loading" | "error";
  error: string | null;
}

export const initialState: AuthState = {
  authMode: authConfig.mode,
  devUser: "dev",
  email: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: authConfig.mode === "local",
  isInitializing: authConfig.mode === "cognito",
  authModalOpen: false,
  status: "idle",
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    devUserSet(state, action: PayloadAction<string>) {
      state.devUser = action.payload;
    },
    authModalToggled(state, action: PayloadAction<boolean>) {
      state.authModalOpen = action.payload;
      state.error = null;
    },
    authInitializingSet(state, action: PayloadAction<boolean>) {
      state.isInitializing = action.payload;
    },
    authStatusSet(state, action: PayloadAction<"idle" | "loading" | "error">) {
      state.status = action.payload;
    },
    authErrorSet(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.status = action.payload ? "error" : "idle";
    },
    authSuccess(
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken?: string;
        email: string;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken || state.refreshToken;
      state.email = action.payload.email;
      state.isAuthenticated = true;
      state.isInitializing = false;
      state.authModalOpen = false;
      state.status = "idle";
      state.error = null;
    },
    signedOut(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.email = null;
      state.isAuthenticated = state.authMode === "local";
      state.isInitializing = false;
      state.status = "idle";
      state.error = null;
    },
  },
});

export const {
  devUserSet,
  authModalToggled,
  authInitializingSet,
  authStatusSet,
  authErrorSet,
  authSuccess,
  signedOut,
} = authSlice.actions;

export default authSlice.reducer;
