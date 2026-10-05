// Owns: hosting the quick-log sheet over every page — its code (every logging flow, ~30 KB) loads once the page is idle
// after the first paint (or sooner, when the quick-log button is about to be pressed), so it is in memory before the
// network can drop: logging offline must never depend on fetching code. The sheet starts closed. Like AskAiHost.
import { lazy, Suspense, useEffect, useState } from 'react'
import { whenIdle } from '../../../offline'
import { useUiStore } from '../../ui-store'

const loadSheet = () => import('../../../features/quick-log/sheet')

const QuickLogSheet = lazy(() => loadSheet().then((m) => ({ default: m.QuickLogSheet })))

/** Start loading the sheet's code ahead of a likely open (the quick-log button is hovered, focused or touched). */
export function preloadQuickLog(): void {
  void loadSheet()
}

export function QuickLogHost() {
  const open = useUiStore((s) => s.quickLog.open)
  const [loaded, setLoaded] = useState(open)

  useEffect(() => whenIdle(preloadQuickLog), [])
  useEffect(() => {
    if (open) setLoaded(true)
  }, [open])

  if (!loaded) return null
  return (
    <Suspense fallback={null}>
      <QuickLogSheet />
    </Suspense>
  )
}
