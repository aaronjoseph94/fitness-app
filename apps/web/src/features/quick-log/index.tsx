// Owns: the logging module (SPEC §6 quick-log row and every phase-1 logging flow). Entry points:
// - QuickLogSheet: the shell's bottom sheet, opened by the quick-log button and by `useUiStore().openQuickLog(kind)`,
//   logging to today.
// - LogSheet: the same sheet, controlled, for any date and meal slot (the Log tab uses it for earlier days).
// - The logging kit the Log tab builds on: writes that know what they make stale and show as pending until synced
//   (useLogMutation, usePendingLogs), the shared reads (day, settings, water, fasts), the food picker, the food maths
//   and slots, Edmonton dates, and the small form pieces.
import { useUiStore } from '../../app/ui-store'
import { LogSheet } from './lib/LogSheet'

export function QuickLogSheet() {
  const { open, kind } = useUiStore((s) => s.quickLog)
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const close = useUiStore((s) => s.closeQuickLog)
  return <LogSheet open={open} kind={kind} onClose={close} onPickKind={(next) => openQuickLog(next ?? undefined)} />
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
