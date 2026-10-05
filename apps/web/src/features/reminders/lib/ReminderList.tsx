// Owns: the list of reminder kinds — each with an on/off switch and, for clock reminders (weigh-in, workout, scan due),
// a time between 07:00 and 21:55 saved when the field is left. Every change saves at once (one PATCH /api/settings).
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { DEFAULT_REMINDER_PREFS, type Reminder, type ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { EARLIEST_TIME, hasTime, inWakingHours, KINDS, LATEST_TIME, type KindCopy } from './kinds'

interface RowProps {
  copy: KindCopy
  value: Reminder
  help: string
  disabled: boolean
  onSave: (kind: ReminderKind, next: Reminder) => void
}

function TimeField({ copy, value, disabled, onSave }: Omit<RowProps, 'help'>) {
  const [draft, setDraft] = useState(value.time ?? '')
  const valid = /^\d{2}:\d{2}$/.test(draft) && inWakingHours(draft)
  const commit = () => {
    if (valid && draft !== value.time) onSave(copy.kind, { ...value, time: draft })
  }
  return (
    <TextField
      type="time"
      label={`${copy.label} time`}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      error={draft !== '' && !valid}
      helperText={draft !== '' && !valid ? `Between ${EARLIEST_TIME} and ${LATEST_TIME}` : undefined}
      slotProps={{ htmlInput: { min: EARLIEST_TIME, max: LATEST_TIME, step: 300, 'data-testid': `reminder-${copy.kind}-time` } }}
      sx={{ mt: 2, width: 180 }}
    />
  )
}

function ReminderRow({ copy, value, help, disabled, onSave }: RowProps) {
  return (
    <Box sx={{ px: 4, py: 3 }} data-testid={`reminder-${copy.kind}`}>
      <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 3, cursor: disabled ? 'default' : 'pointer', minHeight: 44 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, lineHeight: 1.35 }}>{copy.label}</Box>
          <Box sx={{ mt: 0.5, fontSize: tokens.font.size.label, color: tokens.ink.secondary, lineHeight: 1.4 }}>{help}</Box>
        </Box>
        <Switch
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => onSave(copy.kind, { ...value, enabled: e.target.checked })}
          slotProps={{ input: { 'aria-label': copy.label, 'data-testid': `reminder-${copy.kind}-switch` } as object }}
        />
      </Box>
      {hasTime(copy.kind) && value.enabled && (
        <TimeField key={value.time ?? ''} copy={copy} value={value} disabled={disabled} onSave={onSave} />
      )}
    </Box>
  )
}

export function ReminderList({
  prefs,
  fastHours,
  scanIntervalDays,
  disabled,
  onSave,
}: {
  prefs: ReminderPrefs
  fastHours: number
  scanIntervalDays: number
  disabled: boolean
  onSave: (kind: ReminderKind, next: Reminder) => void
}) {
  return (
    <Card sx={{ '& > *:not(:last-child)': { borderBottom: `1px solid ${tokens.ink.border}` } }}>
      {KINDS.map((copy) => (
        <ReminderRow
          key={copy.kind}
          copy={copy}
          // A clock reminder stored without a time fires at its default (the Worker does the same).
          value={{ ...prefs[copy.kind], time: prefs[copy.kind].time ?? DEFAULT_REMINDER_PREFS[copy.kind].time }}
          help={copy.help({ fastHours, scanIntervalDays })}
          disabled={disabled}
          onSave={onSave}
        />
      ))}
    </Card>
  )
}
