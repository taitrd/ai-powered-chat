/**
 * Browser cache for conversations, messages and the selected model.
 *
 * Showing cached data on load avoids waiting for the database to wake up
 * (see PLAN.md, Section 5E). Only plain data is saved, and only when it changes.
 */
import type { AppStore, RootState } from "./index";
import { initialState as chatInitial } from "./features/chat/chatSlice";
import { initialState as conversationsInitial } from "./features/conversations/conversationsSlice";
import { initialState as uiInitial } from "./features/ui/uiSlice";

const STORAGE_KEY = "chat-app-cache-v1";

interface PersistedState {
  conversations?: Pick<RootState["conversations"], "items" | "activeId">;
  chat?: Pick<RootState["chat"], "byConversation">;
  ui?: Pick<RootState["ui"], "selectedModelId">;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // Storage can be blocked, for example in private browsing.
  }
}

export function loadPersistedState(): Partial<RootState> | undefined {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as PersistedState;
    return {
      conversations: {
        ...conversationsInitial,
        items: saved.conversations?.items ?? [],
        activeId: saved.conversations?.activeId ?? null,
      },
      chat: { ...chatInitial, byConversation: saved.chat?.byConversation ?? {} },
      ui: { ...uiInitial, selectedModelId: saved.ui?.selectedModelId ?? "" },
    };
  } catch {
    return undefined; // Corrupt cache: start fresh rather than crash.
  }
}

/** Saves the cached parts of the state whenever they change. Returns an unsubscribe function. */
export function startPersistence(store: AppStore): () => void {
  let last: PersistedState | null = null;

  return store.subscribe(() => {
    const state = store.getState();
    const next: PersistedState = {
      conversations: {
        items: state.conversations.items,
        activeId: state.conversations.activeId,
      },
      chat: { byConversation: state.chat.byConversation },
      ui: { selectedModelId: state.ui.selectedModelId },
    };
    // Redux returns the same object references when nothing changed, so streaming
    // deltas (which only change chat.streamingContent) don't trigger writes.
    if (
      last &&
      last.conversations?.items === next.conversations?.items &&
      last.conversations?.activeId === next.conversations?.activeId &&
      last.chat?.byConversation === next.chat?.byConversation &&
      last.ui?.selectedModelId === next.ui?.selectedModelId
    ) {
      return;
    }
    last = next;
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the app still works without the cache.
    }
  });
}

export function clearPersistedState(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
