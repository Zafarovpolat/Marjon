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
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
})
