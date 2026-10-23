// Owns: the equipment profile screen (/train/equipment, SPEC §7) — every library equipment value and each named
// machine with have / don't have / dislike / can't use and an optional note, saved per tap with PUT /api/equipment
// (queued offline, shown at once), and "Add machine". The machines are his gym's floor, grouped by area (EQUIPMENT_AREAS):
// the machines at the gym under their part of it (whatever their status: one he dislikes or can't use is still
// there), then "Not at your gym" — the machines marked "Don't have". Any status but "Have" takes their exercises out
// of the allowed set. A status change reshapes that set, so the library refreshes, and a snackbar says how many
// exercises are allowed now with Undo (the previous status and note put back). A filter field narrows the rows by name
// or note; a note is edited in a labelled field with Save.
// 2a: the page's h1 with the allowed count, an "Equipment" card of rows and one card per area, each row a 14/500 name
// with a 12 px muted line (exercise count, note) and the status as a small segmented control tinted by status.
import AddRounded from '@mui/icons-material/AddRounded'
import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { endpoints } from '@fitness/shared/api'
import { EQUIPMENT_AREAS, EquipmentStatus } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { problemText, useApiMutation, useApiQuery } from '../../../api'
import {
  EmptyState,
  formatNumber,
  LoadProblem,
  PageHeader,
  Panel,
  PendingBadge,
  Reveal,
  SectionHeader,
  staggerDelay,
} from '../../../components'
import { tokens } from '../../../theme'
import {
  equipmentLabel,
  isLibraryEquipment,
  LIBRARY_EQUIPMENT,
  MACHINE_SUGGESTIONS,
  sentence,
  STATUS_LABEL,
} from './labels'
import { useExerciseIndex, useRefreshLibrary } from './useExercises'

/** The group of machines marked "Don't have" (after the areas). */
const NOT_AT_GYM = 'Not at your gym'

interface Row {
  equipment: string
  status: EquipmentStatus | null
  note: string | null
  /** Which part of the gym it is ("Hammer Strength"); null for a library value, an absence or his own machine. */
  area: string | null
  pending: boolean
}

/**
 * The selected segment wears its status: green "Have", amber "Dislike", red "Can't use", each ringed 1 px in its own
 * text colour (≥4.5:1 on its tint and on the track; the tint alone is 1.0:1 on the track and the theme's ink.control
 * ring 2.96:1 on the green — WCAG 1.4.11); "Don't have" stays neutral white with the theme's ring.
 */
const STATUS_SELECTED: Record<EquipmentStatus, { bgcolor: string; color: string; boxShadow?: string }> = {
  have: {
    bgcolor: tokens.tone.success.bg,
    color: tokens.tone.success.text,
    boxShadow: `inset 0 0 0 1px ${tokens.tone.success.text}`,
  },
  dont_have: { bgcolor: tokens.ink.card, color: tokens.ink.text },
  dislike: {
    bgcolor: tokens.tone.warning.bg,
    color: tokens.tone.warning.text,
    boxShadow: `inset 0 0 0 1px ${tokens.tone.warning.text}`,
  },
  cant_use: {
    bgcolor: tokens.tone.danger.bg,
    color: tokens.tone.danger.text,
    boxShadow: `inset 0 0 0 1px ${tokens.tone.danger.text}`,
  },
}

/**
 * Have / Don't have / Dislike / Can't use as one segmented control (the theme's 2a track); the chosen status takes its
 * tint. `stretch` fills the line with equal segments: always (a dialog), or only on a phone (a row, where it wraps under
 * the name; from `sm` up it keeps its natural width beside it).
 */
