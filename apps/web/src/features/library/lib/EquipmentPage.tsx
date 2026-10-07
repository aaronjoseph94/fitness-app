// Owns: the equipment profile screen (/train/equipment, SPEC §7) — every library equipment value and each named
// machine with have / don't have / dislike / can't use and an optional note, saved per tap with PUT /api/equipment
// (queued offline, shown at once), and "Add machine". The machines are his gym's floor, grouped by area (EQUIPMENT_AREAS):
// the machines he has under their part of the gym, then "Not at your gym" — the machines his club lacks, whose absence
// is what takes their exercises out of the allowed set. A status change reshapes that set, so the library refreshes.
import AddRounded from '@mui/icons-material/AddRounded'
import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { endpoints } from '@fitness/shared/api'
import { EQUIPMENT_AREAS, EquipmentStatus } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { problemText, useApiMutation, useApiQuery } from '../../../api'
import { LoadProblem, PendingBadge, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'
import { equipmentLabel, isLibraryEquipment, LIBRARY_EQUIPMENT, MACHINE_SUGGESTIONS, sentence, STATUS_LABEL } from './labels'
import { useExerciseIndex, useRefreshLibrary } from './useExercises'

interface Row {
  equipment: string
  status: EquipmentStatus | null
  note: string | null
  /** Which part of the gym it is ("Hammer Strength"); null for a library value, an absence or his own machine. */
  area: string | null
  pending: boolean
}

const STATUS_COLOR: Record<EquipmentStatus, string> = {
  have: tokens.status.good,
  dont_have: tokens.ink.secondary,
  dislike: tokens.status.warning,
  cant_use: tokens.status.flag,
}

/** Have / Don't have / Dislike / Can't use as one segmented control; the chosen status takes its status colour. */
function StatusToggle({ value, onChange, label }: { value: EquipmentStatus | null; onChange: (status: EquipmentStatus) => void; label: string }) {
  return (
    <ToggleButtonGroup exclusive fullWidth size="small" value={value} onChange={(_, v: EquipmentStatus | null) => v && onChange(v)} aria-label={label}>
      {EquipmentStatus.options.map((s) => (
        <ToggleButton
          key={s}
          value={s}
          sx={{
            minHeight: tokens.tapTarget,
            fontSize: tokens.font.size.label,
            textTransform: 'none',
            whiteSpace: 'nowrap',
            px: 0.5,
            '&.Mui-selected, &.Mui-selected:hover': { color: tokens.ink.card, bgcolor: STATUS_COLOR[s] },
          }}
        >
          {STATUS_LABEL[s]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

function EquipmentRow({ row, count, onChange }: { row: Row; count?: number; onChange: (status: EquipmentStatus, note: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(row.note ?? '')
  const saveNote = () => {
    setEditing(false)
    const next = note.trim() || null
    if (next !== row.note) onChange(row.status ?? 'have', next)
  }
  return (
    <Box sx={{ py: 3, borderBottom: `1px solid ${tokens.ink.border}`, '&:last-of-type': { borderBottom: 'none' } }} data-testid="equipment-row">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label }}>
            {equipmentLabel(row.equipment)} {row.pending && <PendingBadge />}
          </Box>
          {count !== undefined && <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{count} exercises in the library</Box>}
        </Box>
        <IconButton aria-label={`Note for ${row.equipment}`} onClick={() => setEditing((v) => !v)} sx={{ color: row.note ? 'primary.main' : 'text.secondary' }}>
          <EditNoteRounded />
        </IconButton>
      </Box>
      <StatusToggle value={row.status} onChange={(v) => onChange(v, row.note)} label={`Status of ${row.equipment}`} />
      {editing ? (
        <TextField
          autoFocus
          size="small"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => e.key === 'Enter' && saveNote()}
          placeholder="e.g. left shoulder"
          sx={{ mt: 2 }}
          slotProps={{ htmlInput: { maxLength: 200, 'aria-label': `Note for ${row.equipment}`, enterKeyHint: 'done' } }}
        />
      ) : (
        row.note && <Box sx={{ mt: 1.5, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{row.note}</Box>
      )}
    </Box>
  )
}

function AddMachineDialog({ existing, onClose, onAdd }: { existing: ReadonlySet<string>; onClose: () => void; onAdd: (name: string, status: EquipmentStatus, note: string | null) => void }) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<EquipmentStatus>('have')
  const [note, setNote] = useState('')
  const key = name.trim().toLowerCase()
  const suggestions = MACHINE_SUGGESTIONS.filter((m) => !existing.has(m) && (!key || m.includes(key)))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="add-machine-title" slotProps={{ paper: { sx: { mx: 4, width: 'calc(100% - 32px)' } } }}>
      <DialogTitle id="add-machine-title">Add a machine</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <TextField autoFocus label="Machine" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. hack squat" slotProps={{ htmlInput: { maxLength: 100 } }} />
          {suggestions.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {suggestions.slice(0, 10).map((m) => (
                <Chip key={m} label={sentence(m)} variant="outlined" onClick={() => setName(m)} />
              ))}
            </Box>
          )}
          <StatusToggle value={status} onChange={setStatus} label="Status" />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
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
  const update = useApiMutation(endpoints.training.updateEquipment, { invalidates: [endpoints.training.getEquipment] })

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const e of index.all) if (e.equipment) c.set(e.equipment, (c.get(e.equipment) ?? 0) + 1)
    return c
  }, [index.all])

  /** Library values in the fixed order, then the machines: his areas in EQUIPMENT_AREAS order, then what the gym lacks. */
  const rows = useMemo(() => {
    const byName = new Map<string, Row>()
    for (const name of LIBRARY_EQUIPMENT) byName.set(name, { equipment: name, status: null, note: null, area: null, pending: false })
    for (const item of profile.data ?? [])
      byName.set(item.equipment, { equipment: item.equipment, status: item.status, note: item.note, area: item.area ?? null, pending: false })
    for (const [name, row] of Object.entries(local)) byName.set(name, row)
    const all = [...byName.values()]
    const machines = all.filter((r) => !isLibraryEquipment(r.equipment))
    const groups: { title: string; rows: Row[] }[] = []
    const add = (title: string, group: Row[]) => {
      const sorted = [...group].sort((a, b) => a.equipment.localeCompare(b.equipment))
      if (sorted.length) groups.push({ title, rows: sorted })
    }
    for (const area of EQUIPMENT_AREAS) add(area, machines.filter((r) => r.status === 'have' && r.area === area))
    add('Other', machines.filter((r) => r.status === 'have' && !(EQUIPMENT_AREAS as readonly string[]).includes(r.area ?? '')))
    add('Not at your gym', machines.filter((r) => r.status !== 'have'))
    return { library: LIBRARY_EQUIPMENT.map((n) => byName.get(n)!), groups, all }
  }, [profile.data, local])

  const set = (equipment: string, status: EquipmentStatus, note: string | null) => {
    // The area is the seed's; the screen only changes the status, so PUT keeps whatever the profile already has.
    const area = rows.all.find((r) => r.equipment === equipment)?.area ?? null
    setLocal((l) => ({ ...l, [equipment]: { equipment, status, note, area, pending: true } }))
    update.mutate(
      { body: { items: [{ equipment, status, note }] } },
      {
        onSuccess: (outcome) => {
          setLocal((l) => ({ ...l, [equipment]: { equipment, status, note, area, pending: outcome.status === 'queued' } }))
          refresh(outcome)
          if (outcome.status === 'queued') setNotice('Saved on this phone · syncs when you’re back online')
        },
        onError: (error) => {
          setLocal((l) => {
            const { [equipment]: _, ...rest } = l
            return rest
          })
          setNotice(problemText(error))
        },
      },
    )
  }

  const existing = useMemo(() => new Set(rows.all.map((r) => r.equipment)), [rows])

  if (profile.isLoading)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
        <CircularProgress aria-label="Loading equipment" />
      </Box>
    )

  return (
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="equipment-page">
      {profile.error && !profile.data && <LoadProblem what="Your equipment profile" error={profile.error} onRetry={() => void profile.refetch()} />}
      <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5 }}>
        This is your gym. Don&apos;t have, dislike and can&apos;t use take exercises out of the allowed set: the library, the picker and every AI
        workout program only from it.
        {index.all.length > 0 && ` ${index.allowed.length} of ${index.all.length} exercises are allowed now.`}
      </Box>
      <Box>
        <SectionHeader title="Equipment" subtitle="Every equipment type in the library" />
        <Card sx={{ px: 4 }}>
          {rows.library.map((row) => (
            <EquipmentRow key={row.equipment} row={row} count={counts.get(row.equipment) ?? 0} onChange={(s, n) => set(row.equipment, s, n)} />
          ))}
        </Card>
      </Box>
      <Box>
        <SectionHeader
          title="Machines"
          subtitle="Every machine at your gym, by area"
          action={
            <Button startIcon={<AddRounded />} onClick={() => setAdding(true)} data-testid="add-machine">
              Add machine
            </Button>
          }
        />
        {rows.groups.length === 0 ? (
          <Card sx={{ px: 4 }}>
            <Box sx={{ py: 4, color: tokens.ink.secondary, fontSize: tokens.font.size.small }}>No named machines yet.</Box>
          </Card>
        ) : (
          <Stack spacing={5}>
            {rows.groups.map((group) => (
              <Box key={group.title} data-testid="equipment-area">
                <SectionHeader title={group.title} />
                <Card sx={{ px: 4 }}>
                  {group.rows.map((row) => (
                    <EquipmentRow key={row.equipment} row={row} onChange={(s, n) => set(row.equipment, s, n)} />
                  ))}
                </Card>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
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
      <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice ?? ''} />
    </Stack>
  )
}
