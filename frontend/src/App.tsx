import React, { useEffect } from "react";
import { PanelLeft, Sparkles } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatFeed } from "./components/ChatFeed";
import { MessageInput } from "./components/MessageInput";
import { ToastContainer } from "./components/ToastContainer";
import { WakingBanner } from "./components/WakingBanner";
import { PausedBanner } from "./components/PausedBanner";
import { DemoNotice } from "./components/DemoNotice";
import { useAppDispatch, useAppSelector } from "./stores/hooks";
import { initAuth } from "./stores/features/auth/authThunks";
import { authModalToggled } from "./stores/features/auth/authSlice";
import { selectActiveMessages } from "./stores/features/chat/chatSlice";
import { sendMessage } from "./stores/features/chat/chatThunks";
import { selectActiveConversation } from "./stores/features/conversations/conversationsSlice";
import {
  createConversation,
  loadInitialData,
} from "./stores/features/conversations/conversationsThunks";
import {
  selectSelectedModel,
  sidebarToggled,
} from "./stores/features/ui/uiSlice";

const AuthModal = React.lazy(() =>
  import("./components/AuthModal").then((m) => ({ default: m.AuthModal }))
);

export const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const isPaused = useAppSelector((s) => s.ui.pausedUntil !== null);
  const activeId = useAppSelector((s) => s.conversations.activeId);
  const activeConversation = useAppSelector(selectActiveConversation);
  const messages = useAppSelector(selectActiveMessages);
  const loadingMessages = useAppSelector((s) => s.chat.loadingMessages);
  const creatingConversation = useAppSelector((s) => s.conversations.creatingConversation);
  const selectedModelId = useAppSelector((s) => s.ui.selectedModelId);
  const activeModel = useAppSelector(selectSelectedModel);
  const authMode = useAppSelector((s) => s.auth.authMode);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  // Fetch initial data once.
  useEffect(() => {
    const init = async () => {
      await dispatch(initAuth());
      dispatch(loadInitialData());
    };
    init();
  }, [dispatch]);

  const handleSend = async (content: string) => {
    if (authMode === "cognito" && !isAuthenticated) {
      dispatch(authModalToggled(true));
      return;
    }
    let targetId = activeId;
    if (!targetId) {
      try {
        targetId = (await dispatch(createConversation()).unwrap()).id;
      } catch {
        return; // The thunk already showed an error toast.
      }
    }
    dispatch(
      sendMessage({
        conversationId: targetId,
        content,
        providerId: selectedModelId || undefined,
      }),
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <Sidebar />

      {/* Main chat column */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <PausedBanner />
        <WakingBanner />

        {/* Top Navbar */}
        <header className="h-14 border-b border-gray-200/80 bg-white/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => dispatch(sidebarToggled())}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              title="Toggle sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-semibold text-gray-800 truncate">
              {activeConversation ? activeConversation.title : "New Chat"}
            </h2>
          </div>

          {activeModel && (
            <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full text-xs text-gray-600 font-medium shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
              <span>{activeModel.label}</span>
            </div>
          )}
        </header>

        {/* Message Feed */}
        <ChatFeed
          messages={messages}
          loading={loadingMessages}
          activeConversationTitle={activeConversation?.title}
        />

        {/* Input Bar */}
        <MessageInput onSendMessage={handleSend} disabled={creatingConversation || isPaused} />

        {/* Bottom Demo Notice */}
        <DemoNotice />
      </main>

      <ToastContainer />
      <React.Suspense fallback={null}>
        <AuthModal />
      </React.Suspense>
    </div>
  );
};

export default App;
