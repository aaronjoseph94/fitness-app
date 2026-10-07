// Owns: the Settings page — the rails (set with the doctor and dietitian; each edit asks for confirmation), daily
// targets (fibre, water), training days, the auto-apply preference, the link to the AI page (model keys and the Claude
// connector), every profile field (goal, start, height, sex, birth date, time zone — all editable), links to other
// pages, and "About this data". Reads GET /api/settings; every change is one PATCH /api/settings, shown at once and
// rolled back if the Worker refuses. Needs a connection.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import type { Settings, Weekday } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, signInAgain } from '../../api'
import { useOnline } from '../../offline'
import { tokens } from '../../theme'
import { AboutData } from './lib/AboutData'
import { EditDialog } from './lib/EditDialog'
import {
  formatDays,
  formatProfileValue,
  formatValue,
  PROFILE_FIELDS,
  profilePatch,
  RAIL_FIELDS,
  SCAN_FIELD,
  TARGET_FIELDS,
  type NumberField,
  type ProfileField,
} from './lib/fields'
import { ProfileDialog, type ProfileValue } from './lib/ProfileDialog'
import { LinkRow, SettingsGroup, SwitchRow, ValueRow } from './lib/rows'
import { TrainingDaysDialog } from './lib/TrainingDaysDialog'
import { useSettings, useUpdateSettings, type SettingsChange } from './lib/useSettings'

type Editing = { kind: 'number'; field: NumberField } | { kind: 'profile'; field: ProfileField } | { kind: 'training-days' } | { kind: 'auto-apply' } | null

const saveError = (error: unknown) => problemText(error, 'Settings changes need a connection.')

