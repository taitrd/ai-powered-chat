import React, { useEffect, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Loader2, Sparkles, User as UserIcon } from "lucide-react";
import { Message } from "../types";
import { useAppSelector } from "../stores/hooks";
import { selectActiveStream } from "../stores/features/chat/chatSlice";

interface ChatFeedProps {
  messages: Message[];
  loading: boolean;
  activeConversationTitle?: string;
}

const markdownComponents: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="w-full my-3 overflow-x-auto rounded-lg border border-gray-200/90 shadow-2xs">
      <table className="w-full min-w-full border-collapse text-left text-xs sm:text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2 font-semibold text-gray-700 whitespace-nowrap" {...props} />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-b border-gray-100 px-3.5 py-2 text-gray-600 align-top whitespace-normal" {...props} />
  ),
};

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  loading,
  activeConversationTitle,
}) => {
  // Only the active conversation's reply. Other chats keep streaming in the background.
  const activeStream = useAppSelector(selectActiveStream);
  const isStreaming = activeStream !== undefined;
  const streamingContent = activeStream?.content ?? "";

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages or streamingContent updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex gap-3 ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
          >
            {i % 2 !== 0 && (
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
            )}
            <div
              className={`h-16 rounded-2xl bg-gray-200 animate-pulse ${
                i % 2 === 0 ? "w-48" : "w-80"
              }`}
            />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 shadow-sm border border-brand-100">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">
          {activeConversationTitle || "How can I help you today?"}
        </h2>
        <p className="text-sm text-gray-500 max-w-md">
          Ask any question, explore ideas, or paste code. Replies are streamed
          in real time.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full"
    >
      {loading && messages.length > 0 && (
        <div className="flex justify-center -mt-2 mb-2">
          <span className="text-[11px] text-gray-500 bg-gray-100/90 border border-gray-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
            <Loader2 className="w-3 h-3 animate-spin text-brand-600" /> Updating
            messages...
          </span>
        </div>
      )}

      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div
            key={msg.id}
            className={`flex items-start gap-3 min-w-0 w-full ${isUser ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs shadow-sm ${
                isUser ? "bg-gray-800" : "bg-brand-600"
              }`}
            >
              {isUser ? (
                <UserIcon className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`min-w-0 max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm leading-relaxed overflow-hidden break-words ${
                isUser
                  ? "bg-gray-900 text-white rounded-tr-sm"
                  : "bg-white text-gray-800 border border-gray-200/80 rounded-tl-sm"
              }`}
            >
              {isUser ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="prose prose-sm max-w-none text-gray-800 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-brand-700 min-w-0 overflow-hidden">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Streaming In-Flight Bubble */}
      {isStreaming && (
        <div className="flex items-start gap-3 min-w-0 w-full flex-row">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0 text-white text-xs shadow-sm">
            <Bot className="w-4 h-4 animate-pulse" />
          </div>

          <div className="min-w-0 max-w-[85%] md:max-w-[75%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm leading-relaxed bg-white text-gray-800 border border-gray-200/80 overflow-hidden break-words">
            {streamingContent ? (
              <div className="prose prose-sm max-w-none text-gray-800 prose-pre:bg-gray-900 prose-pre:text-gray-100 min-w-0 overflow-hidden">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {streamingContent}
                </ReactMarkdown>
                <span className="inline-block w-1.5 h-4 ml-1 bg-brand-500 animate-pulse align-middle" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500 py-1">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" />
                </div>
                <span className="text-xs font-medium">Thinking...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
