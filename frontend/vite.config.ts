import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react() as any],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("react-markdown") ||
              id.includes("remark") ||
              id.includes("micromark") ||
              id.includes("mdast") ||
              id.includes("unist") ||
              id.includes("vfile") ||
              id.includes("bail") ||
              id.includes("is-plain-obj") ||
              id.includes("trough") ||
              id.includes("devlop") ||
              id.includes("decode-named-character-reference") ||
              id.includes("character-entities") ||
              id.includes("property-information") ||
              id.includes("space-separated-tokens") ||
              id.includes("comma-separated-tokens") ||
              id.includes("hast") ||
              id.includes("ccount") ||
              id.includes("trim-lines") ||
              id.includes("escape-string-regexp") ||
              id.includes("markdown")
            ) {
              return "markdown-vendor";
            }
            if (id.includes("@reduxjs/toolkit") || id.includes("react-redux")) {
              return "redux-vendor";
            }
            if (id.includes("lucide-react")) {
              return "icons-vendor";
            }
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
