import React from "react";
import {
  BarChart3,
  CheckSquare,
  FileCode,
  FileText,
  Sparkles,
} from "lucide-react";

export interface PromptHelper {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}

export const PROMPT_HELPERS: PromptHelper[] = [
  {
    id: "table",
    label: "Markdown Table",
    icon: BarChart3,
    prompt:
      "Compare Gemini, Claude, and ChatGPT in a detailed Markdown table with columns for Model, Key Strengths, Limitations, and Best Use Cases.",
  },
  {
    id: "code",
    label: "Python Stream",
    icon: FileCode,
    prompt:
      "Write a complete Python async streaming example with type hints, comments, and a step-by-step code explanation.",
  },
  {
    id: "checklist",
    label: "Checklist",
    icon: CheckSquare,
    prompt:
      "Create a comprehensive production deployment checklist with Markdown task items (- [ ]), categories, and warning callout notes.",
  },
  {
    id: "guide",
    label: "Architecture Guide",
    icon: FileText,
    prompt:
      "Explain Event-Driven Architecture vs REST APIs using Markdown headings, bullet points, blockquotes, and bold text.",
  },
  {
    id: "showcase",
    label: "Rich Markdown",
    icon: Sparkles,
    prompt:
      "Please generate a rich Markdown showcase including headings, bold/italic text, a blockquote, a bullet list, a code block with syntax, and a 3-column table.",
  },
];

export interface QuickPromptsBarProps {
  onSelectPrompt: (prompt: string) => void;
  showMarkdown: boolean;
  onToggleMarkdown: () => void;
  disabled?: boolean;
}

export const QuickPromptsBar: React.FC<QuickPromptsBarProps> = ({
  onSelectPrompt,
  showMarkdown,
  onToggleMarkdown,
  disabled = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] font-medium text-gray-500 shrink-0 flex items-center gap-1 px-1">
          <Sparkles className="w-3.5 h-3.5 text-brand-600" /> Quick Prompts:
        </span>
        {PROMPT_HELPERS.map((helper) => {
          const Icon = helper.icon;
          return (
            <button
              key={helper.id}
              type="button"
              onClick={() => onSelectPrompt(helper.prompt)}
              disabled={disabled}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-gray-200/90 hover:border-brand-500 hover:bg-brand-50 text-gray-600 hover:text-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium shadow-2xs cursor-pointer active:scale-95"
              title={`Insert prompt: ${helper.label}`}
              aria-label={`Prompt: ${helper.label}`}
            >
              <Icon className="w-3 h-3 text-gray-500" />
              <span>{helper.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleMarkdown}
        className="shrink-0 text-[11px] text-gray-400 hover:text-brand-600 font-medium px-2 py-0.5 rounded hover:bg-gray-100 transition-colors cursor-pointer"
        title="Toggle Markdown Formatting Toolbar"
      >
        {showMarkdown ? "Hide Format" : "Format"}
      </button>
    </div>
  );
};

export default QuickPromptsBar;
