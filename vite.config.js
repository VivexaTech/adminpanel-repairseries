import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Tailwind is applied via postcss.config.js + @tailwindcss/postcss (see package.json).
export default defineConfig({
  plugins: [react()],
  server: {
    // Prefer IPv4 loopback on Windows — binding/listening on `localhost` can fail on some setups.
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/nominatim/, ''),
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: false,
  },
})
