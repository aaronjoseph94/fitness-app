// Owns: the web build — React, the PWA (injectManifest so src/sw.ts owns caching and later push), the manifest and
// theme colour from the theme tokens, exercise images served in dev and copied into the build, and the dev/preview
// proxy to the local Worker.
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { tokens } from './src/theme'

/** Fetched by `pnpm --filter @fitness/exercises fetch -- --images` (gitignored); served at /exercises/<id>/<n>.jpg. */
const EXERCISE_IMAGES = fileURLToPath(new URL('../../packages/exercises/images', import.meta.url))

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/** Dev: serve /exercises/* from the exercises package. Build: copy the folder to dist/exercises when it exists. */
function exerciseImages(): Plugin {
  let outDir = ''
  return {
    name: 'fitness:exercise-images',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/exercises', (req, res) => {
        const file = resolve(EXERCISE_IMAGES, `.${decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')}`)
        const inside = file.startsWith(EXERCISE_IMAGES + sep)
        if (!inside || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', IMAGE_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (existsSync(EXERCISE_IMAGES)) cpSync(EXERCISE_IMAGES, join(outDir, 'exercises'), { recursive: true })
    },
  }
}

/** The browser's theme colour comes from the page token, so the status bar blends into the top bar. */
function themeColorMeta(): Plugin {
  return {
    name: 'fitness:theme-color',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'theme-color', content: tokens.ink.page }, injectTo: 'head' }],
  }
}

const workerProxy = {
  '/api': 'http://127.0.0.1:8787',
  '/mcp': 'http://127.0.0.1:8787',
}

export default defineConfig({
  plugins: [
    react(),
    exerciseImages(),
    themeColorMeta(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // src/app/lib/pwa.ts registers the worker (virtual:pwa-register would need workbox-window).
      injectRegister: false,
      // Access gates the manifest: send cookies with it or the app is not installable.
      useCredentials: true,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Exercise media is runtime-cached by the service worker (CacheFirst), not precached.
        globIgnores: ['exercises/**', 'media/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'Fitness',
        short_name: 'Fitness',
        description: "Aaron's AI-first fitness tracker",
        lang: 'en-CA',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: tokens.ink.page,
        background_color: tokens.ink.page,
        categories: ['health', 'fitness'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { proxy: workerProxy },
  preview: { proxy: workerProxy },
  build: { sourcemap: true },
})
