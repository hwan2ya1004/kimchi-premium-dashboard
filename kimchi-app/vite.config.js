import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/upbit': {
        target: 'https://api.upbit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/upbit/, ''),
      },
      '/api/bithumb': {
        target: 'https://api.bithumb.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bithumb/, ''),
      },
      '/api/binance': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/binance/, ''),
      },
      '/telegram': {
        target: 'https://api.telegram.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/telegram/, ''),
      },
    },
  },
})
