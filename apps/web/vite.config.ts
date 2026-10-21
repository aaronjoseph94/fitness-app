// Owns: the web build — React, the PWA (injectManifest so src/sw.ts owns caching and push), the manifest and
// theme colour from the theme tokens, the fonts' CSS inlined and their latin files preloaded, static files that live
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
  {
    url: '/exercises',
    source: fileURLToPath(new URL('../../packages/exercises/images', import.meta.url)),
    kind: 'dir',
  },
  /** Animated demos, fetched by the exercises media script (gitignored): /media/exercises/<exercise-id>.gif. */
  {
    url: '/media/exercises',
    source: fileURLToPath(new URL('../../packages/exercises/media', import.meta.url)),
    kind: 'dir',
  },
  { url: '/wasm/zxing_reader.wasm', source: zxingReaderWasm(), kind: 'file' },
]

/**
 * Dev: serve each mount from its source. Build: copy each existing source into dist at its URL path. Vite also calls
 * closeBundle when a dev or Vitest server closes, so the copy runs only for a real build (else ~150 MB of exercise
 * media lands in whatever outDir that server was given, e.g. Vitest's `dummy-non-existing-folder`).
 */
function staticMounts(mounts: readonly StaticMount[]): Plugin {
  let outDir = ''
  let building = false
  return {
    name: 'fitness:static-mounts',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      building = config.command === 'build'
    },
    configureServer(server) {
      for (const { url, source, kind } of mounts) {
        server.middlewares.use(url, (req, res) => {
          const rest = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
          const file = !source
            ? ''
            : kind === 'dir'
              ? resolve(source, `.${rest}`)
              : rest === '/'
                ? source
                : ''
          const inside = !!source && (kind === 'dir' ? file.startsWith(source + sep) : file === source)
          if (!inside || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404
            res.end()
            return
          }
          res.setHeader(
            'Content-Type',
            CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
          )
          createReadStream(file).pipe(res)
        })
      }
    },
    closeBundle() {
      if (!building) return
      for (const { url, source } of mounts) {
        if (!source || !existsSync(source)) continue
        const target = join(outDir, ...url.split('/').filter(Boolean))
        mkdirSync(statSync(source).isDirectory() ? target : dirname(target), { recursive: true })
        cpSync(source, target, { recursive: true })
      }
    },
  }
}

/** The browser's theme colour is the sky's top stop, so the status bar runs into the sky hero under the nav. */
function themeColorMeta(): Plugin {
  return {
    name: 'fitness:theme-color',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'theme-color', content: tokens.summit.sky.top }, injectTo: 'head' },
    ],
  }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')

/** Entry stylesheets at most this big are inlined into index.html (today: Outfit's and DM Sans' four @font-face rules, ~1.6 KB). */
const INLINE_CSS_MAX_BYTES = 4 * 1024

/** The latin (wght axis) file of each self-hosted family: the one every screen uses, so it is preloaded. */
const PRELOADED_FONT = /\/(?:outfit|dm-sans)-latin-wght-normal-[^/]+\.woff2$/

/**
 * The self-hosted variable fonts (Outfit and DM Sans) without a render-blocking request: the entry stylesheet (their
 * @font-face rules, still font-display: swap, one per unicode range) is inlined into index.html, and each family's latin
 * woff2 is preloaded, so the fonts download alongside the scripts instead of being discovered at the first paint. The
 * latin-ext files are fetched only if a page ever shows such a glyph. Never a font CDN: the Worker's CSP is 'self' and
 * the PWA must render offline. (The CSP allows inline styles.)
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
          const css =
            typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)
          const link = new RegExp(`<link rel="stylesheet"[^>]*href="/${escapeRegExp(fileName)}"[^>]*>`)
          if (css.length > INLINE_CSS_MAX_BYTES || !link.test(out)) continue
          out = out.replace(link, () => `<style>${css}</style>`)
        }
        const preloads = Object.keys(bundle)
          .filter((f) => PRELOADED_FONT.test(f))
          .sort()
          .map((f) => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin />\n    `)
          .join('')
        if (preloads) out = out.replace('<title>', () => `${preloads}<title>`)
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
        // The fonts' latin-ext files are not precached: the UI is English (latin only), the browser fetches them by
        // unicode-range if a name ever needs one, and offline those glyphs use the system face.
        globIgnores: [
          'exercises/**',
          'media/**',
          'wasm/**',
          'food-icons/**',
          'assets/pdf-*.js',
          'assets/pdf.worker.min-*',
          'assets/outfit-latin-ext-*',
          'assets/dm-sans-latin-ext-*',
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: "Aaron's Fitness Tracker",
        // The home-screen label: iOS shows about twelve characters before it ellipsises.
        short_name: "Aaron's Fitness",
        description: "Aaron's AI-first fitness tracker",
        lang: 'en-CA',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // The status bar runs into the sky; the splash screen is the cream page.
        theme_color: tokens.summit.sky.top,
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
  // The kit barrel (src/components/index.ts) is pure re-exports. Marked side-effect-free so the shell's few imports
  // from it don't pull every kit module (and MUI's ToggleButtonGroup) into the entry chunk. Every other module keeps
  // rolldown's default (its package.json `sideEffects`, else true).
  build: {
    sourcemap: 'hidden',
    rolldownOptions: {
      treeshake: { moduleSideEffects: [{ test: /\/src\/components\/index\.ts$/, sideEffects: false }] },
    },
  },
})
