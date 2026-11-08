import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { MessageInput } from "../src/components/MessageInput";
import { ChatFeed } from "../src/components/ChatFeed";
import { WakingBanner } from "../src/components/WakingBanner";
import { ToastContainer } from "../src/components/ToastContainer";
import { wakingUpSet } from "../src/stores/features/ui/uiSlice";
import { showToast } from "../src/stores/features/ui/uiThunks";
import { renderWithStore } from "../src/test/renderWithStore";

describe("Frontend Components", () => {
  it("renders MessageInput and calls onSendMessage", () => {
    const handleSend = vi.fn();
    renderWithStore(<MessageInput onSendMessage={handleSend} />);

    const textarea = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(textarea, { target: { value: "Hello AI" } });
    expect(screen.getByText("8/4000")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Send message"));
    expect(handleSend).toHaveBeenCalledWith("Hello AI");
  });

  it("shows a toast instead of sending an over-long message", () => {
    const handleSend = vi.fn();
    const { store } = renderWithStore(<MessageInput onSendMessage={handleSend} />);

    fireEvent.change(screen.getByPlaceholderText(/Type your message/i), {
      target: { value: "x".repeat(4001) },
    });
    fireEvent.click(screen.getByTitle("Send message"));

    expect(handleSend).not.toHaveBeenCalled();
    expect(store.getState().ui.toasts[0].message).toMatch(/4000 character limit/);
  });

  it("renders ChatFeed empty state", () => {
    renderWithStore(<ChatFeed messages={[]} loading={false} />);
    expect(screen.getByText(/How can I help you today\?/i)).toBeInTheDocument();
  });

  it("renders ChatFeed with user and assistant messages", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "What is 2+2?", created_at: "" },
      { id: "2", role: "assistant" as const, content: "2+2 is 4", created_at: "" },
    ];
    renderWithStore(<ChatFeed messages={messages} loading={false} />);
    expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
    expect(screen.getByText("2+2 is 4")).toBeInTheDocument();
  });

  it("shows WakingBanner only while the API is waking up", () => {
    const { store } = renderWithStore(<WakingBanner />);
    expect(screen.queryByText(/Waking up the demo:/i)).not.toBeInTheDocument();

    act(() => {
      store.dispatch(wakingUpSet(true));
    });
    expect(screen.getByText(/Waking up the demo:/i)).toBeInTheDocument();
  });

  it("dismisses a toast", () => {
    const { store } = renderWithStore(<ToastContainer />);
    act(() => {
      store.dispatch(showToast({ type: "error", message: "Something failed" }));
    });
    expect(screen.getByText("Something failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Something failed")).not.toBeInTheDocument();
  });
});
