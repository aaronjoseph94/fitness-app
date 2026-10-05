// Owns: the "Notifications on this device" card — what this device can do (iOS needs the Home Screen app), the
// permission, and the buttons: Enable notifications (a tap, as iOS requires), Send a test, Turn off on this device.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import IosShareRounded from '@mui/icons-material/IosShareRounded'
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import type { ReactNode } from 'react'
import { tokens } from '../../../theme'
import { isIos } from './push-client'
import type { PushDevice } from './usePushDevice'

function Help({ children }: { children: ReactNode }) {
  return <Box sx={{ mt: 1.5, fontSize: tokens.font.size.small, lineHeight: 1.55, color: tokens.ink.secondary }}>{children}</Box>
}

function InstallSteps() {
  return (
    <Box component="ol" data-testid="push-install-steps" sx={{ m: 0, mt: 2, pl: 5, fontSize: tokens.font.size.small, lineHeight: 1.7, color: tokens.ink.text }}>
      <li>
        In Safari, tap Share <IosShareRounded aria-label="Share" sx={{ fontSize: tokens.font.size.body, verticalAlign: '-3px' }} />, then{' '}
        <b>Add to Home Screen</b>.
      </li>
      <li>Open Fitness from your Home Screen.</li>
      <li>Come back to Settings → Reminders and tap Enable notifications.</li>
    </Box>
  )
}

export function DeviceCard({ device, online, onDone }: { device: PushDevice; online: boolean; onDone: (message: string) => void }) {
  const { support, permission, subscribed, publicKey, busy } = device
  const act = (action: () => Promise<string>) => () => void action().then(onDone)

  let body: ReactNode
  if (support === null || (support === 'ready' && publicKey === undefined)) {
    body = <Skeleton variant="rounded" height={44} sx={{ mt: 3 }} />
  } else if (support === 'needs-install') {
    body = (
      <>
        <Help>On iPhone and iPad, notifications only work in the app installed on the Home Screen, not in a Safari tab.</Help>
        <InstallSteps />
      </>
    )
  } else if (support === 'unsupported') {
    body = <Help>This browser can’t receive notifications. Use the app installed on your phone’s Home Screen.</Help>
  } else if (support === 'no-worker') {
    body = <Help>Notifications need the installed app. This build runs without its service worker (development), so there is nothing to subscribe.</Help>
  } else if (publicKey === null) {
    body = (
      <Alert severity="info" sx={{ mt: 3 }} data-testid="push-not-configured">
        Push isn’t set up on the server yet: it needs the VAPID keys (see docs/DEPLOY.md, “Secrets”).
      </Alert>
    )
  } else if (permission === 'denied') {
    body = (
      <Help>
        Notifications are blocked for this app.{' '}
        {isIos() ? 'Turn them on in iPhone Settings → Notifications → Fitness.' : 'Allow them in this site’s settings in your browser, then reload.'}
      </Help>
    )
  } else if (subscribed) {
    body = (
      <>
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label }} data-testid="push-on">
          <CheckCircleRounded sx={{ color: tokens.status.good, fontSize: 22 }} aria-hidden />
          On for this device
        </Box>
        <Stack direction="row" spacing={3} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 2 }}>
          <Button variant="outlined" disabled={busy || !online} onClick={act(device.test)} data-testid="push-test" sx={{ minHeight: 44 }}>
            Send a test
          </Button>
          <Button color="inherit" disabled={busy || !online} onClick={act(device.disable)} data-testid="push-disable" sx={{ minHeight: 44 }}>
            Turn off on this device
          </Button>
        </Stack>
      </>
    )
  } else {
    body = (
      <>
        <Help>Reminders arrive as notifications on this device, even when the app is closed.</Help>
        <Button
          variant="contained"
          fullWidth
          startIcon={<NotificationsActiveRounded />}
          disabled={busy || !online}
          onClick={act(device.enable)}
          data-testid="push-enable"
          sx={{ mt: 3, minHeight: 48 }}
        >
          {busy ? 'Turning on…' : 'Enable notifications'}
        </Button>
      </>
    )
  }

  return (
    <Card component="section" aria-labelledby="push-device-title" data-testid="reminders-device" sx={{ p: 4 }}>
      <Box component="h2" id="push-device-title" sx={{ m: 0, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}>
        Notifications on this device
      </Box>
      {body}
    </Card>
  )
}
