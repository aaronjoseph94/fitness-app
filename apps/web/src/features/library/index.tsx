// Owns: the exercise library module (SPEC §7) — its public surface: the ExercisePicker (search + filters, allowed set by
// default), the ExerciseDetailSheet (step images, GIF, instructions, form video, muscle map, strength chart, "Hide
// forever"), and the Library and Equipment pages. Implementation lives in ./lib. Second entry point: ./queries (the
// library read's input).
export { ExercisePicker, type ExercisePickerProps, type ExerciseFilter } from './lib/ExercisePicker'
export { ExerciseDetailSheet, type ExerciseDetailSheetProps } from './lib/ExerciseDetailSheet'
export { LibraryPage, ExercisePage } from './lib/LibraryPage'
export { EquipmentPage } from './lib/EquipmentPage'
export { useExercises, useExerciseIndex, type ExerciseIndex } from './lib/useExercises'
export { ExerciseThumb, type ExerciseThumbProps } from './lib/ExerciseThumb'
/** Map levels for one exercise (primary 4, secondary 2), and an exercise's history as strength chart points. */
export { exerciseLevels, strengthSessions } from './lib/ExerciseDetail'
