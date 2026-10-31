import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-режим: фронт на 5173, /api и /media проксируются на локальный FastAPI (8000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/media": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  build: { assetsInlineLimit: 0 },
});
