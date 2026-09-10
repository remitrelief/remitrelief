import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
  server: {
    proxy: {
      // Canonical APIs live under /api so SPA routes like /campaigns stay free.
      "/api": "http://localhost:4000",
    },
  },
});
