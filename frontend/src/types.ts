export interface User {
  id: string;
  cognito_sub?: string;
  email?: string;
  created_at?: string;
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

export interface ToastItem {
  id: string;
  type: "info" | "success" | "error";
  message: string;
  retry?: () => void;
}
