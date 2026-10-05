// Owns: the composition root — providers (MUI theme + CssBaseline, TanStack Query, the router) and the startup wiring
// that connects the offline queue to the API client and registers the service worker.
import CssBaseline from '@mui/material/CssBaseline'
import GlobalStyles from '@mui/material/GlobalStyles'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { apiQueryKey, clearSignInMarker, sendQueuedWrite } from '../api'
import { startOfflineSync } from '../offline'
import { REDUCED_MOTION_QUERY, theme, tokens } from '../theme'
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
  html: {
    WebkitTapHighlightColor: 'transparent',
    WebkitTextSizeAdjust: '100%',
    // A control scrolled into view by Tab clears the sticky top bar and the bottom nav + log button (WCAG 2.4.11).
    scrollPaddingTop: `calc(${tokens.layout.scrollPadding.top}px + env(safe-area-inset-top, 0px))`,
    scrollPaddingBottom: `calc(${tokens.layout.scrollPadding.bottom}px + env(safe-area-inset-bottom, 0px))`,
  },
  // `clip` (not `hidden`) stops sideways scroll without breaking the sticky top bar.
  '#root': { minHeight: '100dvh', overflowX: 'clip' },
  // Reduced motion (WCAG 2.3.3): transitions and animations end at once, no ripples, no smooth scrolling.
  [`@media ${REDUCED_MOTION_QUERY}`]: {
    '*, *::before, *::after': {
      animationDuration: '0.01ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '0.01ms !important',
      transitionDelay: '0s !important',
      scrollBehavior: 'auto !important',
    },
    '.MuiTouchRipple-root': { display: 'none' },
  },
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
