import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MessageInput } from "../src/components/MessageInput";
import { ChatFeed } from "../src/components/ChatFeed";
import { WakingBanner } from "../src/components/WakingBanner";
import { useUiStore } from "../src/stores/uiStore";

describe("Frontend Components", () => {
  it("renders MessageInput and calls onSendMessage", () => {
    const handleSend = vi.fn();
    render(<MessageInput onSendMessage={handleSend} />);

    const textarea = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(textarea, { target: { value: "Hello AI" } });
    expect(screen.getByText("8/4000")).toBeInTheDocument();

    const submitBtn = screen.getByTitle("Send message");
    fireEvent.click(submitBtn);

    expect(handleSend).toHaveBeenCalledWith("Hello AI");
  });

  it("renders ChatFeed empty state", () => {
    render(<ChatFeed messages={[]} loading={false} />);
    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();
  });

  it("renders ChatFeed with user and assistant messages", () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content: "What is 2+2?",
        created_at: new Date().toISOString(),
      },
      {
        id: "2",
        role: "assistant" as const,
        content: "2+2 is 4",
        created_at: new Date().toISOString(),
      },
    ];

    render(<ChatFeed messages={messages} loading={false} />);
    expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
    expect(screen.getByText("2+2 is 4")).toBeInTheDocument();
  });

  it("renders WakingBanner when isWakingUp is true", () => {
    useUiStore.setState({ isWakingUp: true });
    render(<WakingBanner />);
    expect(screen.getByText(/Waking up the demo:/i)).toBeInTheDocument();

    act(() => {
      useUiStore.setState({ isWakingUp: false });
    });
  });
});
