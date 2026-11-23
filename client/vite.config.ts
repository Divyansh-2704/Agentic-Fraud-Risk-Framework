import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The automated UI tests run their own API + UI on other ports (see playwright.config.ts), so both are configurable.
const apiPort = process.env.API_PORT ?? '4000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.UI_PORT ?? 5173),
    strictPort: !!process.env.UI_PORT,
    proxy: { '/api': `http://localhost:${apiPort}` },
    fs: { allow: ['..'] }, // shared/ lives one level up
  },
})