function StatusToggle({
  value,
  onChange,
  label,
  stretch,
}: {
  value: EquipmentStatus | null
  onChange: (status: EquipmentStatus) => void
  label: string
  stretch: 'always' | 'phone'
}) {
  const fill = stretch === 'always' ? 1 : { xs: 1, sm: 'none' }
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, v: EquipmentStatus | null) => v && onChange(v)}
      aria-label={label}
      sx={{ flex: fill, minWidth: 0 }}
    >
      {EquipmentStatus.options.map((s) => (
        <ToggleButton
          key={s}
          value={s}
          sx={{
            flex: fill,
            whiteSpace: 'nowrap',
            '&.Mui-selected, &.Mui-selected:hover': STATUS_SELECTED[s],
          }}
        >
          {STATUS_LABEL[s]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

/**
 * One 2a list row: name and its muted line on the left, the status control and the note button on the right. The DOM
 * runs name → control → note so Tab follows what you see; on a phone the control wraps to its own full-width line
 * under the name and its note button.
 */
function EquipmentRow({
  row,
  count,
  onChange,
}: {
  row: Row
  count?: number
  onChange: (status: EquipmentStatus, note: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(row.note ?? '')
  const saveNote = () => {
    setEditing(false)
    const next = note.trim() || null
    if (next !== row.note) onChange(row.status ?? 'have', next)
  }
  const cancelNote = () => {
    setEditing(false)
    setNote(row.note ?? '')
  }
  const help = [
    count !== undefined ? `${count} exercise${count === 1 ? '' : 's'} in the library` : null,
    row.note,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Box
      sx={{ px: `${tokens.pad.card.x}px`, py: '12px', borderTop: `1px solid ${tokens.ink.hairline}` }}
      data-testid="equipment-row"
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          alignItems: 'center',
          columnGap: '12px',
          rowGap: 2,
        }}
      >
        <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: tokens.font.size.body,
              fontWeight: tokens.font.weight.label,
              lineHeight: tokens.font.leading.label,
              color: tokens.ink.text,
            }}
          >
            {equipmentLabel(row.equipment)} {row.pending && <PendingBadge />}
          </Box>
          {help && (
            <Box
              sx={{
                mt: '2px',
                fontSize: tokens.font.size.caption,
                lineHeight: tokens.font.leading.caption,
                color: tokens.ink.secondary,
              }}
            >
              {help}
            </Box>
          )}
        </Box>
        <Box
          sx={{ order: { xs: 2, sm: 0 }, flex: { xs: '1 1 100%', sm: 'none' }, minWidth: 0, display: 'flex' }}
        >
          <StatusToggle
            value={row.status}
            onChange={(v) => onChange(v, row.note)}
            label={`Status of ${row.equipment}`}
            stretch="phone"
          />
        </Box>
        <IconButton
          size="small"
          aria-label={`Note for ${row.equipment}`}
          aria-expanded={editing}
          onClick={() => (editing ? cancelNote() : setEditing(true))}
          sx={{ color: row.note ? tokens.accent.main : tokens.ink.label }}
        >
          <EditNoteRounded sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      {editing && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <TextField
            autoFocus
            size="small"
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveNote()
              if (e.key === 'Escape') cancelNote()
            }}
            placeholder="e.g. left shoulder"
            sx={{ flex: '1 1 220px', minWidth: 0 }}
            slotProps={{
              htmlInput: { maxLength: 200, 'aria-label': `Note for ${row.equipment}`, enterKeyHint: 'done' },
            }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={cancelNote}>Cancel</Button>
            <Button variant="contained" onClick={saveNote} data-testid="save-note">
              Save
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}

function AddMachineDialog({
  existing,
  onClose,
  onAdd,
}: {
  existing: ReadonlySet<string>
  onClose: () => void
  onAdd: (name: string, status: EquipmentStatus, note: string | null) => void
}) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<EquipmentStatus>('have')
  const [note, setNote] = useState('')
  const key = name.trim().toLowerCase()
  const suggestions = MACHINE_SUGGESTIONS.filter((m) => !existing.has(m) && (!key || m.includes(key)))
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="add-machine-title"
      slotProps={{ paper: { sx: { mx: 4, width: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle id="add-machine-title">Add a machine</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <TextField
            autoFocus
            label="Machine"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. hack squat"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {suggestions.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {suggestions.slice(0, 10).map((m) => (
                <Chip key={m} label={sentence(m)} variant="outlined" onClick={() => setName(m)} />
              ))}
            </Box>
          )}
          <StatusToggle value={status} onChange={setStatus} label="Status" stretch="always" />
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {existing.has(key) && <Alert severity="info">Already in your profile; this updates it.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!key} onClick={() => onAdd(key, status, note.trim() || null)}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function EquipmentPage() {
  const profile = useApiQuery(endpoints.training.getEquipment, {})
  const index = useExerciseIndex()
  const refresh = useRefreshLibrary()
  const [local, setLocal] = useState<Record<string, Row>>({})
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /** The last status change, for the snackbar's live allowed count and its Undo (the row as it was). */
  const [changed, setChanged] = useState<{
    equipment: string
    status: EquipmentStatus
    before: { status: EquipmentStatus; note: string | null }
    undone: boolean
  } | null>(null)
  const [filter, setFilter] = useState('')
  const update = useApiMutation(endpoints.training.updateEquipment, {
    invalidates: [endpoints.training.getEquipment],
  })

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const e of index.all) if (e.equipment) c.set(e.equipment, (c.get(e.equipment) ?? 0) + 1)
    return c
  }, [index.all])

  /** Library values in the fixed order, then the machines: the areas in EQUIPMENT_AREAS order, then what the gym lacks. */
  const rows = useMemo(() => {
    const byName = new Map<string, Row>()
    for (const name of LIBRARY_EQUIPMENT)
      byName.set(name, { equipment: name, status: null, note: null, area: null, pending: false })
    for (const item of profile.data ?? [])
      byName.set(item.equipment, {
        equipment: item.equipment,
        status: item.status,
        note: item.note,
        area: item.area ?? null,
        pending: false,
      })
    for (const [name, row] of Object.entries(local)) byName.set(name, row)
    const all = [...byName.values()]
    const machines = all.filter((r) => !isLibraryEquipment(r.equipment))
    const groups: { title: string; rows: Row[] }[] = []
    const add = (title: string, group: Row[]) => {
      const sorted = [...group].sort((a, b) => a.equipment.localeCompare(b.equipment))
      if (sorted.length) groups.push({ title, rows: sorted })
    }
    // Only "Don't have" means the club lacks it; a machine he dislikes or can't use stays where it stands in the gym.
    const atGym = machines.filter((r) => r.status !== 'dont_have')
    for (const area of EQUIPMENT_AREAS)
      add(
        area,
        atGym.filter((r) => r.area === area),
      )
    add(
      'Other',
      atGym.filter((r) => !(EQUIPMENT_AREAS as readonly string[]).includes(r.area ?? '')),
    )
    add(
      NOT_AT_GYM,
      machines.filter((r) => r.status === 'dont_have'),
    )
    return { library: LIBRARY_EQUIPMENT.map((n) => byName.get(n)!), groups, all }
  }, [profile.data, local])

  const set = (equipment: string, status: EquipmentStatus, note: string | null, undo = false) => {
    // The area is the seed's; the screen only changes the status, so PUT keeps whatever the profile already has.
    const current = rows.all.find((r) => r.equipment === equipment)
    const area = current?.area ?? null
    // No profile row yet (a library value) counts as "Have": the allowed set treats it so.
    const before = { status: current?.status ?? 'have', note: current?.note ?? null }
    setLocal((l) => ({ ...l, [equipment]: { equipment, status, note, area, pending: true } }))
    update.mutate(
      { body: { items: [{ equipment, status, note }] } },
      {
        onSuccess: (outcome) => {
          setLocal((l) => ({
            ...l,
            [equipment]: { equipment, status, note, area, pending: outcome.status === 'queued' },
          }))
          refresh(outcome)
          if (outcome.status === 'queued') {
            setChanged(null)
            setNotice('Saved on this device · syncs when you’re back online')
          } else if (before.status !== status) {
            setNotice(null)
            setChanged({ equipment, status, before, undone: undo })
          } else setNotice('Note saved')
        },
        onError: (error) => {
          setLocal((l) => {
            const { [equipment]: _, ...rest } = l
            return rest
          })
          setChanged(null)
          setNotice(problemText(error))
        },
      },
    )
  }

  const existing = useMemo(() => new Set(rows.all.map((r) => r.equipment)), [rows])

  const query = filter.trim().toLowerCase()
  const matches = (r: Row) =>
    !query ||
    equipmentLabel(r.equipment).toLowerCase().includes(query) ||
    (r.note ?? '').toLowerCase().includes(query)
  const libraryShown = rows.library.filter(matches)
  const groupsShown = rows.groups
    .map((g) => ({ ...g, rows: g.rows.filter(matches) }))
    .filter((g) => g.rows.length > 0)

  const machineCount = rows.groups
    .filter((g) => g.title !== NOT_AT_GYM)
    .reduce((n, g) => n + g.rows.length, 0)
  // The title row stays while the profile loads (same element first in both returns, so it rises in only once).
  const header = (
    <PageHeader
      title="Equipment"
      subtitle={
        index.all.length > 0
          ? `${index.allowed.length} of ${index.all.length} exercises are allowed now${profile.data ? ` · ${machineCount} machine${machineCount === 1 ? '' : 's'} at your gym` : ''}`
          : 'What your gym has decides the allowed exercise set'
      }
    />
  )
  if (profile.isLoading)
    return (
      <Stack spacing={6}>
        {header}
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
          <CircularProgress aria-label="Loading equipment" />
        </Box>
      </Stack>
    )

  return (
    <Stack spacing={6} data-testid="equipment-page">
      {header}
      {profile.error && !profile.data && (
        <LoadProblem
          what="Your equipment profile"
          error={profile.error}
          onRetry={() => void profile.refetch()}
        />
      )}
      <TextField
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        label="Find equipment"
        placeholder="Machine, area note or brand"
        size="small"
        data-testid="equipment-filter"
        sx={{ maxWidth: 420 }}
        slotProps={{
          htmlInput: { enterKeyHint: 'search', type: 'search' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded aria-hidden sx={{ fontSize: 20, color: tokens.ink.label }} />
              </InputAdornment>
            ),
          },
        }}
      />
      {query && libraryShown.length === 0 && groupsShown.length === 0 && (
        <EmptyState title="Nothing matches" body={`No equipment or machine matches “${filter.trim()}”.`} />
      )}
      {/* 2a's entrance: after the title row, each band rises in reading order, a section's stagger apart. */}
      <Reveal delay={staggerDelay(1, tokens.motion.stagger.section)}>
        {(!query || libraryShown.length > 0) && (
          <Panel
            title="Equipment"
            description="Every equipment type in the library. Don’t have, dislike and can’t use take exercises out of the allowed set: the library, the picker and every AI workout program only from it."
            padding="none"
          >
            {libraryShown.map((row) => (
              <EquipmentRow
                key={row.equipment}
                row={row}
                count={counts.get(row.equipment) ?? 0}
                onChange={(s, n) => set(row.equipment, s, n)}
              />
            ))}
          </Panel>
        )}
      </Reveal>
      <Reveal delay={staggerDelay(2, tokens.motion.stagger.section)}>
        <SectionHeader
          title="Machines"
          subtitle="Every machine at your gym, by area"
          action={
            <Button
              size="small"
              startIcon={<AddRounded />}
              onClick={() => setAdding(true)}
              data-testid="add-machine"
            >
              Add machine
            </Button>
          }
        />
        {rows.groups.length === 0 ? (
          <EmptyState
            title="No named machines yet"
            body="Add the machines at your gym; the AI builds workouts from them."
          />
        ) : (
          <Stack spacing={4}>
            {groupsShown.map((group) => (
              <Panel
                key={group.title}
                title={group.title}
                description={
                  group.title === NOT_AT_GYM
                    ? 'Their exercises stay out of the allowed set'
                    : `${group.rows.length} machine${group.rows.length === 1 ? '' : 's'}`
                }
                padding="none"
                testId="equipment-area"
              >
                {group.rows.map((row) => (
                  <EquipmentRow key={row.equipment} row={row} onChange={(s, n) => set(row.equipment, s, n)} />
                ))}
              </Panel>
            ))}
          </Stack>
        )}
      </Reveal>
      {adding && (
        <AddMachineDialog
          existing={existing}
          onClose={() => setAdding(false)}
          onAdd={(name, status, note) => {
            setAdding(false)
            set(name, status, note)
          }}
        />
      )}
      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice ?? ''}
      />
      <Snackbar
        key={changed ? `${changed.equipment}-${changed.status}` : 'none'}
        open={changed !== null && notice === null}
        autoHideDuration={8000}
        onClose={(_, reason) => reason !== 'clickaway' && setChanged(null)}
        data-testid="equipment-changed"
        message={
          changed
            ? `${changed.undone ? 'Put back: ' : ''}${equipmentLabel(changed.equipment)} · ${STATUS_LABEL[changed.status]} · ${formatNumber(index.allowed.length)} exercises allowed now`
            : ''
        }
        action={
          changed && !changed.undone ? (
            <Button
              color="inherit"
              onClick={() => {
                const { equipment, before } = changed
                setChanged(null)
                set(equipment, before.status, before.note, true)
              }}
            >
              Undo
            </Button>
          ) : undefined
        }
      />
    </Stack>
  )
}
