import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        kafe: "index.html",
        admin: "admin.html",
      },
      output: {
        // Split heavy, rarely-changing third-party code into cacheable vendor
        // chunks so the app entries stay small and a redeploy doesn't bust the
        // whole bundle. Build-output only — does not affect runtime behavior,
        // tests, or the CSS visual oracle (both render via vitest/jsdom).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/xlsx")) return "vendor-xlsx";
          if (id.includes("/chart.js") || id.includes("/@kurkle")) return "vendor-charts";
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (id.includes("/i18next") || id.includes("/react-i18next")) return "vendor-i18n";
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    include: ["src/**/*.test.{js,jsx}"],
    clearMocks: true,
    restoreMocks: true,
  },
});
