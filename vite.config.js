import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The bundled boundary geometry intentionally makes the main chunk large.
    chunkSizeWarningLimit: 6000,
  },
})