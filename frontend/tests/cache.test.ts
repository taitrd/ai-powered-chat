import { beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationsApi from "../src/services/api/conversations/conversationsApi";
import * as messagesApi from "../src/services/api/messages/messagesApi";
import * as modelsApi from "../src/services/api/models/modelsApi";
import * as statusApi from "../src/services/api/status/statusApi";
import { makeStore, type RootState } from "../src/stores";
import {
  createConversation,
  LIST_MAX_AGE_MS,
  loadInitialData,
  openConversation,
  refreshConversations,
} from "../src/stores/features/conversations/conversationsThunks";
import { loadPersistedState, startPersistence } from "../src/stores/persistence";
import type { Conversation, Message } from "../src/types";

vi.mock("../src/services/api/conversations/conversationsApi", () => ({
  fetchConversations: vi.fn(),
  createConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock("../src/services/api/messages/messagesApi", () => ({
  fetchMessages: vi.fn(),
  clearMessages: vi.fn(),
  streamChat: vi.fn(),
}));
vi.mock("../src/services/api/models/modelsApi", () => ({ fetchModels: vi.fn() }));
vi.mock("../src/services/api/status/statusApi", () => ({ fetchServiceStatus: vi.fn() }));

const convApi = vi.mocked(conversationsApi);
const msgApi = vi.mocked(messagesApi);

const T1 = "2026-11-13T10:00:00Z";
const T2 = "2026-11-13T11:00:00Z";

function conv(id: string, updated_at = T1): Conversation {
  return {
    id,
    title: id,
    provider_id: null,
    message_count: 2,
    messages_left: 98,
    created_at: T1,
    updated_at,
  };
}

function msg(id: string): Message {
  return { id, role: "user", content: id, created_at: T1 };
}

/** A signed-in store holding a cached list and cached messages for chat c1. */
function cachedStore(opts: { fetchedAgoMs?: number; syncedAt?: string; cached?: boolean } = {}) {
  const base = makeStore().getState();
  const cached = opts.cached ?? true;
  return makeStore({
    auth: { ...base.auth, isAuthenticated: true },
    conversations: {
      ...base.conversations,
      items: [conv("c1")],
      activeId: "c1",
      fetchedAt: Date.now() - (opts.fetchedAgoMs ?? 1000),
    },
    chat: {
      ...base.chat,
      byConversation: cached ? { c1: [msg("m1")] } : {},
      syncedAt: cached ? { c1: opts.syncedAt ?? T1 } : {},
    },
  } as Partial<RootState>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(modelsApi.fetchModels).mockResolvedValue([]);
  vi.mocked(statusApi.fetchServiceStatus).mockResolvedValue({
    paused: false,
    resumes_at: null,
    message: null,
  });
  convApi.fetchConversations.mockResolvedValue({ items: [conv("c1")], next_cursor: null });
  msgApi.fetchMessages.mockResolvedValue({ items: [msg("m1")], next_cursor: null });
});

describe("browser cache", () => {
  it("initial load with a fresh cache makes no conversation or message calls", async () => {
    const store = cachedStore();
    await store.dispatch(loadInitialData());
    expect(convApi.fetchConversations).not.toHaveBeenCalled();
    expect(msgApi.fetchMessages).not.toHaveBeenCalled();
  });

  it("reloads the list once it is older than 1 hour, then only changed chats", async () => {
    const store = cachedStore({ fetchedAgoMs: LIST_MAX_AGE_MS + 1000 });
    await store.dispatch(loadInitialData());
    expect(convApi.fetchConversations).toHaveBeenCalledTimes(1);
    // The chat's updated_at is unchanged on the server, so its cached messages are current.
    expect(msgApi.fetchMessages).not.toHaveBeenCalled();
  });

  it("fetches messages when the chat changed on another device", async () => {
    const store = cachedStore({ fetchedAgoMs: LIST_MAX_AGE_MS + 1000 });
    convApi.fetchConversations.mockResolvedValue({ items: [conv("c1", T2)], next_cursor: null });
    await store.dispatch(loadInitialData());
    expect(msgApi.fetchMessages).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(store.getState().chat.syncedAt["c1"]).toBe(T2));
  });

  it("loads the list and messages when there is no cache", async () => {
    const base = makeStore().getState();
    const store = makeStore({ auth: { ...base.auth, isAuthenticated: true } });
    await store.dispatch(loadInitialData());
    expect(convApi.fetchConversations).toHaveBeenCalledTimes(1);
  });

  it("opening a cached, unchanged chat makes no API call; an uncached one does", async () => {
    const store = cachedStore();
    store.dispatch(openConversation("c1"));
    expect(msgApi.fetchMessages).not.toHaveBeenCalled();

    const uncached = cachedStore({ cached: false });
    uncached.dispatch(openConversation("c1"));
    expect(msgApi.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it("the refresh button always reloads the list", async () => {
    const store = cachedStore();
    await store.dispatch(refreshConversations());
    expect(convApi.fetchConversations).toHaveBeenCalledTimes(1);
    expect(msgApi.fetchMessages).not.toHaveBeenCalled(); // chat unchanged
  });

  it("a new chat needs no message fetch when opened", async () => {
    const store = cachedStore();
    convApi.createConversation.mockResolvedValue(conv("c2"));
    await store.dispatch(createConversation());
    store.dispatch(openConversation("c2"));
    expect(msgApi.fetchMessages).not.toHaveBeenCalled();
  });

  it("survives a reload: cache age, sync marks and cursors are persisted", async () => {
    msgApi.fetchMessages.mockResolvedValue({ items: [msg("m1")], next_cursor: "cur" });
    const store = cachedStore({ cached: false });
    startPersistence(store);
    store.dispatch(openConversation("c1"));
    await vi.waitFor(() => expect(store.getState().chat.nextCursor["c1"]).toBe("cur"));

    const restored = makeStore(loadPersistedState());
    expect(restored.getState().chat.nextCursor["c1"]).toBe("cur"); // older pages stay reachable
    expect(restored.getState().chat.syncedAt["c1"]).toBe(T1);
    expect(restored.getState().conversations.fetchedAt).not.toBeNull();
  });
});
