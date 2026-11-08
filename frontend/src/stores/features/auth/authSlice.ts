import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface AuthState {
  devUser: string;
  accessToken: string | null;
  isAuthenticated: boolean;
}

export const initialState: AuthState = {
  devUser: "dev",
  accessToken: null,
  isAuthenticated: true, // Local development mode signs in as the dev user.
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    devUserSet(state, action: PayloadAction<string>) {
      state.devUser = action.payload;
    },
    accessTokenSet(state, action: PayloadAction<string | null>) {
      state.accessToken = action.payload;
      state.isAuthenticated = action.payload !== null;
    },
    signedOut(state) {
      state.accessToken = null;
      state.isAuthenticated = false;
    },
  },
});

export const { devUserSet, accessTokenSet, signedOut } = authSlice.actions;
export default authSlice.reducer;
