import React, { useState } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Bot,
  User as UserIcon,
  PanelLeftClose,
} from "lucide-react";
import { useConversationStore } from "../stores/conversationStore";
import { useUiStore } from "../stores/uiStore";
import { useAuthStore } from "../stores/authStore";

export const Sidebar: React.FC = () => {
  const conversations = useConversationStore((s) => s.conversations);
  const activeId = useConversationStore((s) => s.activeId);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const createConversation = useConversationStore((s) => s.createConversation);
  const renameConversation = useConversationStore((s) => s.renameConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);
  const loading = useConversationStore((s) => s.loading);

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const models = useUiStore((s) => s.models);
  const selectedModelId = useUiStore((s) => s.selectedModelId);
  const setSelectedModelId = useUiStore((s) => s.setSelectedModelId);

  const devUser = useAuthStore((s) => s.devUser);
  const setDevUser = useAuthStore((s) => s.setDevUser);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      await renameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this conversation?")) {
      await deleteConversation(id);
    }
  };

  const handleNewChat = async () => {
    const newConv = await createConversation();
    selectConversation(newConv.id);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-gray-900 text-gray-200 flex flex-col transition-transform duration-200 ease-in-out border-r border-gray-800 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-tight text-white">AI Chat</h1>
              <p className="text-[11px] text-gray-400">Lightweight & Serverless</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-white p-1 rounded-md"
            title="Close sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* Action button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-medium shadow transition-all active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* AI Model Selector */}
        {models.length > 0 && (
          <div className="px-3 pb-2">
            <label className="block text-[11px] font-medium text-gray-400 mb-1 px-1">
              AI Provider
            </label>
            <div className="relative">
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full bg-gray-800/90 hover:bg-gray-800 text-xs text-gray-200 rounded-lg px-2.5 py-2 border border-gray-700/80 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id} className="bg-gray-900 text-white">
                    {m.label} ({m.model})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          <div className="text-[11px] font-medium text-gray-400 px-2 py-1">Recent Chats</div>

          {loading && conversations.length === 0 ? (
            <div className="space-y-2 px-2 py-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500 px-4">
              No conversations yet. Click "New Chat" to start.
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isEditing = editingId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    selectConversation(conv.id);
                    if (window.innerWidth < 768) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-gray-800 text-white font-medium"
                      : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 text-gray-400" />

                  {isEditing ? (
                    <div
                      className="flex-1 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full bg-gray-950 text-white text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        autoFocus
                      />
                      <button
                        onClick={(e) => handleSaveRename(conv.id, e)}
                        className="p-1 hover:text-green-400"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        className="p-1 hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate">{conv.title}</span>
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                          className="p-1 text-gray-400 hover:text-gray-200"
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(conv.id, e)}
                          className="p-1 text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* User profile & Dev switcher */}
        <div className="p-3 border-t border-gray-800 bg-gray-950/60">
          <div className="flex items-center justify-between text-xs text-gray-400 px-1 mb-1.5">
            <span className="flex items-center gap-1.5 font-medium text-gray-300">
              <UserIcon className="w-3.5 h-3.5" /> Dev User
            </span>
            <span className="text-[10px] bg-brand-950 text-brand-400 border border-brand-800/40 px-1.5 py-0.5 rounded">
              Local Mode
            </span>
          </div>
          <div className="flex gap-1">
            {["dev", "alice", "bob"].map((u) => (
              <button
                key={u}
                onClick={() => {
                  setDevUser(u);
                  useConversationStore.getState().loadConversations();
                }}
                className={`flex-1 py-1 px-1.5 text-center text-xs rounded-md transition-colors ${
                  devUser === u
                    ? "bg-brand-600 text-white font-medium shadow"
                    : "bg-gray-800/60 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};
