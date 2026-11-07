import { create } from "zustand";
import { setApiDevUser, setApiAccessToken } from "../services/api";

interface AuthState {
  devUser: string;
  accessToken: string | null;
  isAuthenticated: boolean;
  setDevUser: (name: string) => void;
  setAccessToken: (token: string | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  devUser: "dev",
  accessToken: null,
  isAuthenticated: true, // true by default for local dev mode
  setDevUser: (name: string) => {
    setApiDevUser(name);
    set({ devUser: name });
  },
  setAccessToken: (token: string | null) => {
    setApiAccessToken(token);
    set({ accessToken: token, isAuthenticated: !!token });
  },
  signOut: () => {
    setApiAccessToken(null);
    set({ accessToken: null, isAuthenticated: false });
  },
}));
