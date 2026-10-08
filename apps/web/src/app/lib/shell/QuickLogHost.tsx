// Owns: hosting the quick-log sheet over every page — its code (every logging flow, ~40 KB) starts loading right after
// the first render (not at idle: the entrance count-ups keep the page busy for well over a second, and logging offline
// must never depend on fetching code), so it is in memory before the network can drop. The sheet starts closed. Like AskAiHost: if the
// code still can't be fetched (offline before it ever loaded), the sheet closes with a short note instead of the error
// replacing the whole app, and the next open tries again.
import Snackbar from '@mui/material/Snackbar'
import { lazy, Suspense, useEffect, useState } from 'react'
import { LoadBoundary } from '../../../components'
import { useUiStore } from '../../ui-store'

const loadSheet = () => import('../../../features/quick-log/sheet')

const QuickLogSheet = lazy(() => loadSheet().then((m) => ({ default: m.QuickLogSheet })))

/** Start loading the sheet's code ahead of a likely open (the quick-log button is hovered, focused or touched). */
export function preloadQuickLog(): void {
  // A failed preload (offline) is not an error yet: opening the sheet tries again and shows it.
  loadSheet().catch(() => undefined)
}

export function QuickLogHost() {
  const open = useUiStore((s) => s.quickLog.open)
  const closeQuickLog = useUiStore((s) => s.closeQuickLog)
  const [loaded, setLoaded] = useState(open)
  /** Bumped on every open, so a sheet that failed to load is tried again. */
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => preloadQuickLog(), [])
  useEffect(() => {
    if (!open) return
    setLoaded(true)
    setAttempt((n) => n + 1)
  }, [open])

  if (!loaded) return null
  return (
    <>
      <LoadBoundary
        fallback={null}
        resetKey={attempt}
        onError={() => {
          closeQuickLog()
          setFailed(true)
        }}
      >
        <Suspense fallback={null}>
          <QuickLogSheet />
        </Suspense>
      </LoadBoundary>
      <Snackbar
        open={failed}
        autoHideDuration={5000}
        onClose={() => setFailed(false)}
        message="The log sheet couldn’t open. Reload the app once you’re online."
        data-testid="quick-log-load-failed"
      />
    </>
  )
}
