import React, { useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useAppDispatch } from "../stores/hooks";
import { clearMessages } from "../stores/features/chat/chatThunks";
import { createConversation } from "../stores/features/conversations/conversationsThunks";

interface FullChatPanelProps {
  conversationId: string;
}

/** Replaces the message input when a chat has no room for another question and reply. */
export const FullChatPanel: React.FC<FullChatPanelProps> = ({ conversationId }) => {
  const dispatch = useAppDispatch();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="p-4 md:p-6">
      <div
        role="status"
        className="max-w-4xl mx-auto w-full bg-white border border-gray-300/80 rounded-2xl shadow-sm p-4 space-y-3"
      >
        <p className="text-sm text-gray-700">
          This chat is full. Start a new chat, or clear this one to keep going.
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">
              Delete all messages in this chat? The title is kept.
            </span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                dispatch(clearMessages(conversationId));
              }}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-500 text-white cursor-pointer"
            >
              Yes, clear it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => dispatch(createConversation())}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" /> Start a new chat
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Clear this chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
