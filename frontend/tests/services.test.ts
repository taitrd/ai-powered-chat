import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteConversation,
  fetchConversations,
  renameConversation,
} from "../src/services/api/conversations/conversationsApi";
import { streamChat } from "../src/services/api/messages/messagesApi";
import { ApiError, setAccessToken, setDevUser } from "../src/services/http/client";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function lastRequest(): { url: string; init: RequestInit; headers: Record<string, string> } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken(null);
  setDevUser("dev");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("http client", () => {
  it("sends the dev user header and builds the URL with query parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));
    setDevUser("alice");

    await fetchConversations(10);

    const { url, headers } = lastRequest();
    expect(url).toBe("/api/v1/conversations?limit=10");
    expect(headers["X-Dev-User"]).toBe("alice");
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends a bearer token instead of the dev user once signed in", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));
    setAccessToken("token-123");

    await fetchConversations();

    const { headers } = lastRequest();
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(headers["X-Dev-User"]).toBeUndefined();
  });

  it("sends JSON bodies with the right method", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "c1", title: "New" }));

    await renameConversation("c1", "New");

    const { url, init } = lastRequest();
    expect(url).toBe("/api/v1/conversations/c1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ title: "New" }));
  });

  it("uses the backend's error detail in ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Daily user limit reached" }, 429));

    const error = await fetchConversations().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.message).toBe("Daily user limit reached");
  });

  it("joins FastAPI validation errors into one message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: [{ msg: "Title too long" }, { msg: "Field required" }] }, 422)
    );

    await expect(renameConversation("c1", "x")).rejects.toThrow("Title too long; Field required");
  });

  it("falls back to a friendly message when the body isn't JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));

    await expect(fetchConversations()).rejects.toThrow("Couldn't load conversations.");
  });

  it("treats deleting an already-deleted conversation as success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Conversation not found" }, 404));
    await expect(deleteConversation("gone")).resolves.toBeUndefined();

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteConversation("c1")).resolves.toBeUndefined();
  });
});

describe("streamChat", () => {
  function callbacks() {
    return { onDelta: vi.fn(), onEnd: vi.fn(), onError: vi.fn(), onWaking: vi.fn() };
  }

  it("parses deltas split across chunks, skips heartbeats, and ends on [DONE]", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"delta": "Hel',
        'lo"}\n\n: ping\n\n',
        'data: {"delta": " world"}\n\n',
        'data: {"stop_reason": "end_turn"}\n\ndata: [DONE]\n\n',
      ])
    );
    const cb = callbacks();

    await streamChat({ conversationId: "c1", content: "Hi", ...cb });

    expect(cb.onDelta.mock.calls.map(([d]) => d)).toEqual(["Hello", " world"]);
    expect(cb.onEnd).toHaveBeenCalledOnce();
    expect(cb.onError).not.toHaveBeenCalled();
    const { url, init } = lastRequest();
    expect(url).toBe("/api/v1/conversations/c1/messages");
    expect(init.body).toBe(JSON.stringify({ content: "Hi" }));
  });

  it("reports the backend's error detail before streaming starts", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Daily user limit reached" }, 429));
    const cb = callbacks();

    await streamChat({ conversationId: "c1", content: "Hi", ...cb });

    expect(cb.onError.mock.calls[0][0].message).toBe("Daily user limit reached");
    expect(cb.onEnd).not.toHaveBeenCalled();
  });

  it("signals waking up when the network request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const cb = callbacks();

    await streamChat({ conversationId: "c1", content: "Hi", ...cb });

    expect(cb.onWaking).toHaveBeenCalledOnce();
    expect(cb.onError).toHaveBeenCalledOnce();
  });
});
