// Owns: the Settings page (1d) — a compact sky hero, then the section nav card beside the cards (README §4: nav 220 px :
// cards, wrapping): the rails (set with the doctor and dietitian; each edit asks for confirmation), daily targets
// (fibre, water), training days and the scan interval (with the next scan's due date), the auto-apply preference with
// the links to the AI page (model keys and the Claude connector, with how many keys are set) and to Reminders, every
// profile field (goal, start, height, sex, birth date, time zone — all editable), links to other pages (Scans with its
// next due date), and the deep-sky "About this data". Reads GET /api/settings (and the key statuses and the scan
// schedule); every change is one PATCH /api/settings, shown at once and rolled back if the Worker refuses. Needs a
// connection.
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined'
import PieChartOutlined from '@mui/icons-material/PieChartOutlined'
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
import { formatNumber, formatShortDate, PageHeader, Reveal, staggerDelay, StatusChip } from '../../components'
import { copy } from '../../copy'
import { useOnline } from '../../offline'
import { metricTint, minWidth, tokens } from '../../theme'
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
import {
  Amount,
  DayTiles,
  LinkRow,
  RowGrid,
  SettingsGroup,
  SwitchRow,
  ValueRow,
  type IconTint,
} from './lib/rows'
import { SectionNav, type NavSection } from './lib/SectionNav'
import { TrainingDaysDialog } from './lib/TrainingDaysDialog'
import { useScanDue, useSettings, useUpdateSettings, type SettingsChange } from './lib/useSettings'
import { useModelChain } from './models'

type Editing =
  | { kind: 'number'; field: NumberField }
  | { kind: 'profile'; field: ProfileField }
  | { kind: 'training-days' }
  | { kind: 'auto-apply' }
  | null

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

/** 1d: the hero comes in first, then the cards follow 90 ms apart from 300 ms. */
const cardDelay = (index: number) => staggerDelay(index, tokens.motion.stagger.section, 300)

/**
 * README §4: the section nav (220 px) beside the cards (`100 1 280px`, at most 880 px), wrapping above them on a phone.
 * Loading and the failed read draw the same page (nav, then the column), so React keeps one page box when the data
 * lands: nothing moves (no CLS).
 */
const CARDS_MAX = 880
const pageSx = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '30px',
  alignItems: 'flex-start',
  minWidth: 0,
} as const
const columnSx = {
  flex: '100 1 280px',
  maxWidth: CARDS_MAX,
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '22px',
} as const

/** The More card's tiles: each destination in its own tint (1d). */
const TINT = {
  plan: { bg: tokens.accent.soft, fg: tokens.accent.deep },
  scans: { bg: tokens.tone.success.bg, fg: tokens.tone.success.text },
  watch: { bg: metricTint('sleep'), fg: tokens.metric.sleep },
  photos: { bg: tokens.tone.danger.bg, fg: tokens.tone.danger.text },
  data: { bg: tokens.tone.warning.bg, fg: tokens.tone.warning.text },
} as const satisfies Record<string, IconTint>

const NOTE =
  'Every change saves at once and is rolled back if the server refuses. Rails ask for confirmation.'
/**
 * 1d sets the hero's line right of the title, where it clears the sun disc only on a wide sky (from about 1,400 px);
 * narrower, it is the usual subtitle under the title, so it never sits on the disc.
 */
const NOTE_BESIDE = minWidth(1400)

/** The hero's line beside the title, in the slot a page's controls would take. */
function HeroNote() {
  return (
    <Box
      sx={{
        display: 'none',
        [NOTE_BESIDE]: { display: 'block' },
        maxWidth: 460,
        pb: '6px',
        textAlign: 'right',
        fontSize: tokens.font.size.emphasis,
        fontWeight: tokens.font.weight.body,
        lineHeight: tokens.font.leading.small,
        color: tokens.summit.onSky.subtitle,
      }}
    >
      {NOTE}
    </Box>
  )
}

/** "3 keys set" in teal, or a neutral "No keys yet", once the key statuses have loaded. */
function KeysChip() {
  const chain = useModelChain()
  if (!chain) return null
  return chain.keys > 0 ? (
    <StatusChip
      tone="success"
      dot
      label={`${formatNumber(chain.keys)} ${chain.keys === 1 ? 'key' : 'keys'} set`}
    />
  ) : (
    <StatusChip label="No keys yet" />
  )
}

