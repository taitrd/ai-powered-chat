import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import * as messagesApi from "../src/services/api/messages/messagesApi";
import * as conversationsApi from "../src/services/api/conversations/conversationsApi";
import { ApiError } from "../src/services/http/client";
import { makeStore, type RootState } from "../src/stores";
import { FullChatPanel } from "../src/components/FullChatPanel";
import { ChatFeed } from "../src/components/ChatFeed";
import { renderWithStore } from "../src/test/renderWithStore";
import { selectActiveMessages, selectHasOlder } from "../src/stores/features/chat/chatSlice";
import {
  fetchMessages,
  fetchOlderMessages,
  sendMessage,
} from "../src/stores/features/chat/chatThunks";
import type { Conversation, Message } from "../src/types";

vi.mock("../src/services/api/messages/messagesApi", () => ({
  fetchMessages: vi.fn(),
  clearMessages: vi.fn(),
  streamChat: vi.fn(),
}));
vi.mock("../src/services/api/conversations/conversationsApi", () => ({
  fetchConversations: vi.fn(),
  createConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

const api = vi.mocked(messagesApi);
const convApi = vi.mocked(conversationsApi);

function msg(id: string): Message {
  return { id, role: "user", content: id, created_at: new Date().toISOString() };
}

function conv(id: string, count = 0, left = 100): Conversation {
  const now = new Date().toISOString();
  return {
    id,
    title: "T",
    provider_id: null,
    message_count: count,
    messages_left: left,
    created_at: now,
    updated_at: now,
  };
}

function storeWith(items: Conversation[]) {
  const base = makeStore().getState();
  return makeStore({
    conversations: { ...base.conversations, items, activeId: items[0].id },
  } as Partial<RootState>);
}

beforeEach(() => vi.clearAllMocks());

describe("message pages", () => {
  it("loads the newest page, then prepends older pages", async () => {
    const store = storeWith([conv("c1")]);
    api.fetchMessages
      .mockResolvedValueOnce({ items: [msg("m3"), msg("m4")], next_cursor: "cur1" })
      .mockResolvedValueOnce({ items: [msg("m1"), msg("m2")], next_cursor: null });

    await store.dispatch(fetchMessages("c1"));
    expect(selectHasOlder(store.getState())).toBe(true);

    await store.dispatch(fetchOlderMessages("c1"));
    expect(api.fetchMessages).toHaveBeenLastCalledWith("c1", "cur1");
    expect(selectActiveMessages(store.getState()).map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    expect(selectHasOlder(store.getState())).toBe(false);
  });

  it("does not call the API when there is no older page", async () => {
    const store = storeWith([conv("c1")]);
    await store.dispatch(fetchOlderMessages("c1"));
    expect(api.fetchMessages).not.toHaveBeenCalled();
  });

  it("shows a load-older button in the feed", () => {
    const onLoadOlder = vi.fn();
    renderWithStore(
      <ChatFeed messages={[msg("m1")]} loading={false} hasOlder onLoadOlder={onLoadOlder} />,
    );
    fireEvent.click(screen.getByText("Load older messages"));
    expect(onLoadOlder).toHaveBeenCalled();
  });
});

describe("full chat", () => {
  it("updates the countdown from the stream and handles the full-chat refusal", async () => {
    const store = storeWith([conv("c1")]);
    api.streamChat.mockImplementation(async (opts) => {
      opts.onCounts?.({ message_count: 92, messages_left: 8 });
      opts.onEnd();
    });
    await store.dispatch(sendMessage({ conversationId: "c1", content: "hi" }));
    expect(store.getState().conversations.items[0]).toMatchObject({ messages_left: 8 });

    api.streamChat.mockImplementation(async (opts) => {
      opts.onError(new ApiError("This chat is full", 409, "conversation_full"));
    });
    await store.dispatch(sendMessage({ conversationId: "c1", content: "again" }));
    expect(store.getState().conversations.items[0].messages_left).toBe(0);
    expect(selectActiveMessages(store.getState()).some((m) => m.content === "again")).toBe(false);
    expect(store.getState().ui.toasts).toHaveLength(0); // The panel explains it instead.
  });

  it("clear needs confirmation, then empties the chat and restores the room", async () => {
    const store = storeWith([conv("c1", 100, 0)]);
    api.clearMessages.mockResolvedValue();
    renderWithStore(<FullChatPanel conversationId="c1" />, { store });

    fireEvent.click(screen.getByText("Clear this chat"));
    expect(api.clearMessages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Yes, clear it"));
    await vi.waitFor(() => expect(api.clearMessages).toHaveBeenCalledWith("c1"));
    await vi.waitFor(() =>
      expect(store.getState().conversations.items[0]).toMatchObject({
        message_count: 0,
        messages_left: 100,
      }),
    );
  });

  it("starts a new chat in one click", async () => {
    const store = storeWith([conv("c1", 100, 0)]);
    convApi.createConversation.mockResolvedValue(conv("c2"));
    renderWithStore(<FullChatPanel conversationId="c1" />, { store });

    fireEvent.click(screen.getByText("Start a new chat"));
    await vi.waitFor(() => expect(store.getState().conversations.activeId).toBe("c2"));
  });
});
