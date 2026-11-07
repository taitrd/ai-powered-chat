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
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
