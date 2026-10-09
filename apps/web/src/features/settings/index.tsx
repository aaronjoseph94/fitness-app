// Owns: the Settings page (2a) — a sticky section nav beside the cards: the rails (set with the doctor and dietitian;
// each edit asks for confirmation), daily targets (fibre, water), training days and the scan interval, the auto-apply
// preference with the links to the AI page (model keys and the Claude connector) and to Reminders, every profile field
// (goal, start, height, sex, birth date, time zone — all editable), links to other pages, and "About this data". Reads
// GET /api/settings; every change is one PATCH /api/settings, shown at once and rolled back if the Worker refuses.
// Needs a connection.
import AccessibilityNewOutlined from '@mui/icons-material/AccessibilityNewOutlined'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined'
import WatchOutlined from '@mui/icons-material/WatchOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import type { Settings, Weekday } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, signInAgain } from '../../api'
import { PageHeader, Reveal, staggerDelay, StatusChip } from '../../components'
import { useOnline } from '../../offline'
import { tokens } from '../../theme'
import { AboutData } from './lib/AboutData'
import { EditDialog } from './lib/EditDialog'
import {
  formatDays,
  formatProfileValue,
  formatValue,
  helpFor,
  PROFILE_FIELDS,
  profilePatch,
  RAIL_FIELDS,
  reminderSummary,
  SCAN_FIELD,
  TARGET_FIELDS,
  type NumberField,
  type ProfileField,
} from './lib/fields'
import { ProfileDialog, type ProfileValue } from './lib/ProfileDialog'
import { DayTiles, LinkRow, RowGrid, SettingsGroup, SwitchRow, ValueRow } from './lib/rows'
import { SectionNav, type NavSection } from './lib/SectionNav'
import { TrainingDaysDialog } from './lib/TrainingDaysDialog'
import { useSettings, useUpdateSettings, type SettingsChange } from './lib/useSettings'

type Editing = { kind: 'number'; field: NumberField } | { kind: 'profile'; field: ProfileField } | { kind: 'training-days' } | { kind: 'auto-apply' } | null

const saveError = (error: unknown) => problemText(error, 'Settings changes need a connection.')

/** The cards in page order, as the section nav lists them (each id is its card's element id). */
const SECTIONS: readonly NavSection[] = [
  { id: 'rails', label: 'Rails' },
  { id: 'targets', label: 'Daily targets' },
  { id: 'training', label: 'Training and scans' },
  { id: 'app', label: 'App and AI' },
  { id: 'profile', label: 'Profile' },
  { id: 'more', label: 'More' },
  { id: 'about', label: 'About this data' },
]

/** 2a: the title rises in at 150 ms, then the cards follow 90 ms apart from 300 ms. */
const cardDelay = (index: number) => staggerDelay(index, tokens.motion.stagger.section, 300)

/**
 * 2a: the section nav's column; the cards' column beside it is at most 820 px, its cards 24 px apart. Loading and the
 * failed read draw the same page (nav, then the column with the title first), so React keeps one page box and one
 * title when the data lands: nothing moves (no CLS) and the title fades in once.
 */
const NAV_WIDTH = 200
const pageSx = { display: 'grid', gridTemplateColumns: { md: `${NAV_WIDTH}px minmax(0, 1fr)` }, gap: '28px', alignItems: 'start', pb: { xs: 4, md: 0 } } as const
const columnSx = { display: 'grid', gap: `${tokens.rhythm.section}px`, maxWidth: tokens.layout.readingMax, minWidth: 0 } as const

