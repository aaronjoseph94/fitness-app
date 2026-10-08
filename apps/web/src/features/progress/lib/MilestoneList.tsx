// Owns: the Progress milestones list (2a) — one 13 px row per milestone behind a hairline: a green check for one
// reached (with its date), a blue ring for the next weight milestone (kg still to go, forecast date), a grey ring for
// a composition milestone still ahead (measured by "scan" or "tape", with today's waist-to-hip ratio). The plan's
// start opens the list as the first row reached. The chart kit's MilestoneTimeline draws the same data as a line;
// 2a's Progress lists it instead.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import Box from '@mui/material/Box'
import type { LocalDate } from '@fitness/shared/schemas'
import { formatNumber, formatShortDate, visuallyHidden } from '../../../components'
import { tokens } from '../../../theme'
import type { MilestoneItem } from './series'

const MARK = 18

interface MilestoneListProps {
  items: readonly MilestoneItem[]
  /** The plan's start date and weight, shown as the first row reached. */
  start: { date: LocalDate; kg: number } | null
  /** The latest waist-to-hip ratio from the tape, for the WHR milestone's caption. */
  whrNow: number | null
}

function Mark({ state }: { state: MilestoneItem['state'] }) {
  if (state === 'done') return <CheckCircleRounded aria-hidden sx={{ fontSize: MARK, color: tokens.tone.success.solid, flex: 'none' }} />
  const next = state === 'next'
  return (
    <Box
      aria-hidden
      sx={{
        width: MARK,
        height: MARK,
        flex: 'none',
        borderRadius: '50%',
        boxSizing: 'border-box',
        border: next ? `2px solid ${tokens.accent.main}` : `1.5px solid ${tokens.ink.dashed}`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {next && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.accent.main }} />}
    </Box>
  )
}

const STATE_TEXT = { done: 'Reached', next: 'Next', later: 'Not reached yet' } as const

function Row({ state, label, detail, when }: { state: MilestoneItem['state']; label: string; detail?: string; when: string }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        py: '9px',
        borderTop: `1px solid ${tokens.ink.hairline}`,
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
      }}
    >
      <Mark state={state} />
      <Box sx={{ flex: 1, minWidth: 0, color: state === 'later' ? tokens.ink.label : tokens.ink.text }}>
        <Box component="span" sx={visuallyHidden}>
          {STATE_TEXT[state]}:{' '}
        </Box>
        {label}
        {detail && (
          <Box component="span" sx={{ color: tokens.ink.secondary }}>
            {' '}
            · {detail}
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 'none', color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{when}</Box>
    </Box>
  )
}

export function MilestoneList({ items, start, whrNow }: MilestoneListProps) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {start && <Row state="done" label={`Plan started · ${formatNumber(start.kg, 1)} kg`} when={formatShortDate(start.date)} />}
      {items.map((m) => (
        <Row
          key={m.label}
          state={m.state}
          label={m.label}
          detail={m.awayKg !== null && m.awayKg > 0 ? `${formatNumber(m.awayKg, 1)} kg away` : undefined}
          when={
            m.reachedOn
              ? formatShortDate(m.reachedOn)
              : m.source === 'weight'
                ? m.expectedOn
                  ? `forecast ${formatShortDate(m.expectedOn)}`
                  : ''
                : m.source === 'tape' && whrNow !== null
                  ? `tape · now ${formatNumber(whrNow, 2)}`
                  : m.source
          }
        />
      ))}
    </Box>
  )
}
