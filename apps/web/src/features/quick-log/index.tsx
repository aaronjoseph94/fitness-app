// Owns: the logging module (SPEC §6 quick-log row, every logging flow, and phase 2's AI on every log). Entry points:
// - QuickLogSheet: the shell's bottom sheet, opened by the quick-log button and by
//   `useUiStore().openQuickLog(kind, { date?, slot? })`, logging to today unless a date is given.
// - LogSheet: the same sheet, controlled, for any date and meal slot (the Log tab uses it for earlier days).
// - Meal capture (photo, barcode, voice, text, favourites, foods) inside the meal form, then MealReview: analysis
//   progress, the editable item list (ItemsEditor) and Confirm, then the DayAdjustmentCard.
// - The logging kit the Log tab builds on: writes that know what they make stale and show as pending until synced
//   (useLogMutation, usePendingLogs), the shared reads (day, settings, water, fasts, the day's meals polled while one
//   is analysed), the food picker, food icons, the food maths and slots, Edmonton dates, and the small form pieces.
import { useUiStore } from '../../app/ui-store'
import { LogSheet } from './lib/LogSheet'

export function QuickLogSheet() {
  const { open, kind, date, slot } = useUiStore((s) => s.quickLog)
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const close = useUiStore((s) => s.closeQuickLog)
  return <LogSheet open={open} kind={kind} date={date} slot={slot} onClose={close} onPickKind={(next) => openQuickLog(next, { date, slot })} />
}

export { LogSheet, type LogSheetProps } from './lib/LogSheet'
export { useLogMutation, usePendingLogs, type PendingLog } from './lib/writes'
export { useDay, useLogSettings, useWater, type LogSettings, type WaterDay } from './lib/reads'
export { useFasts, useNow, plannedInMonth, type FastView, type FastStatusView } from './lib/fasts'
export { FoodPicker, type PickedFood } from './lib/FoodPicker'
export { WaterForm } from './lib/WaterForm'
export { portion, scaled, sum, SLOT_LABEL, SLOT_TIME, visibleSlots, slotShare, type Per100g } from './lib/nutrition'
export { todayLocal, dateOf, clockOf, shiftDate, instantAt, relativeDay, formatDuration, formatDateTime } from './lib/dates'
export { LoadProblem, NumberField, parseNumber, problemText, noticeFor, type LogNotice } from './lib/ui'
export { MealReview, type MealReviewProps } from './lib/review/MealReview'
export { ItemsEditor } from './lib/review/ItemsEditor'
export { draftTotals, fromMealItem, fromFood, toItemInputs, type DraftItem } from './lib/review/items'
export { useDayMealsLive, analysisState, type AnalysisState } from './lib/review/meal-live'
export { DayAdjustmentCard, type DayAdjustmentCardProps } from './lib/review/DayAdjustmentCard'
export { latestAdjustment, useDayAdjustment, type AdjustmentEvent } from './lib/review/adjustment'
export { FoodIcon, useFoodIcons } from './lib/review/food-icons'
