import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // bind every interface: Node may resolve `localhost` to IPv6 only,
    // leaving 127.0.0.1 dead and the browser on a white screen
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
