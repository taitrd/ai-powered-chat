import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { MessageInput } from "../src/components/MessageInput";
import { ChatFeed } from "../src/components/ChatFeed";
import { WakingBanner } from "../src/components/WakingBanner";
import { ToastContainer } from "../src/components/ToastContainer";
import { AuthModal } from "../src/components/AuthModal";
import { Sidebar } from "../src/components/Sidebar";
import { wakingUpSet } from "../src/stores/features/ui/uiSlice";
import { showToast } from "../src/stores/features/ui/uiThunks";
import { authModalToggled } from "../src/stores/features/auth/authSlice";
import { renderWithStore } from "../src/test/renderWithStore";
import type { RootState } from "../src/stores";

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

  it("renders AuthModal when open and allows closing", () => {
    const { store } = renderWithStore(<AuthModal />);
    expect(screen.queryByText(/Sign in to AI Chat/i)).not.toBeInTheDocument();

    act(() => {
      store.dispatch(authModalToggled(true));
    });
    expect(screen.getByText(/Sign in to AI Chat/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();

    // Toggle tab to Sign Up
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.getByText(/Create an Account/i)).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByRole("button", { name: "Close" }) || screen.getAllByRole("button")[0]);
    expect(store.getState().auth.authModalOpen).toBe(false);
  });

  it("handles forgot password navigation in AuthModal", () => {
    const { store } = renderWithStore(<AuthModal />);
    act(() => {
      store.dispatch(authModalToggled(true));
    });

    // Click Forgot password?
    fireEvent.click(screen.getByRole("button", { name: /Forgot password\?/i }));
    expect(screen.getByText("Reset Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Code" })).toBeInTheDocument();

    // Click Back to Sign In
    fireEvent.click(screen.getByRole("button", { name: /Back to Sign In/i }));
    expect(screen.getByText(/Sign in to AI Chat/i)).toBeInTheDocument();
  });

  it("renders Sidebar in local mode with dev user switcher", () => {
    renderWithStore(<Sidebar />, {
      preloadedState: {
        auth: {
          authMode: "local",
          devUser: "dev",
          email: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: true,
          authModalOpen: false,
          status: "idle",
          error: null,
        },
      },
    });
    expect(screen.getByText("Local Mode")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("renders Sidebar in cognito mode with sign in button when unauthenticated", () => {
    renderWithStore(<Sidebar />, {
      preloadedState: {
        auth: {
          authMode: "cognito",
          devUser: "dev",
          email: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          authModalOpen: false,
          status: "idle",
          error: null,
        },
      },
    });

    expect(screen.getByText(/Sign In \/ Register/i)).toBeInTheDocument();
    expect(screen.queryByText("Local Mode")).not.toBeInTheDocument();
  });

  it("renders Sidebar in cognito mode with user email and sign out button when authenticated", () => {
    renderWithStore(<Sidebar />, {
      preloadedState: {
        auth: {
          authMode: "cognito",
          devUser: "dev",
          email: "alice@example.com",
          accessToken: "token123",
          refreshToken: null,
          isAuthenticated: true,
          authModalOpen: false,
          status: "idle",
          error: null,
        },
      },
    });

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByTitle("Sign Out")).toBeInTheDocument();
  });
});
