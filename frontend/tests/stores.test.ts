import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationsApi from "../src/services/api/conversations/conversationsApi";
import * as messagesApi from "../src/services/api/messages/messagesApi";
import * as modelsApi from "../src/services/api/models/modelsApi";
import * as httpClient from "../src/services/http/client";
import * as cognitoAuth from "../src/services/auth/cognito";
import { makeStore, type RootState } from "../src/stores";
import {
  confirmForgotPassword,
  forgotPassword,
  initAuth,
  signIn,
  signOut,
  switchDevUser,
} from "../src/stores/features/auth/authThunks";
import { authModalToggled } from "../src/stores/features/auth/authSlice";
import { selectActiveMessages } from "../src/stores/features/chat/chatSlice";
import { sendMessage, stopStreaming } from "../src/stores/features/chat/chatThunks";
import { conversationTitleUpdated } from "../src/stores/features/conversations/conversationsSlice";
import {
  createConversation,
  deleteConversation,
  fetchConversations,
} from "../src/stores/features/conversations/conversationsThunks";
import { sidebarToggled, toastRemoved } from "../src/stores/features/ui/uiSlice";
import { fetchModels, showToast } from "../src/stores/features/ui/uiThunks";
import { loadPersistedState, startPersistence } from "../src/stores/persistence";
import type { Conversation } from "../src/types";

