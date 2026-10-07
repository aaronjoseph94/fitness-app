// Owns: the web build — React, the PWA (injectManifest so src/sw.ts owns caching and later push), the manifest and
// theme colour from the theme tokens, the font's CSS inlined and its latin file preloaded, static files that live
// outside public/ (exercise step images and thumbnails, exercise GIFs, the barcode reader's WASM) served in dev and
// copied into the build, and the dev/preview proxy to the local Worker.
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')

/** Entry stylesheets at most this big are inlined into index.html (today: only Outfit's two @font-face rules, ~0.7 KB). */
const INLINE_CSS_MAX_BYTES = 4 * 1024

/**
 * The self-hosted Outfit font without a render-blocking request: the entry stylesheet (its @font-face rules, still
 * font-display: swap) is inlined into index.html, and the latin woff2 that every screen uses is preloaded, so the font
 * downloads alongside the scripts instead of being discovered at the first paint. (The CSP allows inline styles.)
 */
function inlineFontCss(): Plugin {
  return {
    name: 'fitness:inline-font-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        let out = html
        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type !== 'asset' || !fileName.endsWith('.css')) continue
          const css = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)
          const link = new RegExp(`<link rel="stylesheet"[^>]*href="/${escapeRegExp(fileName)}"[^>]*>`)
          if (css.length > INLINE_CSS_MAX_BYTES || !link.test(out)) continue
          out = out.replace(link, () => `<style>${css}</style>`)
        }
        const latin = Object.keys(bundle).find((f) => /\/outfit-latin-wght-normal-[^/]+\.woff2$/.test(f))
        if (latin) {
          out = out.replace('<title>', () => `<link rel="preload" href="/${latin}" as="font" type="font/woff2" crossorigin />\n    <title>`)
        }
        return out
      },
    },
  }
}

// The local Worker the dev and preview servers proxy to; FITNESS_WORKER_ORIGIN points a second dev server at another
// Worker (e.g. one per parallel agent, each with its own local D1).
const workerOrigin = process.env.FITNESS_WORKER_ORIGIN ?? 'http://127.0.0.1:8787'
const workerProxy = {
  '/api': workerOrigin,
  '/mcp': workerOrigin,
}

export default defineConfig({
  plugins: [
    react(),
    staticMounts(STATIC_MOUNTS),
    themeColorMeta(),
    inlineFontCss(),
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
        // Runtime-cached by src/sw.ts instead of precached: exercise media, food icons (loaded with a meal), the barcode
        // WASM (1 MB, on the first scan) and pdf.js with its worker (~1.7 MB, only when a scan PDF is opened).
        globIgnores: ['exercises/**', 'media/**', 'wasm/**', 'food-icons/**', 'assets/pdf-*.js', 'assets/pdf.worker.min-*'],
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
  // 'hidden': maps are written for local debugging but never referenced from the bundles, and public/.assetsignore
  // keeps *.map out of the Worker's static assets, so they are never uploaded or served.
  build: { sourcemap: 'hidden' },
})
