import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('react')) {
            return 'react-vendor'
          }
          if (id.includes('@iconify')) {
            return 'iconify-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
  base: './',
})
