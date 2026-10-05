// Owns: hosting the quick-log sheet over every page — its code (every logging flow, ~30 KB) loads on first open or when
// the quick-log button is about to be pressed, not with the first paint; the sheet starts closed. Like AskAiHost.
import { lazy, Suspense, useEffect, useState } from 'react'
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
