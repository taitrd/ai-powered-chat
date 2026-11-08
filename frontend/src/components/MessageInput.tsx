import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../stores/hooks";
import { stopStreaming } from "../stores/features/chat/chatThunks";
import { showToast } from "../stores/features/ui/uiThunks";

const MAX_CHARS = 4000;

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dispatch = useAppDispatch();
  const streamStatus = useAppSelector((s) => s.chat.streamStatus);

  const isStreaming = streamStatus === "streaming";

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [content]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isStreaming || disabled) return;

    if (trimmed.length > MAX_CHARS) {
      dispatch(
        showToast({
          type: "error",
          message: `Message exceeds the ${MAX_CHARS} character limit.`,
        })
      );
      return;
    }

    onSendMessage(trimmed);
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 md:p-6 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
      <div className="max-w-4xl mx-auto w-full relative">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-end bg-white border border-gray-300/80 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 transition-all p-2.5"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? "Select or create a conversation to start chatting..."
                : "Type your message... (Shift + Enter for new line)"
            }
            disabled={disabled}
            className="flex-1 max-h-44 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none px-2 py-1 leading-relaxed"
          />

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {content.length > 0 && (
              <span
                className={`text-[11px] ${
                  content.length > MAX_CHARS ? "text-red-500 font-semibold" : "text-gray-400"
                }`}
              >
                {content.length}/{MAX_CHARS}
              </span>
            )}

            {isStreaming ? (
              <button
                type="button"
                onClick={() => dispatch(stopStreaming())}
                className="w-8 h-8 rounded-xl bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center transition-all shadow-sm active:scale-95"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!content.trim() || disabled}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                  content.trim() && !disabled
                    ? "bg-brand-600 hover:bg-brand-500 text-white active:scale-95"
                    : "bg-gray-100 text-gray-300 cursor-not-allowed"
                }`}
                title="Send message"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