export function SettingsPage() {
  const query = useSettings()
  const update = useUpdateSettings()
  const online = useOnline()
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const header = (
    <PageHeader
      title="Settings"
      subtitle="Every change saves at once and is rolled back if the server refuses. Rails ask for confirmation."
      delay={150}
    />
  )

  // A read paused offline without data is not loading: it falls through to the offline message.
  if (query.isPending && query.fetchStatus !== 'paused')
    return (
      <Box sx={pageSx} aria-busy="true">
        <SectionNav sections={SECTIONS} delay={150} />
        <Box sx={columnSx}>
          {header}
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={160} sx={{ borderRadius: `${tokens.radius.card}px` }} />
          ))}
        </Box>
      </Box>
    )
  if (!query.data) {
    // 2a: offline is the calm info banner, a failed read the warning banner (as QueryStateCard draws them).
    const offline = query.fetchStatus === 'paused' || query.error?.kind === 'network'
    return (
      <Box sx={pageSx}>
        <SectionNav sections={SECTIONS} delay={150} />
        <Box sx={columnSx}>
          {header}
          <Alert
            severity={offline ? 'info' : 'warning'}
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
            {offline ? 'You’re offline and settings haven’t been loaded on this device yet.' : `Couldn't load settings. ${problemText(query.error)}`}
          </Alert>
        </Box>
      </Box>
    )
  }

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
      help={helpFor(field, settings)}
      value={formatValue(field, settings[field.key])}
      onClick={() => setEditing({ kind: 'number', field })}
      disabled={locked}
      testId={`setting-${field.key}`}
    />
  )

  return (
    <Box data-testid="settings-page" sx={pageSx}>
      <SectionNav sections={SECTIONS} delay={150} />
      <Box sx={columnSx}>
        {header}
        {!online && (
          <Alert severity="info" data-testid="settings-offline">
            You’re offline. These are the last saved settings; changes need a connection.
          </Alert>
        )}

        <Reveal delay={cardDelay(0)}>
          <SettingsGroup
            id="rails"
            title="Rails"
            subtitle="Set with your doctor and dietitian; the AI works inside them and never changes them."
            actions={<StatusChip icon={LockOutlined} label="Confirm to edit" />}
          >
            {RAIL_FIELDS.map(numberRow)}
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(1)}>
          <SettingsGroup id="targets" title="Daily targets" subtitle="A change writes a new plan version and rebuilds today’s targets.">
            {TARGET_FIELDS.map(numberRow)}
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(2)}>
          <SettingsGroup id="training" title="Training and scans">
            <ValueRow
              label="Training days"
              value={<DayTiles days={settings.training_days} />}
              onClick={() => setEditing({ kind: 'training-days' })}
              disabled={locked}
              testId="setting-training_days"
            />
            {numberRow(SCAN_FIELD)}
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(3)}>
          <SettingsGroup id="app" title="App and AI">
            <SwitchRow
              label="Apply safe AI changes"
              help="Meal suggestions, exercise swaps within the same muscle, and reminder times. Target changes always wait for a tap."
              checked={settings.auto_apply_safe}
              disabled={locked}
              onChange={(on) => (on ? setEditing({ kind: 'auto-apply' }) : toggle({ auto_apply_safe: false }, 'Every AI change waits for a tap.'))}
              testId="setting-auto_apply_safe"
            />
            {/* The former "AI" group was this one row; 2a folds it into "App and AI", so the row keeps the group's id. */}
            <LinkRow
              label="Model keys and the Claude connector"
              help="Groq · OpenRouter · GLM · Gemini · MCP token for Claude"
              to="/settings/ai"
              testId="settings-ai"
            />
            <LinkRow label="Reminders" help={reminderSummary(settings.reminders)} to="/settings/reminders" />
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(4)}>
          <SettingsGroup id="profile" title="Profile" subtitle="The goal and the start weight drive the forecast and every milestone date.">
            <RowGrid>
              {PROFILE_FIELDS.map((field) => {
                const value = formatProfileValue(field, profile)
                return (
                  <ValueRow
                    key={field.key}
                    label={field.label}
                    value={profile[field.key] === null ? <Box component="span" sx={{ color: tokens.ink.muted }}>{value}</Box> : value}
                    onClick={() => setEditing({ kind: 'profile', field })}
                    disabled={locked}
                    testId={`profile-${field.key}`}
                  />
                )
              })}
            </RowGrid>
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(5)}>
          <SettingsGroup id="more" title="More">
            <RowGrid>
              <LinkRow icon={HistoryOutlined} label="Plan history" to="/plan" />
              <LinkRow icon={AccessibilityNewOutlined} label="Scans" to="/scans" />
              <LinkRow icon={WatchOutlined} label="Apple Watch import" to="/imports/health" />
              <LinkRow icon={PhotoLibraryOutlined} label="Progress photos" to="/photos" />
              <LinkRow icon={DownloadOutlined} label="Export and restore" to="/settings/data" />
            </RowGrid>
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(6)}>
          <AboutData timezone={profile.timezone} />
        </Reveal>
      </Box>

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
          <DialogActions>
            <Button variant="outlined" onClick={close} disabled={update.isPending}>
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
    </Box>
  )
}
