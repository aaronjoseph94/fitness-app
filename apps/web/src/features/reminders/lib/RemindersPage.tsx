// Owns: the Reminders page (/settings/reminders, SPEC §8 "Reminders") — notifications on this device, then each
// reminder kind on/off with its time, and the quiet hours. Needs a connection to change anything.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { REMINDER_HOURS, type Reminder, type ReminderKind } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, signInAgain } from '../../../api'
import { SectionHeader } from '../../../components'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
import { DeviceCard } from './DeviceCard'
import { KINDS } from './kinds'
import { ReminderList } from './ReminderList'
import { usePushDevice } from './usePushDevice'
import { useReminderPrefs } from './useReminderPrefs'

const saveError = (error: unknown) => problemText(error, 'Reminder changes need a connection.')

export function RemindersPage() {
  const online = useOnline()
  const device = usePushDevice()
  const { query, prefs, fastHours, scanIntervalDays, saving, save } = useReminderPrefs()
  const [notice, setNotice] = useState<string | null>(null)

  const onSave = (kind: ReminderKind, next: Reminder) => {
    const label = KINDS.find((k) => k.kind === kind)?.label ?? kind
    save(kind, next).then(
      () => setNotice(next.enabled ? `${label}: on${next.time ? ` at ${next.time}` : ''}.` : `${label}: off.`),
      (e: unknown) => setNotice(saveError(e)),
    )
  }

  return (
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="reminders-page" sx={{ pb: 4 }}>
      {!online && (
        <Alert severity="info" data-testid="reminders-offline">
          You’re offline. These are the last saved reminders; changes need a connection.
        </Alert>
      )}

      <DeviceCard device={device} online={online} onDone={setNotice} />

      <Box component="section" aria-labelledby="reminder-kinds-title">
        <SectionHeader
          id="reminder-kinds"
          title="Reminders"
          subtitle={`Edmonton time. Quiet from ${REMINDER_HOURS.to} to ${REMINDER_HOURS.from}: nothing is sent overnight.`}
        />
        {prefs && fastHours !== undefined && scanIntervalDays !== undefined ? (
          <ReminderList prefs={prefs} fastHours={fastHours} scanIntervalDays={scanIntervalDays} disabled={!online || saving} onSave={onSave} />
        ) : query.isPending && query.fetchStatus !== 'paused' ? (
          <Skeleton variant="rounded" height={420} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        ) : (
          <Alert
            severity="error"
            data-testid="reminders-error"
            action={
              query.error?.kind === 'auth-expired' ? (
                <Button color="inherit" onClick={signInAgain}>
                  Sign in again
                </Button>
              ) : (
                <Button color="inherit" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              )
            }
          >
            {query.fetchStatus === 'paused' || query.error?.kind === 'network'
              ? 'You’re offline and reminders haven’t been loaded on this phone yet.'
              : `Couldn’t load reminders. ${query.error?.message ?? ''}`}
          </Alert>
        )}
      </Box>

      <Snackbar open={notice !== null} autoHideDuration={3500} onClose={() => setNotice(null)} message={notice} />
    </Stack>
  )
}
