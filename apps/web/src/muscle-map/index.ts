// Owns: the public surface of the muscle map — the map itself (front/back/both, any size down to a 96 px
// thumbnail, optional tap-to-select), its legend, the level scale and muscle display names. Geometry is generated
// from the vendored react-muscle-map SVG (source/, public domain) by scripts/extract.mjs into lib/geometry.ts.
export { MuscleMap, type MuscleMapProps } from './lib/MuscleMap'
export { MuscleMapLegend, type MuscleMapLegendProps } from './lib/MuscleMapLegend'
export { LEVEL_LABELS, MUSCLE_LABELS, levelColor, levelLabel, type MuscleLevel } from './lib/levels'
export type { MuscleView } from './lib/geometry'
