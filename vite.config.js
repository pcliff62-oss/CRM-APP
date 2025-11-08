import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      // Proxy to Next.js app for CRM to read appointments without CORS
      // Supports dynamic port via env: VITE_NEXT_BASE or NEXT_PORT
      '/next-api': {
        target: process.env.VITE_NEXT_BASE || `http://127.0.0.1:${process.env.NEXT_PORT || 3001}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/next-api/, '')
      }
    }
  },
})
