// Owns: the logging sheet's entry point — QuickLogSheet (the shell's sheet driven by `useUiStore().quickLog`, opened by
// the quick-log button and by `openQuickLog(kind, { date?, slot? })`, logging to today unless a date is given) and the
// controlled LogSheet the Log tab opens for any day. A second entry point of the quick-log module, so the shell loads
// the sheet's code on first open (it starts closed) and pages that only use the logging kit (./index) never load the
// forms.
import { useUiStore } from '../../app/ui-store'
import { LogSheet } from './lib/LogSheet'

export { LogSheet, type LogSheetProps } from './lib/LogSheet'

export function QuickLogSheet() {
  const { open, kind, date, slot } = useUiStore((s) => s.quickLog)
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const close = useUiStore((s) => s.closeQuickLog)
  return (
    <LogSheet
      open={open}
      kind={kind}
      date={date}
      slot={slot}
      onClose={close}
      onPickKind={(next) => openQuickLog(next, { date, slot })}
    />
  )
}
