import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Proxy /v1/* to the local engine so the viewer can fetch live data
// (e.g. /v1/files/snippets) without CORS configuration. Override the
// upstream via VITE_ENGINE_URL in a .env file or shell when the engine
// listens on a non-default host/port.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const engineUpstream = env.VITE_ENGINE_URL || "http://127.0.0.1:9002";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5180,
      open: true,
      proxy: {
        "/v1": {
          target: engineUpstream,
          changeOrigin: true,
        },
      },
    },
  };
});
