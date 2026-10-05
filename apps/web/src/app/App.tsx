// Owns: the composition root — providers (MUI theme + CssBaseline, TanStack Query, the router) and the startup wiring
// that connects the offline queue to the API client and registers the service worker.
import CssBaseline from '@mui/material/CssBaseline'
import GlobalStyles from '@mui/material/GlobalStyles'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { apiQueryKey, clearSignInMarker, sendQueuedWrite } from '../api'
import { startOfflineSync } from '../offline'
import { theme } from '../theme'
import { registerServiceWorker } from './lib/pwa'
import { queryClient } from './lib/query-client'
import { appRouter } from './lib/routes'

/** Run once before the first render. */
export function startApp(): void {
  clearSignInMarker()
  startOfflineSync({
    send: sendQueuedWrite,
    // Queued writes reached the Worker: everything on screen may be stale.
    onSynced: () => void queryClient.invalidateQueries({ queryKey: apiQueryKey() }),
  })
  registerServiceWorker()
}

const globalStyles = {
  html: { WebkitTapHighlightColor: 'transparent', WebkitTextSizeAdjust: '100%' },
  // `clip` (not `hidden`) stops sideways scroll without breaking the sticky top bar.
  '#root': { minHeight: '100dvh', overflowX: 'clip' },
} as const

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={globalStyles} />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={appRouter()} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
