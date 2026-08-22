import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  server: {
    // Bind all interfaces so Nimiq Pay on a phone can reach the dev server.
    host: true,
    port: 5175,
    proxy: {
      // One origin for the app and the relay, so the same URL works from a
      // phone on the LAN as it does on the desktop.
      "/api": {
        target: process.env.RELAY_URL ?? "http://127.0.0.1:3100",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
})
