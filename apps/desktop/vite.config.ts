import process from "node:process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    port: 28743,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 28744 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
