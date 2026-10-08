// Owns: the confirm form — every value of the scan editable, grouped like the Evolt sheet (body composition, water,
// fat, the segmental table, energy, scores), low-confidence and unread values highlighted for checking, the scan
// conditions (time of day, fasted, hours since training, hydration, same as baseline?), and Confirm. Used for a fresh
// extraction, for manual entry when reading failed, and for editing a confirmed scan.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import type { Scan, ScanDraft, ScanSegment } from '@fitness/shared/schemas'
import { useMemo, useState, type ReactNode } from 'react'
import { formatNumber, NumberField, Panel, Segmented } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { confidenceOf, GROUPS, LOW_CONFIDENCE, PROFILE_FIELDS, recordFrom, type FieldSpec, type FormErrors, type ScanForm, type TriState } from './form'
import { todayLocal } from '../../quick-log'
import { useConfirmScan } from './hooks'
import { SEGMENT_LABEL, SEGMENTS } from './series'
import { problemText } from '../../../api'

interface ReviewFormProps {
  scanId: string
  initial: ScanForm
  /** The extraction draft, for per-field confidence (null for manual entry and edits). */
  draft: ScanDraft | null
  mode: 'extracted' | 'manual' | 'edit'
  onConfirmed: (scan: Scan) => void
  onCancel?: () => void
}

function Section({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title} description={subtitle}>
      {children}
    </Panel>
  )
}

/** Two fields a row, as the sheet pairs them. */
const pairs = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 } as const

/** Highlight for a value: an error, "not read", or a low extraction confidence. */
function check(draft: ScanDraft | null, key: string, value: string, error: string | undefined): { helper?: string; tone?: 'warning' | 'error' } {
  if (error) return { helper: error, tone: 'error' }
  if (!draft) return {}
  const confidence = confidenceOf(draft, key)
  if (value.trim() === '') return { helper: 'Not read: enter it', tone: 'warning' }
  if (confidence !== null && confidence < LOW_CONFIDENCE) return { helper: `Check: ${formatNumber(confidence * 100)} % sure`, tone: 'warning' }
  return {}
}

/** A value to check (2a warning): amber border and a 3 px amber-tint ring, amber helper text. */
const warnSx = {
  '& .MuiOutlinedInput-root': { boxShadow: `0 0 0 ${tokens.focusRing.inputRing}px ${tokens.tone.warning.bg}` },
  '& .MuiOutlinedInput-notchedOutline, & .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.tone.warning.text },
  '& .MuiFormHelperText-root': { color: tokens.tone.warning.text },
}

const TRI_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Not sure' },
] as const satisfies readonly { value: TriState; label: string }[]

const TIMES_OF_DAY = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
] as const satisfies readonly { value: ScanForm['conditions']['time_of_day']; label: string }[]

function TriToggle({ label, value, onChange }: { label: string; value: TriState; onChange: (v: TriState) => void }) {
  return (
    <Box>
      <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.label, mb: 2 }}>{label}</Box>
      <Segmented<TriState> ariaLabel={label} value={value} onChange={onChange} options={TRI_OPTIONS} fullWidth />
    </Box>
  )
}

