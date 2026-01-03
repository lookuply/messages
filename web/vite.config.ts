import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

// Check if SSL certs exist (for local development)
const certPath = path.resolve('.cert/key.pem')
const certExists = fs.existsSync(certPath)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'icons/*.png', 'icons/*.svg'],
      manifest: false, // Use external manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Don't cache relay server requests
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
      },
      devOptions: {
        enabled: true, // Enable PWA in development
      },
    }),
  ],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: certExists ? {
    host: '0.0.0.0',
    port: 5173,
    https: {
      key: fs.readFileSync('.cert/key.pem'),
      cert: fs.readFileSync('.cert/cert.pem'),
    },
  } : {
    host: '0.0.0.0',
    port: 5173,
  },
})
