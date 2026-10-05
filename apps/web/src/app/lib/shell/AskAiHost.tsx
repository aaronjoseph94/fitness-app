// Owns: hosting the Ask AI slide-up panel over every tab — loaded on first open (the chat code stays out of the first
// paint), open while useUiStore().askAiOpen, closed on navigation and never over the AI tab itself (that page is the chat).
// When its code can't be fetched (offline before the service worker cached it), the panel closes with a short note
// instead of the error replacing the whole app; the next tap tries again.
import Snackbar from '@mui/material/Snackbar'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { LoadBoundary } from '../../../components'
import { useUiStore } from '../../ui-store'

const AskAiPanel = lazy(() => import('../../../features/ai').then((m) => ({ default: m.AskAiPanel })))

export function AskAiHost() {
  const open = useUiStore((s) => s.askAiOpen)
  const setOpen = useUiStore((s) => s.setAskAiOpen)
  const { pathname } = useLocation()
  const [loaded, setLoaded] = useState(open)
  /** Bumped on every open, so a panel that failed to load is tried again. */
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoaded(true)
    setAttempt((n) => n + 1)
  }, [open])

  // A link inside the panel (a template, the plan history) or a tab change closes it; the AI tab never shows it.
  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  if (!loaded) return null
  return (
    <>
      <LoadBoundary
        fallback={null}
        resetKey={attempt}
        onError={() => {
          setOpen(false)
          setFailed(true)
        }}
      >
        <Suspense fallback={null}>
          <AskAiPanel open={open && pathname !== '/ai'} onClose={() => setOpen(false)} />
        </Suspense>
      </LoadBoundary>
      <Snackbar
        open={failed}
        autoHideDuration={5000}
        onClose={() => setFailed(false)}
        message="Ask AI couldn’t open. Reload the app once you’re online."
        data-testid="ask-ai-load-failed"
      />
    </>
  )
}
