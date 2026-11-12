export interface User {
  id: string;
  cognito_sub?: string;
  email?: string;
  created_at?: string;
}

export interface ServiceStatus {
  paused: boolean;
  /** ISO time when the demo is back (next midnight UTC), when paused. */
  resumes_at: string | null;
  message: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  provider_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string | null;
  model?: string | null;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  model: string;
}

export interface SendMessageArgs {
  conversationId: string;
  content: string;
  providerId?: string;
}

export interface ToastItem {
  id: string;
  type: "info" | "success" | "error";
  message: string;
  /** Message to resend when the user presses Retry. Plain data, so Redux state stays serializable. */
  retryMessage?: SendMessageArgs;
}
