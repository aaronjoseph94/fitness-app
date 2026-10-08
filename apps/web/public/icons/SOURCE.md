<!-- Owns: provenance of the app icons in this folder and how to regenerate them. -->
# App icons

Drawn for this app (2026-10-05, recoloured 2026-10-06, redrawn as a dumbbell 2026-10-08 at Aaron's request), no
third-party art. Facebook blue `#166FE5` (= `tokens.accent.main` and `tokens.metric.weight`), white glyph: a dumbbell —
a bar with two plates each side (five rounded rectangles in the 512 box; `BrandTile.tsx` draws the same shapes).

| File | Size | Shape | Glyph scale | Used by |
| --- | --- | --- | --- | --- |
| `icon.svg` | vector | rounded square (rx 112/512), transparent corners | 1.0 | favicon (`index.html`) |
| `favicon-32.png` | 32 | as `icon.svg` | 1.0 | favicon fallback |
| `icon-192.png`, `icon-512.png` | 192, 512 | as `icon.svg` | 1.0 | manifest, purpose `any` |
| `icon-512-maskable.png` | 512 | full-bleed square | 0.70 (inside the 80 % safe circle) | manifest, purpose `maskable` |
| `apple-touch-icon.png` | 180 | full-bleed square (iOS rounds it) | 0.86 | iOS home screen |

**Regenerate.** The full-bleed variants are `icon.svg` without `rx`, with the glyph group's transform set to
`translate(256·(1−s) 256·(1−s)) scale(s)` for glyph scale `s` (the glyph is centred, so no offset). Each PNG was rendered
from the SVG at the target size with Playwright's Chromium (`page.setContent` of the SVG at N×N, a screenshot with
`omitBackground`, 2026-10-08) — that keeps the transparent corners of `icon.svg` and paints the full-bleed squares edge
to edge, which is what `purpose: maskable` and the iOS home screen need. `rsvg-convert -w N -h N` produces the same
artwork where it is installed.

**Checked.** The 2026-10-06 pass found `rsvg-convert 2.63.2` and Chromium render `icon.svg` identically.
