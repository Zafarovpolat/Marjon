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
    // Каскад проекта держится на @layer (см. tools/layer-split.mjs), поэтому
    // цель для CSS задана явно. По умолчанию Vite целится в набор браузеров с
    // поддержкой модулей, куда попадает Safari 14 — там @layer ещё нет, и
    // сборщик предупредил бы о неподдерживаемом правиле. Приложение работает в
    // Electron и в актуальных браузерах, так что нижняя планка — версии, где
    // @layer появился (весна 2022).
    cssTarget: ["chrome99", "edge99", "firefox97", "safari15.4"],
    rollupOptions: {
      input: {
        kafe: "index.html",
        admin: "admin.html",
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
