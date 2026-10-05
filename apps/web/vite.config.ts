// Owns: the web build — React, the PWA (injectManifest so src/sw.ts owns caching and later push), the manifest and
// theme colour from the theme tokens, static files that live outside public/ (exercise step images, exercise GIFs, the
// barcode reader's WASM) served in dev and copied into the build, and the dev/preview proxy to the local Worker.
import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { tokens } from './src/theme'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
}

/**
 * The ZXing reader WASM behind `barcode-detector/ponyfill`, resolved through barcode-detector (zxing-wasm is its
 * dependency, not ours). Served at /wasm/zxing_reader.wasm (features/quick-log/lib/capture/barcode.ts points
 * prepareZXingModule's locateFile there), so scanning never reaches a CDN. Null when the package is missing.
 */
function zxingReaderWasm(): string | null {
  try {
    const detector = createRequire(import.meta.url).resolve('barcode-detector')
    return createRequire(detector).resolve('zxing-wasm/reader/zxing_reader.wasm')
  } catch {
    return null
  }
}

interface StaticMount {
  /** URL path it is served at, e.g. '/media/exercises'. */
  url: string
  /** A folder (served beneath `url`) or one file (served at `url`). A missing source is skipped (dev: 404). */
  source: string | null
  kind: 'dir' | 'file'
}

const STATIC_MOUNTS: StaticMount[] = [
  /** Step images, fetched by `pnpm --filter @fitness/exercises fetch -- --images` (gitignored): /exercises/<id>/<n>.jpg. */
  { url: '/exercises', source: fileURLToPath(new URL('../../packages/exercises/images', import.meta.url)), kind: 'dir' },
  /** Animated demos, fetched by the exercises media script (gitignored): /media/exercises/<exercise-id>.gif. */
  { url: '/media/exercises', source: fileURLToPath(new URL('../../packages/exercises/media', import.meta.url)), kind: 'dir' },
  { url: '/wasm/zxing_reader.wasm', source: zxingReaderWasm(), kind: 'file' },
]

/** Dev: serve each mount from its source. Build: copy each existing source into dist at its URL path. */
function staticMounts(mounts: readonly StaticMount[]): Plugin {
  let outDir = ''
  return {
    name: 'fitness:static-mounts',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      for (const { url, source, kind } of mounts) {
        server.middlewares.use(url, (req, res) => {
          const rest = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
          const file = !source ? '' : kind === 'dir' ? resolve(source, `.${rest}`) : rest === '/' ? source : ''
          const inside = !!source && (kind === 'dir' ? file.startsWith(source + sep) : file === source)
          if (!inside || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404
            res.end()
            return
          }
          res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
          createReadStream(file).pipe(res)
        })
      }
    },
    closeBundle() {
      for (const { url, source } of mounts) {
        if (!source || !existsSync(source)) continue
        const target = join(outDir, ...url.split('/').filter(Boolean))
        mkdirSync(statSync(source).isDirectory() ? target : dirname(target), { recursive: true })
        cpSync(source, target, { recursive: true })
      }
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
    staticMounts(STATIC_MOUNTS),
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
        // Exercise media is runtime-cached by the service worker (CacheFirst), not precached; the barcode WASM (1 MB)
        // loads only when a barcode is scanned.
        globIgnores: ['exercises/**', 'media/**', 'wasm/**'],
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
