import React, { useEffect } from "react";
import { PanelLeft, Sparkles } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatFeed } from "./components/ChatFeed";
import { MessageInput } from "./components/MessageInput";
import { ToastContainer } from "./components/ToastContainer";
import { WakingBanner } from "./components/WakingBanner";
import { DemoNotice } from "./components/DemoNotice";
import { useConversationStore } from "./stores/conversationStore";
import { useChatStore } from "./stores/chatStore";
import { useUiStore } from "./stores/uiStore";

export const App: React.FC = () => {
  const activeId = useConversationStore((s) => s.activeId);
  const conversations = useConversationStore((s) => s.conversations);
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const createConversation = useConversationStore((s) => s.createConversation);

  const messages = useChatStore((s) => (activeId ? s.messages[activeId] || [] : []));
  const loadingMessages = useChatStore((s) => s.loadingMessages);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const loadModels = useUiStore((s) => s.loadModels);
  const models = useUiStore((s) => s.models);
  const selectedModelId = useUiStore((s) => s.selectedModelId);

  // Initial load
  useEffect(() => {
    loadModels();
    loadConversations();
  }, [loadModels, loadConversations]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
    }
  }, [activeId, loadMessages]);

  const activeConversation = conversations.find((c) => c.id === activeId);
  const activeModel = models.find((m) => m.id === selectedModelId);

  const handleSend = async (content: string) => {
    let targetId = activeId;
    if (!targetId) {
      const newConv = await createConversation();
      targetId = newConv.id;
    }
    await sendMessage(targetId, content, selectedModelId || undefined);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <Sidebar />

      {/* Main chat column */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <WakingBanner />

        {/* Top Navbar */}
        <header className="h-14 border-b border-gray-200/80 bg-white/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={toggleSidebar}
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
        <MessageInput onSendMessage={handleSend} />

        {/* Bottom Demo Notice */}
        <DemoNotice />
      </main>

      <ToastContainer />
    </div>
  );
};

export default App;
