import { defineConfig } from "vite";
export default defineConfig({ base: "./", build: { target: "es2019", chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 }, server: { host: "127.0.0.1", port: 5173 } });
