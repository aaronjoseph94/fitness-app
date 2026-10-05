# Muscle map source

<!-- Owns: provenance of the vendored muscle-map geometry. -->

- `react-muscle-map.svg`: static render of [react-muscle-map](https://github.com/Josep1992/react-muscle-map) 0.1.3 (Unlicense / public domain), produced with `renderToStaticMarkup(<MuscleMap idPrefix="mm"/>)` and SVGO. One SVG, front and back views, viewBox `0 0 1320.92 1206.46`. Groups carry `data-muscle` keyed by the free-exercise-db enum (17 keys), plus extra `hands` and `obliques` groups that we render as part of the base body (obliques count toward `abdominals`).
- Fallback geometry if ever needed: [body-muscles](https://www.npmjs.com/package/body-muscles) 1.0.0 path data.
- Picked 2026-10-05 per Aaron's direction to reuse web visuals rather than draw our own.
