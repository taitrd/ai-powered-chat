import { Conversation, Message, ModelInfo } from "../types";

const API_BASE = "/api/v1";

let devUser = "dev";
let accessToken: string | null = null;

export function setApiDevUser(user: string) {
  devUser = user;
}

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else {
    headers["X-Dev-User"] = devUser;
  }
  return headers;
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/models`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to load models: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchConversations(
  limit: number = 20,
  cursor?: string
): Promise<{ items: Conversation[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${API_BASE}/conversations?${params.toString()}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to load conversations: ${res.statusText}`);
  }
  return res.json();
}

export async function createConversation(title?: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create conversation: ${res.statusText}`);
  }
  return res.json();
}

export async function renameConversation(
  id: string,
  title: string
): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(`Failed to rename conversation: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to load messages: ${res.statusText}`);
  }
  return res.json();
}

export interface StreamChatOptions {
  conversationId: string;
  content: string;
  providerId?: string;
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
  onEnd: () => void;
  onError: (error: Error) => void;
  onWaking?: () => void;
}

export async function streamChat({
  conversationId,
  content,
  providerId,
  signal,
  onDelta,
  onEnd,
  onError,
  onWaking,
}: StreamChatOptions): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        content,
        provider_id: providerId || undefined,
      }),
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) return;
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "TypeError" && onWaking) {
      onWaking();
    }
    onError(error);
    return;
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    if (response.status === 504 && onWaking) {
      onWaking();
    }
    onError(new Error(errorDetail));
    return;
  }

  if (!response.body) {
    onError(new Error("No response body received from server"));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) {
          // Heartbeat comment (: ping) or empty line
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            onEnd();
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta) {
              onDelta(parsed.delta);
            }
          } catch {
            // plain text or non-json delta
            onDelta(payload);
          }
        } else if (trimmed.startsWith("event: error")) {
          // Handled on following data line
        }
      }
    }
    onEnd();
  } catch (err: unknown) {
    if (signal?.aborted) {
      onEnd();
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
