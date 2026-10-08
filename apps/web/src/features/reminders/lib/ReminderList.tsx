// Owns: the list of reminder kinds — each with an on/off switch and, for clock reminders (weigh-in, workout, scan due),
// a time between 07:00 and 21:55 saved when the field is left. Every change saves at once (one PATCH /api/settings).
import Box from '@mui/material/Box'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { DEFAULT_REMINDER_PREFS, type Reminder, type ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tabularNums } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
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
      size="small"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      error={draft !== '' && !valid}
      helperText={draft !== '' && !valid ? `Between ${EARLIEST_TIME} and ${LATEST_TIME}` : undefined}
      slotProps={{
        htmlInput: { 'aria-label': `${copy.label} time`, min: EARLIEST_TIME, max: LATEST_TIME, step: 300, 'data-testid': `reminder-${copy.kind}-time` },
        formHelperText: { sx: { mx: 0 } },
      }}
      // 156 px holds the "Between 07:00 and 21:55" error on one line; 44 px tall on a touch screen.
      sx={{ width: 156, ...tabularNums, [COARSE_POINTER_QUERY]: { '& .MuiInputBase-root': { minHeight: tokens.tapTarget } } }}
    />
  )
}

function ReminderRow({ copy, value, help, disabled, onSave }: RowProps) {
  const inputId = `reminder-${copy.kind}-input`
  const timed = hasTime(copy.kind) && value.enabled
  return (
    <Box
      data-testid={`reminder-${copy.kind}`}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) auto auto' },
        gridTemplateAreas: { xs: '"text switch" "time time"', sm: '"text time switch"' },
        alignItems: 'center',
        columnGap: '16px',
        rowGap: '8px',
        minHeight: tokens.tapTarget,
        px: `${tokens.pad.card.x}px`,
        py: '12px',
        borderTop: `1px solid ${tokens.ink.hairline}`,
      }}
    >
      {/* The label names the switch beside it, so a tap on the words toggles it too. */}
      <Box component="label" htmlFor={inputId} sx={{ gridArea: 'text', minWidth: 0, cursor: disabled ? 'default' : 'pointer' }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, lineHeight: tokens.font.leading.body, color: tokens.ink.text }}>{copy.label}</Box>
        <Box sx={{ mt: '1px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>{help}</Box>
      </Box>
      {/* The switch comes before the time in the DOM: on a phone it sits beside the label with the time below it, and
          the time only shows once the switch is on, so focus goes switch → time at every width (sm+ draws it last). */}
      <Box sx={{ gridArea: 'switch', justifySelf: 'end' }}>
        <Switch
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => onSave(copy.kind, { ...value, enabled: e.target.checked })}
          slotProps={{ input: { id: inputId, 'aria-label': copy.label, 'data-testid': `reminder-${copy.kind}-switch` } as object }}
        />
      </Box>
      {timed && (
        <Box sx={{ gridArea: 'time', justifySelf: { xs: 'start', sm: 'end' } }}>
          <TimeField key={value.time ?? ''} copy={copy} value={value} disabled={disabled} onSave={onSave} />
        </Box>
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
    <Box>
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
    </Box>
  )
}
