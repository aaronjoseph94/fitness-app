// Owns: the web build — React, the PWA (injectManifest so src/sw.ts can add push + offline routes), dev proxy to the local Worker.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // Access gates the manifest: send cookies with it or the app is not installable.
      useCredentials: true,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        globIgnores: ['exercises/**', 'media/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Fitness',
        short_name: 'Fitness',
        description: "Aaron's AI-first fitness tracker",
        theme_color: '#4F46E5',
        background_color: '#FAFAFC',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/mcp': 'http://127.0.0.1:8787',
    },
  },
  build: { sourcemap: true },
})
