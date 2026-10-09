// Owns: the shell's banners — the expired Access session ("Sign in again", queued entries are kept), a new build waiting
// to be taken ("Reload"), and queued entries the Worker refused (shown until dismissed, so nothing is lost silently) —
// as 2a's banners (the themed Alert), at the top of the content column.
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { signInAgain, useAuthExpired } from '../../../api'
import { dismissRejectedWrite, useRejectedWrites } from '../../../offline'
import { tokens } from '../../../theme'
import { reloadForUpdate, useUpdateReady } from '../pwa'
import { shellColumnSx } from './layout'

const loggedAt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export function StatusBanners() {
  const authExpired = useAuthExpired()
  const updateReady = useUpdateReady()
  const rejected = useRejectedWrites()
  if (!authExpired && !updateReady && rejected.length === 0) return null
  return (
    <Stack
      spacing={2}
      sx={{
        ...shellColumnSx,
        pt: { xs: `${tokens.space(4)}px`, md: `${tokens.layout.mainPadding.top}px` },
        displayPrint: 'none',
      }}
    >
      {authExpired && (
        <Alert
          severity="warning"
          data-testid="auth-expired-banner"
          action={
            <Button color="inherit" size="small" onClick={signInAgain}>
              Sign in again
            </Button>
          }
        >
          Your sign-in expired. Anything you log stays on this device until you sign in.
        </Alert>
      )}
      {rejected.map((write) => (
        <Alert key={write.id} severity="error" onClose={() => void dismissRejectedWrite(write.id)}>
          An entry from {loggedAt.format(new Date(write.created_at))} was not saved:{' '}
          {write.last_error ?? `HTTP ${write.status}`}
        </Alert>
      ))}
      {updateReady && (
        <Alert
          severity="info"
          data-testid="update-ready-banner"
          action={
            <Button color="inherit" size="small" onClick={reloadForUpdate}>
              Reload
            </Button>
          }
        >
          A new version of the app is ready.
        </Alert>
      )}
    </Stack>
  )
}
