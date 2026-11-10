import type { Message } from "../../../types";
import { http, parseError, send } from "../../http/client";

export function fetchMessages(conversationId: string): Promise<Message[]> {
  return http.get<Message[]>(`/conversations/${conversationId}/messages`, {
    errorMessage: "Couldn't load messages.",
  });
}

export interface StreamChatOptions {
  conversationId: string;
  content: string;
  providerId?: string;
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
  onEnd: () => void;
  onError: (error: Error) => void;
  /** Called when the backend looks like it's resuming from idle. */
  onWaking?: () => void;
}

/**
 * Sends a message and reads the reply as Server-Sent Events.
 * Uses fetch rather than EventSource, because EventSource can't POST or send auth headers.
 */
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
    response = await send(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { content, provider_id: providerId || undefined },
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) return;
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "TypeError") onWaking?.();
    onError(error);
    return;
  }

  if (!response.ok) {
    if (response.status === 504) onWaking?.();
    onError(
      await parseError(
        response,
        response.statusText || "Failed to send the message.",
      ),
    );
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
        // Skip blank lines and heartbeat comments (": ping").
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          onEnd();
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) {
            onError(new Error(parsed.error));
            return;
          }
          if (parsed.delta) onDelta(parsed.delta);
        } catch {
          onDelta(payload); // Plain-text delta.
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
