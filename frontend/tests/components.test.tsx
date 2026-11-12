import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { MessageInput } from "../src/components/MessageInput";
import { ChatFeed } from "../src/components/ChatFeed";
import { WakingBanner } from "../src/components/WakingBanner";
import { ToastContainer } from "../src/components/ToastContainer";
import { AuthModal } from "../src/components/AuthModal";
import { Sidebar } from "../src/components/Sidebar";
import { App } from "../src/App";
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

  it("populates message input when clicking a quick prompt helper button", () => {
    const handleSend = vi.fn();
    renderWithStore(<MessageInput onSendMessage={handleSend} />);

    const tablePromptBtn = screen.getByRole("button", { name: "Prompt: Markdown Table" });
    fireEvent.click(tablePromptBtn);

    const textarea = screen.getByPlaceholderText(/Type your message/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Compare Gemini, Claude, and ChatGPT in a detailed Markdown table");
  });

  it("inserts markdown formatting when toggling and clicking toolbar formatting buttons", async () => {
    const handleSend = vi.fn();
    renderWithStore(<MessageInput onSendMessage={handleSend} />);

    // Format toolbar is hidden by default
    expect(screen.queryByTitle("Format Bold (**text**)")).not.toBeInTheDocument();

    // Toggle format toolbar open
    const toggleBtn = screen.getByTitle(/Toggle Markdown/i);
    fireEvent.click(toggleBtn);

    const boldBtn = await screen.findByTitle("Format Bold (**text**)");
    fireEvent.click(boldBtn);

    const textarea = screen.getByPlaceholderText(/Type your message/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("**bold text**");
  });

  it("hides quick prompts and format toolbar in production mode (showDevHelpers=false)", () => {
    const handleSend = vi.fn();
    renderWithStore(<MessageInput onSendMessage={handleSend} showDevHelpers={false} />);

    expect(screen.queryByRole("button", { name: /Prompt:/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Toggle Markdown/i)).not.toBeInTheDocument();
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

  it("renders assistant messages with rich react-markdown", () => {
    const markdownContent =
      "# Heading 1\n\n| Col 1 | Col 2 |\n|---|---|\n| Val 1 | Val 2 |\n\n```python\nprint('hello')\n```";
    const messages = [
      { id: "1", role: "assistant" as const, content: markdownContent, created_at: "" },
    ];
    renderWithStore(<ChatFeed messages={messages} loading={false} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Heading 1");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Val 1")).toBeInTheDocument();
    expect(screen.getByText(/print\('hello'\)/)).toBeInTheDocument();
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

  it("renders Sidebar in cognito mode with checking session loading state while initializing", () => {
    renderWithStore(<Sidebar />, {
      preloadedState: {
        auth: {
          authMode: "cognito",
          devUser: "dev",
          email: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isInitializing: true,
          authModalOpen: false,
          status: "idle",
          error: null,
        },
      },
    });

    expect(screen.getByText(/Checking session.../i)).toBeInTheDocument();
    expect(screen.queryByText(/Sign In \/ Register/i)).not.toBeInTheDocument();
  });

  it("renders AuthModal with loading states when submitting", () => {
    renderWithStore(<AuthModal />, {
      preloadedState: {
        auth: {
          authMode: "cognito",
          devUser: "dev",
          email: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isInitializing: false,
          authModalOpen: true,
          status: "loading",
          error: null,
        },
      },
    });

    expect(screen.getByText("Signing in...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("renders privacy notice and link in MessageInput", () => {
    const handleSend = vi.fn();
    renderWithStore(<MessageInput onSendMessage={handleSend} />);

    expect(
      screen.getByText(/chats aren't used to improve our models\. Gemini is AI and can make mistakes\./i)
    ).toBeInTheDocument();

    const privacyLink = screen.getByRole("link", { name: "Your privacy & Gemini" });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute("href", "https://support.google.com/gemini/answer/13594961");
    expect(privacyLink).toHaveAttribute("target", "_blank");
  });

  it("guards New Chat in Sidebar by opening AuthModal when unauthenticated in cognito mode", () => {
    const { store } = renderWithStore(<Sidebar />, {
      preloadedState: {
        auth: {
          authMode: "cognito",
          devUser: "dev",
          email: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isInitializing: false,
          authModalOpen: false,
          status: "idle",
          error: null,
        },
      },
    });

    const newChatBtn = screen.getByRole("button", { name: /New Chat/i });
    fireEvent.click(newChatBtn);

    expect(store.getState().auth.authModalOpen).toBe(true);
  });

  it("guards Enter/Send in App by opening AuthModal when unauthenticated in cognito mode", () => {
    const { store } = renderWithStore(<App />, {
      preloadedState: {
        auth: {
          authMode: "cognito",
          devUser: "dev",
          email: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isInitializing: false,
          authModalOpen: false,
          status: "idle",
          error: null,
        },
      },
    });

    const textarea = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(store.getState().auth.authModalOpen).toBe(true);
    // Message should not be sent
    expect(store.getState().chat.byConversation).toEqual({});
  });
});


describe("PausedBanner", () => {
  it("is hidden normally and shows the local resume time while paused", async () => {
    const { PausedBanner } = await import("../src/components/PausedBanner");
    const { initialState } = await import("../src/stores/features/ui/uiSlice");
    const resumes = "2026-11-13T00:00:00+00:00";

    const { unmount } = renderWithStore(<PausedBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();

    renderWithStore(<PausedBanner />, {
      preloadedState: { ui: { ...initialState, pausedUntil: resumes } },
    });
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/resting for today/i);
    const expectedTime = new Date(resumes).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    expect(banner).toHaveTextContent(expectedTime);
  });
});
