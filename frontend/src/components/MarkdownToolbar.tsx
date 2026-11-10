import React from "react";
import {
  Bold,
  Italic,
  Code,
  FileCode,
  Table as TableIcon,
  List,
  Quote,
} from "lucide-react";

export interface MarkdownToolbarProps {
  onInsert: (prefix: string, suffix?: string, placeholder?: string) => void;
  disabled?: boolean;
}

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  onInsert,
  disabled = false,
}) => {
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-gray-100 text-gray-500 text-xs bg-gray-50/50">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onInsert("**", "**", "bold text")}
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Format Bold (**text**)"
          disabled={disabled}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsert("*", "*", "italic text")}
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Format Italic (*text*)"
          disabled={disabled}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
        <button
          type="button"
          onClick={() => onInsert("`", "`", "code")}
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Format Inline Code (`code`)"
          disabled={disabled}
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsert("```python\n", "\n```", "# Your code here")}
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Format Code Block (```python...```)"
          disabled={disabled}
        >
          <FileCode className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            onInsert(
              "| Column 1 | Column 2 |\n| :--- | :--- |\n| ",
              " | Details |\n",
              "Item 1"
            )
          }
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Insert Table"
          disabled={disabled}
        >
          <TableIcon className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
        <button
          type="button"
          onClick={() => onInsert("- ", "", "List item")}
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Format Bullet List (- item)"
          disabled={disabled}
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onInsert("> ", "", "Quote text")}
          className="p-1 rounded hover:bg-gray-200/70 hover:text-gray-900 transition-colors cursor-pointer"
          title="Format Blockquote (> text)"
          disabled={disabled}
        >
          <Quote className="w-3.5 h-3.5" />
        </button>
      </div>

      <span className="text-[10px] text-gray-400 font-medium tracking-tight">
        Markdown
      </span>
    </div>
  );
};

export default MarkdownToolbar;