export function SettingsPage() {
  const query = useSettings()
  const update = useUpdateSettings()
  const online = useOnline()
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // A read paused offline without data is not loading: it falls through to the offline message.
  if (query.isPending && query.fetchStatus !== 'paused')
    return (
      <Stack spacing={4} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={160} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        ))}
      </Stack>
    )
  if (!query.data)
    return (
      <Alert
        severity="error"
        data-testid="settings-error"
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
          ? 'You’re offline and settings haven’t been loaded on this phone yet.'
          : `Couldn't load settings. ${problemText(query.error)}`}
      </Alert>
    )

  const { profile, settings } = query.data
  const locked = !online || update.isPending
  const close = () => {
    setEditing(null)
    setError(null)
  }
  const save = async (change: SettingsChange, done: string) => {
    setError(null)
    try {
      await update.save(change)
      setEditing(null)
      setNotice(done)
    } catch (e) {
      setError(saveError(e))
    }
  }
  /** A profile edit goes through the same PATCH, so it behaves exactly like a settings edit. */
  const saveProfile = async (field: ProfileField, value: ProfileValue, done: string) => {
    setError(null)
    try {
      await update.saveProfile(profilePatch(field, value))
      setEditing(null)
      setNotice(done)
    } catch (e) {
      setError(saveError(e))
    }
  }
  /** Switches save at once; a refusal flips them back and says why. */
  const toggle = (change: SettingsChange, done: string) => {
    update.save(change).then(
      () => setNotice(done),
      (e: unknown) => setNotice(saveError(e)),
    )
  }
  const numberRow = (field: NumberField) => (
    <ValueRow
      key={field.key}
      label={field.label}
      help={field.help}
      value={formatValue(field, settings[field.key])}
      onClick={() => setEditing({ kind: 'number', field })}
      disabled={locked}
      testId={`setting-${field.key}`}
    />
  )

  return (
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="settings-page" sx={{ pb: 4 }}>
      {!online && (
        <Alert severity="info" data-testid="settings-offline">
          You’re offline. These are the last saved settings; changes need a connection.
        </Alert>
      )}

      <SettingsGroup id="rails" title="Rails" subtitle="Set with your doctor and dietitian; the AI works inside them.">
        {RAIL_FIELDS.map(numberRow)}
      </SettingsGroup>

      <SettingsGroup id="targets" title="Daily targets">
        {TARGET_FIELDS.map(numberRow)}
      </SettingsGroup>

      <SettingsGroup id="training" title="Training and scans">
        <ValueRow
          label="Training days"
          value={formatDays(settings.training_days)}
          onClick={() => setEditing({ kind: 'training-days' })}
          disabled={locked}
          testId="setting-training_days"
        />
        {numberRow(SCAN_FIELD)}
      </SettingsGroup>

      <SettingsGroup id="app" title="App">
        <SwitchRow
          label="Apply safe AI changes"
          help="Meal suggestions, exercise swaps within the same muscle, and reminder times. Target changes always wait for a tap."
          checked={settings.auto_apply_safe}
          disabled={locked}
          onChange={(on) => (on ? setEditing({ kind: 'auto-apply' }) : toggle({ auto_apply_safe: false }, 'Every AI change waits for a tap.'))}
          testId="setting-auto_apply_safe"
        />
      </SettingsGroup>

      <SettingsGroup id="ai" title="AI">
        <LinkRow label="Model keys and the Claude connector" to="/settings/ai" />
      </SettingsGroup>

      <SettingsGroup id="profile" title="Profile">
        {PROFILE_FIELDS.map((field) => (
          <ValueRow
            key={field.key}
            label={field.label}
            value={formatProfileValue(field, profile)}
            onClick={() => setEditing({ kind: 'profile', field })}
            disabled={locked}
            testId={`profile-${field.key}`}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup id="more" title="More">
        <LinkRow label="Plan history" to="/plan" />
        <LinkRow label="Reminders" to="/settings/reminders" />
        <LinkRow label="Scans" to="/scans" />
        <LinkRow label="Apple Watch import" to="/imports/health" />
        <LinkRow label="Progress photos" to="/photos" />
        <LinkRow label="Export and restore" to="/settings/data" />
      </SettingsGroup>

      <AboutData timezone={profile.timezone} />

      {editing?.kind === 'number' && (
        <EditDialog
          key={editing.field.key}
          field={editing.field}
          settings={settings}
          saving={update.isPending}
          error={error}
          onClose={close}
          onSave={(value) =>
            void save({ [editing.field.key]: value } as Partial<Settings>, `${editing.field.label} set to ${formatValue(editing.field, value)}.`)
          }
        />
      )}
      {editing?.kind === 'profile' && (
        <ProfileDialog
          key={editing.field.key}
          field={editing.field}
          profile={profile}
          saving={update.isPending}
          error={error}
          onClose={close}
          onSave={(value) => void saveProfile(editing.field, value, `${editing.field.label} updated.`)}
        />
      )}
      {editing?.kind === 'training-days' && (
        <TrainingDaysDialog
          days={settings.training_days}
          saving={update.isPending}
          error={error}
          onClose={close}
          onSave={(days: Weekday[]) => void save({ training_days: days }, `Training days: ${formatDays(days)}.`)}
        />
      )}
      {editing?.kind === 'auto-apply' && (
        <Dialog open onClose={update.isPending ? undefined : close} fullWidth maxWidth="xs" aria-labelledby="auto-apply-title">
          <DialogTitle id="auto-apply-title">Apply safe AI changes?</DialogTitle>
          <DialogContent>
            <Box sx={{ fontSize: tokens.font.size.emphasis, lineHeight: 1.55 }}>
              Meal suggestions, exercise swaps within the same muscle and reminder times will apply without a tap. Target
              changes still wait for you, and every change can be reverted in one tap.
            </Box>
            {error && (
              <Box role="alert" sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
                {error}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 6, pb: 4 }}>
            <Button onClick={close} disabled={update.isPending}>
              Keep tapping
            </Button>
            <Button
              variant="contained"
              disabled={update.isPending}
              onClick={() => void save({ auto_apply_safe: true }, 'Safe AI changes now apply on their own.')}
            >
              {update.isPending ? 'Saving…' : 'Turn on'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Snackbar open={notice !== null} autoHideDuration={3000} onClose={() => setNotice(null)} message={notice} />
    </Stack>
  )
}
