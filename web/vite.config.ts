import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone/tablet on the same Wi-Fi
    proxy: { '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
})
