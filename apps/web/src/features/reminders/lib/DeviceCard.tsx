// Owns: the "Notifications on this device" card — what this device can do (iOS needs the Home Screen app), the
// permission, and the buttons: Enable notifications (a tap, as iOS requires), Send a test, Turn off on this device.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import IosShareRounded from '@mui/icons-material/IosShareRounded'
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import type { ReactNode } from 'react'
import { Panel, StatusChip } from '../../../components'
import { tokens } from '../../../theme'
import { isIos } from './push-client'
import type { PushDevice } from './usePushDevice'

function InstallSteps() {
  return (
    <Box component="ol" data-testid="push-install-steps" sx={{ m: 0, pl: '18px', fontSize: tokens.font.size.small, lineHeight: 1.7, color: tokens.ink.text }}>
      <li>
        In Safari, tap Share <IosShareRounded aria-label="Share" sx={{ fontSize: tokens.font.size.body, verticalAlign: '-3px' }} />, then{' '}
        <b>Add to Home Screen</b>.
      </li>
      <li>Open Aaron’s Fitness from your Home Screen.</li>
      <li>Come back to Settings → Reminders and tap Enable notifications.</li>
    </Box>
  )
}

export function DeviceCard({ device, online, onDone }: { device: PushDevice; online: boolean; onDone: (message: string) => void }) {
  const { support, permission, subscribed, publicKey, busy } = device
  const act = (action: () => Promise<string>) => () => void action().then(onDone)

  // What this device can do, in the card's description; the body holds the status and the buttons.
  let description: ReactNode
  let body: ReactNode = null
  if (support === null || (support === 'ready' && publicKey === undefined)) {
    body = <Skeleton variant="rounded" height={36} />
  } else if (support === 'needs-install') {
    description = 'On iPhone and iPad, notifications only work in the app installed on the Home Screen, not in a Safari tab.'
    body = <InstallSteps />
  } else if (support === 'unsupported') {
    description = 'This browser can’t receive notifications. Use the app installed on your phone’s Home Screen.'
  } else if (support === 'no-worker') {
    description = 'Notifications need the installed app. This build runs without its service worker (development), so there is nothing to subscribe.'
  } else if (publicKey === null) {
    body = (
      <Alert severity="info" data-testid="push-not-configured">
        Push isn’t set up on the server yet: it needs the VAPID keys (see docs/DEPLOY.md, “Secrets”).
      </Alert>
    )
  } else if (permission === 'denied') {
    description = (
      <>
        Notifications are blocked for this app.{' '}
        {isIos() ? 'Turn them on in iPhone Settings → Notifications → Aaron’s Fitness.' : 'Allow them in this site’s settings in your browser, then reload.'}
      </>
    )
  } else if (subscribed) {
    description = 'Reminders arrive here even when the app is closed.'
    body = (
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <StatusChip tone="success" icon={CheckCircleRounded} label="On for this device" testId="push-on" />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" size="dense" disabled={busy || !online} onClick={act(device.test)} data-testid="push-test">
          Send a test
        </Button>
        <Button color="inherit" size="dense" disabled={busy || !online} onClick={act(device.disable)} data-testid="push-disable">
          Turn off on this device
        </Button>
      </Box>
    )
  } else {
    description = 'Reminders arrive as notifications on this device, even when the app is closed.'
    body = (
      <Button
        variant="contained"
        startIcon={<NotificationsActiveRounded />}
        disabled={busy || !online}
        onClick={act(device.enable)}
        data-testid="push-enable"
        sx={{ width: { xs: '100%', sm: 'auto' } }}
      >
        {busy ? 'Turning on…' : 'Enable notifications'}
      </Button>
    )
  }

  return (
    <Panel id="push-device" title="Notifications on this device" description={description} testId="reminders-device">
      {body}
    </Panel>
  )
}
