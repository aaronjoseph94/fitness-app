// Owns: the weigh-in form — one number prefilled with that day's weigh-in or the last one, ±0.1 kg nudges, the date
// (today by default), an optional note — saved with POST /api/weights, which replaces any weigh-in on that date. An
// out-of-range weight or a future date says what is wrong in words, not only in red.
import AddRounded from '@mui/icons-material/AddRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { useEffect, useId, useState } from 'react'
import { formatNumber, NumberField, parseNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { todayLocal } from './dates'
import { useLastWeight } from './reads'
import { noticeFor, type LogNotice } from './ui'
import { useLogMutation } from './writes'
import { problemText } from '../../../api'

const MIN_KG = 30
const MAX_KG = 300

export function WeighInForm({ date: initialDate, onLogged }: { date: string; onLogged: (notice: LogNotice) => void }) {
  const today = todayLocal()
  const [date, setDate] = useState(initialDate)
  const { last, onDate, isLoading } = useLastWeight(date)
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const save = useLogMutation(endpoints.body.createWeight)

  // Prefill once the last weigh-in is known, unless Aaron has started typing.
  const prefill = (onDate ?? last)?.kg
  useEffect(() => {
    if (!touched && prefill !== undefined) setText(prefill.toFixed(1))
  }, [prefill, touched])

  const kg = parseNumber(text)
  const valid = kg !== null && kg >= MIN_KG && kg <= MAX_KG && date <= today
  const weightProblem =
    text.trim() === '' ? null : kg === null ? 'Enter a number, e.g. 92.4' : kg < MIN_KG || kg > MAX_KG ? `Enter a weight between ${MIN_KG} and ${MAX_KG} kg` : null
  const showWeightProblem = touched && weightProblem !== null
  const dateProblem = date > today ? 'Pick today or an earlier day' : null
  const weightHelpId = useId()

  const nudge = (delta: number) => {
    const base = kg ?? prefill ?? 0
    if (!base) return
    setTouched(true)
    setText((Math.round((base + delta) * 10) / 10).toFixed(1))
  }

  const submit = () => {
    if (!valid || kg === null) return
    const weight = Math.round(kg * 10) / 10
    save.mutate(
      { body: { id: crypto.randomUUID(), date, weight_kg: weight, note: note.trim() || undefined } },
      { onSuccess: (outcome) => onLogged(noticeFor(outcome, `Weigh-in ${formatNumber(weight, 1)} kg on ${date}`)) },
    )
  }

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      sx={{ display: 'grid', gap: 4 }}
      data-testid="weigh-in-form"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton aria-label="Minus 0.1 kg" onClick={() => nudge(-0.1)} sx={{ border: 1, borderColor: 'divider' }}>
          <RemoveRounded />
        </IconButton>
        <NumberField
          label="Weight"
          value={text}
          onChange={(v) => {
            setTouched(true)
            setText(v)
          }}
          unit="kg"
          autoFocus
          error={showWeightProblem}
          slotProps={{
            htmlInput: {
              'aria-label': 'Weight in kg',
              'aria-describedby': showWeightProblem ? weightHelpId : undefined,
              style: { fontSize: 32, fontWeight: tokens.font.weight.number, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
            },
          }}
        />
        <IconButton aria-label="Plus 0.1 kg" onClick={() => nudge(0.1)} sx={{ border: 1, borderColor: 'divider' }}>
          <AddRounded />
        </IconButton>
      </Box>
      {/* Under the whole row (not inside the field) so the ± buttons stay level with the number. */}
      {showWeightProblem && (
        <FormHelperText id={weightHelpId} error sx={{ mt: -2, mx: 0, textAlign: 'center' }} data-testid="weigh-in-problem">
          {weightProblem}
        </FormHelperText>
      )}

      <Box sx={{ minHeight: 20, fontSize: tokens.font.size.label, color: 'text.secondary', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {isLoading && !last ? (
          'Looking up your last weigh-in…'
        ) : onDate ? (
          <>
            Logged {formatNumber(onDate.kg, 1)} kg for {date}; saving replaces it.
            {onDate.pending && <PendingBadge />}
          </>
        ) : last ? (
          <>
            Last {formatNumber(last.kg, 1)} kg on {last.date}
            {last.trendKg !== null && ` · trend ${formatNumber(last.trendKg, 1)} kg`}
            {last.pending && <PendingBadge />}
          </>
        ) : (
          'Your first weigh-in. Morning, after the bathroom, is the steadiest.'
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 2, alignItems: 'center' }}>
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          error={dateProblem !== null}
          helperText={dateProblem ?? undefined}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
        />
        {!noteOpen && (
          <Button variant="text" onClick={() => setNoteOpen(true)}>
            Add note
          </Button>
        )}
      </Box>
      {noteOpen && (
        <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      )}

      {save.isError && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small }}>
          {problemText(save.error)}
        </Box>
      )}
      <Button type="submit" variant="contained" size="large" disabled={!valid || save.isPending} data-testid="weigh-in-save">
        {save.isPending ? 'Saving…' : kg !== null && valid ? `Save ${formatNumber(kg, 1)} kg` : 'Save weigh-in'}
      </Button>
    </Box>
  )
}
