import type { Conversation } from "../../../types";
import { ApiError, http } from "../../http/client";

export interface ConversationPage {
  items: Conversation[];
  next_cursor: string | null;
}

export function fetchConversations(
  limit = 20,
  cursor?: string,
): Promise<ConversationPage> {
  return http.get<ConversationPage>("/conversations", {
    query: { limit, cursor },
    errorMessage: "Couldn't load conversations.",
  });
}

export function createConversation(title?: string): Promise<Conversation> {
  return http.post<Conversation>(
    "/conversations",
    { title },
    { errorMessage: "Couldn't create a conversation." },
  );
}

export function renameConversation(
  id: string,
  title: string,
): Promise<Conversation> {
  return http.patch<Conversation>(
    `/conversations/${id}`,
    { title },
    { errorMessage: "Couldn't rename the conversation." },
  );
}

/** Deletes a conversation. Already gone (404) counts as success. */
export async function deleteConversation(id: string): Promise<void> {
  try {
    await http.delete(`/conversations/${id}`, {
      errorMessage: "Couldn't delete the conversation.",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
}
