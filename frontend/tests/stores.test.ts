import { describe, it, expect, beforeEach, vi } from "vitest";
import { useConversationStore } from "../src/stores/conversationStore";
import { useUiStore } from "../src/stores/uiStore";
import { useChatStore } from "../src/stores/chatStore";

describe("Frontend Stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConversationStore.setState({ conversations: [], activeId: null, loading: false });
    useUiStore.setState({ toasts: [], sidebarOpen: true, isWakingUp: false });
    useChatStore.setState({ messages: {}, streamStatus: "idle", streamingContent: "" });
  });

  it("manages toast notifications", () => {
    const { addToast, removeToast } = useUiStore.getState();
    addToast({ type: "error", message: "Network error" });

    let toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Network error");
    expect(toasts[0].type).toBe("error");

    removeToast(toasts[0].id);
    toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(0);
  });

  it("updates conversation title optimistically", () => {
    useConversationStore.setState({
      conversations: [
        {
          id: "conv-1",
          title: "New Chat",
          provider_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      activeId: "conv-1",
    });

    useConversationStore.getState().updateConversationTitle("conv-1", "What is React?");
    const conv = useConversationStore.getState().conversations.find((c) => c.id === "conv-1");
    expect(conv?.title).toBe("What is React?");
  });

  it("toggles sidebar state", () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });
});
