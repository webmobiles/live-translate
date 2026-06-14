import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'path'

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [
    tanstackRouter({ routesDirectory: './src/routes' }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      // More-specific subpath must come before the bare package name
      { find: '@live-translate/shared/locales', replacement: path.resolve(__dirname, '../shared/src/locales.ts') },
      { find: '@live-translate/shared',         replacement: path.resolve(__dirname, '../shared/src/index.ts') },
      { find: '@',                               replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    proxy: {
      '/auth': {
        target:      SERVER_URL,
        changeOrigin: true,
        secure:      false,
      },
    },
  },
})
