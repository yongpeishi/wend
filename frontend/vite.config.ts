import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite answers requests for localhost and bare IPs, and 403s every other
    // hostname unless it's listed here. The Pi that hosts the shared staging
    // copy is reached by name, so name it -- see scripts/staging/README.md.
    allowedHosts: ['logpi.local'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // credentials (cookies) pass through automatically with changeOrigin proxying
      },
    },
  },
})
