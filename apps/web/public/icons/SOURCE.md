<!-- Owns: provenance of the app icons in this folder and how to regenerate them. -->
# App icons

Drawn for this app (2026-10-05), no third-party art. Indigo `#4F46E5` (= `tokens.metric.weight`), white glyph: a rising
trend line toward a target dot.

| File | Size | Shape | Glyph scale | Used by |
| --- | --- | --- | --- | --- |
| `icon.svg` | vector | rounded square (rx 112/512), transparent corners | 1.0 | favicon (`index.html`) |
| `favicon-32.png` | 32 | as `icon.svg` | 1.0 | favicon fallback |
| `icon-192.png`, `icon-512.png` | 192, 512 | as `icon.svg` | 1.0 | manifest, purpose `any` |
| `icon-512-maskable.png` | 512 | full-bleed square | 0.70 (inside the 80 % safe circle) | manifest, purpose `maskable` |
| `apple-touch-icon.png` | 180 | full-bleed square (iOS rounds it) | 0.86 | iOS home screen |

**Regenerate.** The full-bleed variants are `icon.svg` without `rx`, with the glyph group's transform set to
`translate(256·(1−s) − 10·s, 256·(1−s) + 10·s) scale(s)` for glyph scale `s`. Each PNG is a Playwright Chromium
element screenshot of the SVG at the target size with `omitBackground: true`.
