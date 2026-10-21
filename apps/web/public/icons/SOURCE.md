<!-- Owns: provenance of the app icons in this folder and how to regenerate them. -->
# App icons

Drawn for this app (2026-10-05, recoloured 2026-10-06, redrawn as a dumbbell 2026-10-08, redrawn as the 1d Summit mark
2026-10-21), no third-party art. A deep-sky tile — a vertical gradient `#1A0A42` → `#3E1A73` (51 %) → `#9A3A8E`, the
first three stops of the 1d inner-page sky (`docs/design/design_handoff_fitness_1d/README.md` §2) — with the Summit mark
from `Summit-Nav.dc.html`'s logo tile: a white trend polyline (`90,356 190,256 264,312 338,238`, stroke 52, round caps
and joins) and a gold `#FFD27A` sun (`r 44` at `398,178`) in the 512 box. The mark's box is centred to within 3/512.

| File | Size | Shape | Glyph scale | Used by |
| --- | --- | --- | --- | --- |
| `icon.svg` | vector | rounded square (rx 112/512), transparent corners | 1.0 | favicon (`index.html`) |
| `favicon-32.png` | 32 | as `icon.svg` | 1.0 | favicon fallback |
| `icon-192.png`, `icon-512.png` | 192, 512 | as `icon.svg` | 1.0 | manifest, purpose `any` |
| `icon-512-maskable.png` | 512 | full-bleed square | 0.70 (inside the 80 % safe circle) | manifest, purpose `maskable` |
| `apple-touch-icon.png` | 180 | full-bleed square (iOS rounds it) | 0.86 | iOS home screen |

**Regenerate.** The full-bleed variants are `icon.svg` without `rx`, with the glyph group's transform set to
`translate(256·(1−s) 256·(1−s)) scale(s)` for glyph scale `s` (the glyph is centred, so no offset). Each PNG is rendered
from the SVG at the target size with Playwright's Chromium (`page.setContent` of the SVG at N×N, deviceScaleFactor 1, a
screenshot with `omitBackground`; last done 2026-10-21) — that keeps the transparent corners of `icon.svg` (RGBA) and
paints the full-bleed squares edge to edge (Chromium writes those opaque, as RGB), which is what `purpose: maskable` and
the iOS home screen need. `rsvg-convert -w N -h N` produces the same artwork where it is installed.

**Checked.** The 2026-10-06 pass found `rsvg-convert 2.63.2` and Chromium render `icon.svg` identically (it was not
installed for the 2026-10-21 pass, so that one used Chromium only). At glyph scale 0.70 the mark's farthest point (the
polyline's left cap) sits 154 px from the centre of the 512 maskable icon, inside the 205 px safe circle.
