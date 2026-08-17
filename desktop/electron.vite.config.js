import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.js') }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.js') }
      }
    }
  },
  renderer: {
    root: 'src',
    // Явный порт dev-сервера рендерера. Веб-фронт (frontend/) уже держит
    // дефолтный Vite-порт 5173; без этой строки electron-vite поднимал бы
    // рендерер тоже на 5173, и в режиме «фронт + десктоп» два Vite-сервера
    // дрались за порт (второй молча уезжал на 5174 — недетерминированно).
    // strictPort фиксирует 5174 и падает явно при реальном конфликте.
    server: { port: 5174, strictPort: true },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
})
