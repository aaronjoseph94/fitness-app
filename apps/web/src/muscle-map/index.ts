// Owns: the public surface of the muscle map — the map itself (front/back/both, any size down to a 64 px
// thumbnail, the violet volume steps or the coral fat-share steps, a standard or light body, optional tap-to-select),
// its legend (named chips, or 1d's Light → Heavy scale), the level scales and muscle display names. Geometry is generated
// from the vendored react-muscle-map SVG (source/, public domain) by scripts/extract.mjs into lib/geometry.ts.
export { MuscleMap, type MuscleMapProps } from './lib/MuscleMap'
export { MuscleMapLegend, type MuscleMapLegendProps } from './lib/MuscleMapLegend'
export { MUSCLE_LABELS, levelLabel, type MuscleLevel, type MuscleScale } from './lib/levels'
export type { MuscleView } from './lib/geometry'
