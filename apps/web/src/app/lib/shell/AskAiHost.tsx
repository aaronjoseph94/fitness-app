// Owns: hosting the Ask AI slide-up panel over every tab — loaded on first open (the chat code stays out of the first
// paint), open while useUiStore().askAiOpen, closed on navigation and never over the AI tab itself (that page is the chat).
import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { useUiStore } from '../../ui-store'

const AskAiPanel = lazy(() => import('../../../features/ai').then((m) => ({ default: m.AskAiPanel })))

export function AskAiHost() {
  const open = useUiStore((s) => s.askAiOpen)
  const setOpen = useUiStore((s) => s.setAskAiOpen)
  const { pathname } = useLocation()
  const [loaded, setLoaded] = useState(open)

  useEffect(() => {
    if (open) setLoaded(true)
  }, [open])

  // A link inside the panel (a template, the plan history) or a tab change closes it; the AI tab never shows it.
  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  if (!loaded) return null
  return (
    <Suspense fallback={null}>
      <AskAiPanel open={open && pathname !== '/ai'} onClose={() => setOpen(false)} />
    </Suspense>
  )
}