export function SettingsPage() {
  const query = useSettings()
  const update = useUpdateSettings()
  const scanDue = useScanDue()
  const online = useOnline()
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The eyebrow keeps its line while the settings load (a non-breaking space), so the title never moves.
  const header = (
    <PageHeader
      variant="compact"
      eyebrow={query.data?.profile.timezone ?? '\u00a0'}
      title="Settings"
      subtitle={
        <Box component="span" sx={{ [NOTE_BESIDE]: { display: 'none' } }}>
          {NOTE}
        </Box>
      }
      action={<HeroNote />}
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
            <Skeleton
              key={i}
              variant="rounded"
              height={160}
              sx={{ borderRadius: `${tokens.radius.card}px` }}
            />
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
            {offline
              ? 'You’re offline and settings haven’t been loaded on this device yet.'
              : `Couldn't load settings. ${problemText(query.error)}`}
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
      help={helpFor(field, settings, scanDue)}
      value={<Amount text={formatValue(field, settings[field.key])} unit={field.unit} />}
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
            actions={<StatusChip tone="warning" icon={LockOutlined} label="Confirm to edit" />}
          >
            {RAIL_FIELDS.map(numberRow)}
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(1)}>
          <SettingsGroup
            id="targets"
            title="Daily targets"
            subtitle="A change writes a new plan version and rebuilds today’s targets."
          >
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
              wrapValue
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
              onChange={(on) =>
                on
                  ? setEditing({ kind: 'auto-apply' })
                  : toggle({ auto_apply_safe: false }, 'Every AI change waits for a tap.')
              }
              testId="setting-auto_apply_safe"
            />
            {/* The former "AI" group was this one row; 2a folds it into "App and AI", so the row keeps the group's id. */}
            <LinkRow
              label="Model keys and the Claude connector"
              help="Groq · OpenRouter · GLM · Gemini · MCP token for Claude"
              value={<KeysChip />}
              to="/settings/ai"
              testId="settings-ai"
            />
            <LinkRow label="Reminders" help={reminderSummary(settings.reminders)} to="/settings/reminders" />
          </SettingsGroup>
        </Reveal>

        <Reveal delay={cardDelay(4)}>
          <SettingsGroup
            id="profile"
            title="Profile"
            subtitle={`The ${copy.goalLabel} and ${copy.startLabel} drive the forecast and every ${copy.milestoneLabel} date.`}
          >
            <RowGrid>
              {PROFILE_FIELDS.map((field) => {
                const value = formatProfileValue(field, profile)
                return (
                  <ValueRow
                    key={field.key}
                    label={field.label}
                    value={
                      profile[field.key] === null ? (
                        <Box component="span" sx={{ color: tokens.ink.muted }}>
                          {value}
                        </Box>
                      ) : field.kind === 'number' ? (
                        <Amount text={value} unit={field.unit} />
                      ) : (
                        value
                      )
                    }
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
              <LinkRow icon={HistoryOutlined} iconTint={TINT.plan} label="Plan history" to="/plan" />
              <LinkRow
                icon={PieChartOutlined}
                iconTint={TINT.scans}
                label="Scans"
                note={scanDue ? `next ${formatShortDate(scanDue)}` : undefined}
                to="/scans"
              />
              <LinkRow
                icon={WatchOutlined}
                iconTint={TINT.watch}
                label="Apple Watch import"
                to="/imports/health"
              />
              <LinkRow
                icon={PhotoLibraryOutlined}
                iconTint={TINT.photos}
                label="Progress photos"
                to="/photos"
              />
              <LinkRow
                icon={DownloadOutlined}
                iconTint={TINT.data}
                label="Export and restore"
                to="/settings/data"
              />
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
            void save(
              { [editing.field.key]: value } as Partial<Settings>,
              `${editing.field.label} set to ${formatValue(editing.field, value)}.`,
            )
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
          onSave={(days: Weekday[]) =>
            void save({ training_days: days }, `Training days: ${formatDays(days)}.`)
          }
        />
      )}
      {editing?.kind === 'auto-apply' && (
        <Dialog
          open
          onClose={update.isPending ? undefined : close}
          fullWidth
          maxWidth="xs"
          aria-labelledby="auto-apply-title"
        >
          <DialogTitle id="auto-apply-title">Apply safe AI changes?</DialogTitle>
          <DialogContent>
            <Box sx={{ fontSize: tokens.font.size.emphasis, lineHeight: 1.55 }}>
              Meal suggestions, exercise swaps within the same muscle and reminder times will apply without a
              tap. Target changes still wait for you, and every change can be reverted in one tap.
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

      <Snackbar
        open={notice !== null}
        autoHideDuration={3000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </Box>
  )
}
