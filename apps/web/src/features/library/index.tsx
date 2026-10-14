// Owns: the exercise library module (SPEC §7) — its public surface: the ExercisePicker (search + filters, the allowed set
// only), the ExerciseDetailSheet (step images, GIF, instructions, form video, muscle map, strength chart, "Hide
// forever" / "Un-hide"), the Library and Equipment pages, the exercise index and thumbnails. Implementation lives in
// ./lib. Second entry point: ./queries (the library read's input).
export { ExercisePicker, type ExercisePickerProps, type ExerciseFilter } from './lib/ExercisePicker'
export { ExerciseDetailSheet, type ExerciseDetailSheetProps } from './lib/ExerciseDetailSheet'
export { LibraryPage, ExercisePage } from './lib/LibraryPage'
export { EquipmentPage } from './lib/EquipmentPage'
export { useExerciseIndex, type ExerciseIndex } from './lib/useExercises'
export { ExerciseThumb, type ExerciseThumbProps } from './lib/ExerciseThumb'
/** An exercise's history as strength chart points. */
export { strengthSessions } from './lib/ExerciseDetail'
