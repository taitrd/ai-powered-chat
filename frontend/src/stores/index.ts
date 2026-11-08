import {
  combineReducers,
  configureStore,
  type ThunkAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
import authReducer from "./features/auth/authSlice";
import chatReducer from "./features/chat/chatSlice";
import conversationsReducer from "./features/conversations/conversationsSlice";
import uiReducer from "./features/ui/uiSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  conversations: conversationsReducer,
  chat: chatReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** Creates a store. Tests call this for a fresh, isolated store each time. */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
// The store has no thunk "extra argument", so it's typed as undefined to match AppDispatch.
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  undefined,
  UnknownAction
>;