export function ReviewForm({ scanId, initial, draft, mode, onConfirmed, onCancel }: ReviewFormProps) {
  const [form, setForm] = useState<ScanForm>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const confirm = useConfirmScan()
  const lowCount = useMemo(
    () => (draft ? draft.confidence.filter((c) => c.confidence < LOW_CONFIDENCE).length : 0),
    [draft],
  )

  const setValue = (key: FieldSpec['key'], v: string) => setForm((f) => ({ ...f, values: { ...f.values, [key]: v } }))
  const setSegment = (s: ScanSegment, part: 'lean_kg' | 'fat_kg', v: string) =>
    setForm((f) => ({ ...f, segments: { ...f.segments, [s]: { ...f.segments[s], [part]: v } } }))
  const setCondition = <K extends keyof ScanForm['conditions']>(k: K, v: ScanForm['conditions'][K]) =>
    setForm((f) => ({ ...f, conditions: { ...f.conditions, [k]: v } }))

  const field = (spec: FieldSpec) => {
    const value = form.values[spec.key]
    const { helper, tone } = check(draft, spec.key, value, errors[spec.key])
    return (
      <NumberField
        key={spec.key}
        label={spec.label}
        value={value}
        onChange={(v) => setValue(spec.key, v)}
        unit={spec.unit}
        integer={spec.integer}
        size="small"
        error={tone === 'error'}
        helperText={helper}
        sx={tone === 'warning' ? warnSx : undefined}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': `scan-field-${spec.key}` } }}
      />
    )
  }

  const submit = () => {
    const result = recordFrom(form)
    if (!result.record) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    confirm.mutate({ params: { id: scanId }, body: { record: result.record } }, { onSuccess: (out) => out.status === 'saved' && onConfirmed(out.data) })
  }
  const errorCount = Object.keys(errors).length

  return (
    <Box
      component="form"
      noValidate
      data-testid="scan-review-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      // Compact (size="small") fields, but every input is a 44 px tap target on a touch screen.
      sx={{ display: 'grid', gap: 4, [COARSE_POINTER_QUERY]: { '& .MuiInputBase-root': { minHeight: tokens.tapTarget } } }}
    >
      {mode === 'extracted' && (
        <Alert severity={lowCount ? 'warning' : 'info'}>
          Read from the sheet and converted to kg. Check every value against the sheet
          {lowCount ? `; ${lowCount} ${lowCount === 1 ? 'value was' : 'values were'} hard to read and ${lowCount === 1 ? 'is' : 'are'} outlined.` : '.'}
        </Alert>
      )}
      {mode === 'manual' && <Alert severity="info">Enter the values from the sheet in kg (lb × 0.4536).</Alert>}

      <Section title="Scan" subtitle={`Evolt 360${form.source_units === 'lb' ? ', sheet printed in lb, shown here in kg' : ''}`}>
        <Box sx={pairs}>
          <TextField label="Date" type="date" size="small" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} error={!!errors.date} helperText={errors.date} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayLocal(new Date()) } }} />
          <TextField label="Time" type="time" size="small" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} error={!!errors.time} helperText={errors.time} slotProps={{ inputLabel: { shrink: true } }} />
          {PROFILE_FIELDS.map(field)}
          <TextField select label="Sex" size="small" value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value as ScanForm['sex'] }))}>
            <MenuItem value="male">Male</MenuItem>
            <MenuItem value="female">Female</MenuItem>
          </TextField>
        </Box>
      </Section>

      {GROUPS.slice(0, 3).map((g) => (
        <Section key={g.title} title={g.title}>
          <Box sx={pairs}>{g.fields.map(field)}</Box>
        </Section>
      ))}

      <Section title="Segments" subtitle="Lean and fat mass per segment, kg">
        <Box sx={{ display: 'grid', gridTemplateColumns: '84px repeat(2, minmax(0, 1fr))', gap: 3, alignItems: 'start' }} data-testid="scan-segments">
          {SEGMENTS.map((s) => (
            <Box key={s} sx={{ display: 'contents' }}>
              <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, pt: '10px' }}>{SEGMENT_LABEL[s]}</Box>
              {(['lean_kg', 'fat_kg'] as const).map((part) => {
                const key = `segments.${s}.${part}`
                const { helper, tone } = check(draft, key, form.segments[s][part], errors[key])
                return (
                  <NumberField
                    key={part}
                    label={part === 'lean_kg' ? 'Lean' : 'Fat'}
                    value={form.segments[s][part]}
                    onChange={(v) => setSegment(s, part, v)}
                    unit="kg"
                    size="small"
                    error={tone === 'error'}
                    helperText={helper}
                    sx={tone === 'warning' ? warnSx : undefined}
                    // The section says kg: no unit per field, so a value like 27.70 stays readable at 320 px. The
                    // accessible name carries the segment (the visible label is only "Lean" / "Fat").
                    slotProps={{
                      inputLabel: { shrink: true },
                      input: { endAdornment: null },
                      htmlInput: { 'aria-label': `${SEGMENT_LABEL[s]} ${part === 'lean_kg' ? 'lean' : 'fat'} mass, kg` },
                    }}
                  />
                )
              })}
            </Box>
          ))}
        </Box>
      </Section>

      {GROUPS.slice(3).map((g) => (
        <Section key={g.title} title={g.title}>
          <Box sx={pairs}>{g.fields.map(field)}</Box>
        </Section>
      ))}

      <Section title="Conditions" subtitle="Baseline: morning, fasted, no training the day before, normal hydration">
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Segmented<ScanForm['conditions']['time_of_day']>
            ariaLabel="Time of day"
            value={form.conditions.time_of_day}
            onChange={(v) => setCondition('time_of_day', v)}
            options={TIMES_OF_DAY}
            fullWidth
          />
          <TriToggle label="Fasted" value={form.conditions.fasted} onChange={(v) => setCondition('fasted', v)} />
          <NumberField
            label="Hours since last training"
            value={form.conditions.hours_since_training}
            onChange={(v) => setCondition('hours_since_training', v)}
            unit="h"
            size="small"
            error={!!errors['conditions.hours_since_training']}
            helperText={errors['conditions.hours_since_training']}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField label="Hydration" size="small" placeholder="e.g. normal, 500 ml before" value={form.conditions.hydration} onChange={(e) => setCondition('hydration', e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TriToggle label="Same conditions as the baseline?" value={form.conditions.matches_baseline} onChange={(v) => setCondition('matches_baseline', v)} />
          <TextField label="Notes" size="small" multiline minRows={2} value={form.conditions.notes} onChange={(e) => setCondition('notes', e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
        </Box>
      </Section>

      {(errorCount > 0 || confirm.error) && (
        <Alert severity="error">{confirm.error ? problemText(confirm.error) : `Fix ${errorCount} ${errorCount === 1 ? 'value' : 'values'} above.`}</Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button variant="outlined" onClick={onCancel} disabled={confirm.isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="contained" disabled={confirm.isPending} data-testid="scan-confirm">
          {confirm.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Confirm scan'}
        </Button>
      </Box>
    </Box>
  )
}