vi.mock("../src/services/api/conversations/conversationsApi", () => ({
  fetchConversations: vi.fn(),
  createConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock("../src/services/api/messages/messagesApi", () => ({
  fetchMessages: vi.fn(),
  streamChat: vi.fn(),
}));
vi.mock("../src/services/api/models/modelsApi", () => ({ fetchModels: vi.fn() }));
vi.mock("../src/services/http/client", () => ({
  setDevUser: vi.fn(),
  setAccessToken: vi.fn(),
}));
vi.mock("../src/services/auth/cognito", () => ({
  cognitoSignIn: vi.fn(),
  cognitoSignUp: vi.fn(),
  cognitoConfirmSignUp: vi.fn(),
  cognitoRefreshToken: vi.fn(),
  cognitoForgotPassword: vi.fn(),
  cognitoConfirmForgotPassword: vi.fn(),
}));

// One handle for all mocked service functions, to keep the tests short.
const mockedApi = {
  ...vi.mocked(conversationsApi),
  ...vi.mocked(messagesApi),
  ...vi.mocked(modelsApi),
  ...vi.mocked(httpClient),
  ...vi.mocked(cognitoAuth),
};

function conversation(id: string, title = "New Chat"): Conversation {
  const now = new Date().toISOString();
  return { id, title, provider_id: null, created_at: now, updated_at: now };
}

function storeWithConversations(items: Conversation[], activeId: string | null = null) {
  const store = makeStore();
  const state = store.getState();
  return makeStore({
    conversations: { ...state.conversations, items, activeId },
  } as Partial<RootState>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ui slice", () => {
  it("adds and removes toasts", () => {
    const store = makeStore();
    store.dispatch(showToast({ type: "error", message: "Network error" }));

    const [toast] = store.getState().ui.toasts;
    expect(toast).toMatchObject({ type: "error", message: "Network error" });

    store.dispatch(toastRemoved(toast.id));
    expect(store.getState().ui.toasts).toHaveLength(0);
  });

  it("auto-closes non-error toasts after 5 seconds", () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.dispatch(showToast({ type: "success", message: "Saved" }));
    expect(store.getState().ui.toasts).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(store.getState().ui.toasts).toHaveLength(0);
  });

  it("toggles the sidebar", () => {
    const store = makeStore();
    expect(store.getState().ui.sidebarOpen).toBe(true);
    store.dispatch(sidebarToggled());
    expect(store.getState().ui.sidebarOpen).toBe(false);
  });

  it("loads models and selects the first one", async () => {
    mockedApi.fetchModels.mockResolvedValue([
      { id: "gemini", label: "Gemini", model: "flash" },
      { id: "fake", label: "Fake", model: "fake" },
    ]);
    const store = makeStore();
    const pending = store.dispatch(fetchModels());
    expect(store.getState().ui.loadingModels).toBe(true);
    await pending;
    expect(store.getState().ui.loadingModels).toBe(false);
    expect(store.getState().ui.selectedModelId).toBe("gemini");
  });
});

describe("conversations", () => {
  it("updates a title optimistically", () => {
    const store = storeWithConversations([conversation("conv-1")]);
    store.dispatch(conversationTitleUpdated({ id: "conv-1", title: "What is React?" }));
    expect(store.getState().conversations.items[0].title).toBe("What is React?");
  });

  it("loads conversations with a loading flag and selects the first", async () => {
    mockedApi.fetchConversations.mockResolvedValue({
      items: [conversation("a"), conversation("b")],
      next_cursor: null,
    });
    const store = makeStore();
    const pending = store.dispatch(fetchConversations());
    expect(store.getState().conversations.loadingConversations).toBe(true);
    await pending;
    expect(store.getState().conversations.loadingConversations).toBe(false);
    expect(store.getState().conversations.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(store.getState().conversations.activeId).toBe("a");
  });

  it("shows an error toast when loading fails", async () => {
    mockedApi.fetchConversations.mockRejectedValue(new Error("Server down"));
    const store = makeStore();
    await store.dispatch(fetchConversations());
    expect(store.getState().conversations.loadingConversations).toBe(false);
    expect(store.getState().ui.toasts[0].message).toBe("Server down");
  });

  it("creates a conversation and makes it active", async () => {
    mockedApi.createConversation.mockResolvedValue(conversation("new"));
    const store = storeWithConversations([conversation("old")], "old");
    const created = await store.dispatch(createConversation()).unwrap();
    expect(created.id).toBe("new");
    expect(store.getState().conversations.items.map((c) => c.id)).toEqual(["new", "old"]);
    expect(store.getState().conversations.activeId).toBe("new");
  });

  it("deletes the active conversation and selects the next one", async () => {
    mockedApi.deleteConversation.mockResolvedValue(undefined);
    const store = storeWithConversations([conversation("a"), conversation("b")], "a");
    await store.dispatch(deleteConversation("a"));
    expect(store.getState().conversations.items.map((c) => c.id)).toEqual(["b"]);
    expect(store.getState().conversations.activeId).toBe("b");
    expect(store.getState().conversations.pendingIds).toEqual([]);
  });
});

describe("chat streaming", () => {
  it("streams a reply into the active conversation and auto-titles it", async () => {
    mockedApi.streamChat.mockImplementation(async ({ onDelta, onEnd }) => {
      onDelta("Hello");
      onDelta(" world");
      onEnd();
    });
    const store = storeWithConversations([conversation("c1")], "c1");

    await store.dispatch(sendMessage({ conversationId: "c1", content: "  Hi there  " }));

    const messages = selectActiveMessages(store.getState());
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Hi there"],
      ["assistant", "Hello world"],
    ]);
    expect(store.getState().chat.streamStatus).toBe("idle");
    expect(store.getState().conversations.items[0].title).toBe("Hi there");
  });

  it("shows streamed text while the reply is in progress", async () => {
    let finish = () => {};
    mockedApi.streamChat.mockImplementation(
      ({ onDelta, onEnd }) =>
        new Promise<void>((resolve) => {
          onDelta("Partial");
          finish = () => {
            onEnd();
            resolve();
          };
        })
    );
    const store = storeWithConversations([conversation("c1")], "c1");
    const pending = store.dispatch(sendMessage({ conversationId: "c1", content: "Hi" }));

    expect(store.getState().chat.streamStatus).toBe("streaming");
    expect(store.getState().chat.streamingContent).toBe("Partial");

    finish();
    await pending;
    expect(store.getState().chat.streamingContent).toBe("");
  });

  it("stop aborts the request and returns to idle", async () => {
    let signal: AbortSignal | undefined;
    mockedApi.streamChat.mockImplementation(
      (options) =>
        new Promise<void>((resolve) => {
          signal = options.signal;
          options.signal?.addEventListener("abort", () => resolve());
        })
    );
    const store = storeWithConversations([conversation("c1")], "c1");
    const pending = store.dispatch(sendMessage({ conversationId: "c1", content: "Hi" }));

    store.dispatch(stopStreaming());
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(store.getState().chat.streamStatus).toBe("idle");
  });

  it("shows a retry toast with plain data when streaming fails", async () => {
    mockedApi.streamChat.mockImplementation(async ({ onError }) => {
      onError(new Error("Free quota reached"));
    });
    const store = storeWithConversations([conversation("c1")], "c1");
    await store.dispatch(sendMessage({ conversationId: "c1", content: "Hi", providerId: "gemini" }));

    expect(store.getState().chat.streamStatus).toBe("error");
    expect(store.getState().ui.toasts[0]).toMatchObject({
      message: "Free quota reached",
      retryMessage: { conversationId: "c1", content: "Hi", providerId: "gemini" },
    });
  });

  it("ignores empty messages", async () => {
    const store = storeWithConversations([conversation("c1")], "c1");
    await store.dispatch(sendMessage({ conversationId: "c1", content: "   " }));
    expect(mockedApi.streamChat).not.toHaveBeenCalled();
    expect(selectActiveMessages(store.getState())).toEqual([]);
  });
});

describe("auth", () => {
  it("switching dev user clears the previous user's chats and reloads", () => {
    mockedApi.fetchConversations.mockResolvedValue({ items: [], next_cursor: null });
    const store = storeWithConversations([conversation("alice-chat")], "alice-chat");

    store.dispatch(switchDevUser("bob"));

    expect(mockedApi.setDevUser).toHaveBeenCalledWith("bob");
    expect(store.getState().auth.devUser).toBe("bob");
    expect(store.getState().conversations.items).toEqual([]);
    expect(store.getState().conversations.activeId).toBeNull();
    expect(mockedApi.fetchConversations).toHaveBeenCalled();
  });

  it("handles cognito signIn flow successfully", async () => {
    mockedApi.cognitoSignIn.mockResolvedValue({
      accessToken: "mock-access-token",
      idToken: "mock-id-token",
      refreshToken: "mock-refresh-token",
    });
    mockedApi.fetchConversations.mockResolvedValue({ items: [], next_cursor: null });

    const store = makeStore();
    await store.dispatch(signIn("user@example.com", "Password123!"));

    expect(mockedApi.cognitoSignIn).toHaveBeenCalledWith("user@example.com", "Password123!");
    expect(mockedApi.setAccessToken).toHaveBeenCalledWith("mock-access-token");
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.email).toBe("user@example.com");
    expect(store.getState().auth.accessToken).toBe("mock-access-token");
    expect(store.getState().auth.authModalOpen).toBe(false);
  });

  it("handles cognito signOut flow", () => {
    const store = makeStore({
      auth: {
        authMode: "cognito",
        devUser: "dev",
        email: "user@example.com",
        accessToken: "some-token",
        refreshToken: "refresh-token",
        isAuthenticated: true,
        authModalOpen: false,
        status: "idle",
        error: null,
      },
    } as Partial<RootState>);

    store.dispatch(signOut());

    expect(mockedApi.setAccessToken).toHaveBeenCalledWith(null);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.email).toBeNull();
    expect(store.getState().auth.accessToken).toBeNull();
  });

  it("toggles auth modal and clears error", () => {
    const store = makeStore();
    expect(store.getState().auth.authModalOpen).toBe(false);

    store.dispatch(authModalToggled(true));
    expect(store.getState().auth.authModalOpen).toBe(true);

    store.dispatch(authModalToggled(false));
    expect(store.getState().auth.authModalOpen).toBe(false);
  });

  it("initAuth restores token and refreshes when in cognito mode", async () => {
    localStorage.setItem(
      "chat-app-auth-tokens",
      JSON.stringify({
        accessToken: "old-token",
        refreshToken: "valid-refresh",
        email: "stored@example.com",
      })
    );
    mockedApi.cognitoRefreshToken.mockResolvedValue({
      accessToken: "new-token",
      idToken: "new-id",
      refreshToken: "valid-refresh",
    });

    const store = makeStore({
      auth: {
        authMode: "cognito",
        devUser: "dev",
        email: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        authModalOpen: false,
        status: "idle",
        error: null,
      },
    } as Partial<RootState>);

    await store.dispatch(initAuth());

    expect(mockedApi.cognitoRefreshToken).toHaveBeenCalledWith("valid-refresh");
    expect(store.getState().auth.accessToken).toBe("new-token");
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.email).toBe("stored@example.com");
  });

  it("handles forgotPassword and confirmForgotPassword", async () => {
    mockedApi.cognitoForgotPassword.mockResolvedValue(undefined);
    mockedApi.cognitoConfirmForgotPassword.mockResolvedValue(undefined);

    const store = makeStore();
    const forgotOk = await store.dispatch(forgotPassword("user@example.com"));
    expect(forgotOk).toBe(true);
    expect(mockedApi.cognitoForgotPassword).toHaveBeenCalledWith("user@example.com");

    const resetOk = await store.dispatch(
      confirmForgotPassword("user@example.com", "123456", "NewPassword123!")
    );
    expect(resetOk).toBe(true);
    expect(mockedApi.cognitoConfirmForgotPassword).toHaveBeenCalledWith(
      "user@example.com",
      "123456",
      "NewPassword123!"
    );
  });
});

describe("browser cache", () => {
  it("saves cached data and restores it into a new store", () => {
    const store = storeWithConversations([conversation("c1", "Saved chat")], "c1");
    const unsubscribe = startPersistence(store);
    store.dispatch(conversationTitleUpdated({ id: "c1", title: "Renamed" }));
    unsubscribe();

    const restored = makeStore(loadPersistedState());
    expect(restored.getState().conversations.items[0].title).toBe("Renamed");
    expect(restored.getState().conversations.activeId).toBe("c1");
    expect(restored.getState().conversations.loadingConversations).toBe(false);
  });

  it("ignores a corrupt cache", () => {
    localStorage.setItem("chat-app-cache-v1", "{not json");
    expect(loadPersistedState()).toBeUndefined();
  });
});
