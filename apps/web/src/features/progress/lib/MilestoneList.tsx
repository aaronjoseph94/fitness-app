// Owns: the Progress camps list on the deep sky (1d "Camps on the way") — one 15 px row per weight milestone behind a
// white hairline, opened by base camp: a 28 px mark (done: a gold disc with a deep-ink check; the next camp: a white
// dot in a gold glow with a ring that pings — still under reduced motion; later camps: a white ring), "Camp 1 · 90 kg"
// and on the right its date (reached, or forecast), the next camp's in gold with the kilograms still to go; the last
// camp is the summit, marked with a gold flag. The composition milestones (body fat, visceral level, the tape's
// waist-to-hip ratio, a segment) follow as small wells, each saying what measures it.
import CheckRounded from '@mui/icons-material/CheckRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import type { LocalDate } from '@fitness/shared/schemas'
import { deepSkyRule, deepSkyWell, formatNumber, formatShortDate, visuallyHidden } from '../../../components'
import { copy } from '../../../copy'
import { tokens } from '../../../theme'
import type { MilestoneItem } from './series'

const { summit } = tokens
const MARK = 28

const ping = keyframes`
  0% { transform: scale(1); opacity: .9; }
  80%, 100% { transform: scale(1.8); opacity: 0; }
`

interface MilestoneListProps {
  items: readonly MilestoneItem[]
  /** The plan's start date and weight: base camp, the first row. */
  start: { date: LocalDate; kg: number } | null
  /** The goal weight: the camp at it is the summit. */
  goalKg: number
  /** The latest waist-to-hip ratio from the tape, for the WHR milestone's note. */
  whrNow: number | null
}

type Kind = 'done' | 'next' | 'later' | 'summit'

function Mark({ kind, reached }: { kind: Kind; reached: boolean }) {
  if (kind === 'summit')
    return (
      <Box sx={{ width: MARK, display: 'grid', placeItems: 'center', flex: 'none' }}>
        <FlagRounded aria-hidden sx={{ fontSize: 24, color: summit.gold.main }} />
      </Box>
    )
  if (kind === 'done' || reached)
    return (
      <Box
        aria-hidden
        sx={{
          width: MARK,
          height: MARK,
          flex: 'none',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: summit.gold.main,
          color: summit.ink.deep,
        }}
      >
        <CheckRounded sx={{ fontSize: 18 }} />
      </Box>
    )
  if (kind === 'next')
    return (
      <Box aria-hidden sx={{ position: 'relative', width: MARK, height: MARK, flex: 'none' }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `2px solid ${summit.gold.main}`,
            boxSizing: 'border-box',
            '@media (prefers-reduced-motion: no-preference)': {
              animation: `${ping} 2.4s ${tokens.motion.easing.out} infinite`,
            },
            '@media (prefers-reduced-motion: reduce)': { display: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            bgcolor: summit.deepSky.text,
            boxShadow: `0 0 16px ${summit.gold.main}`,
          }}
        />
      </Box>
    )
  return (
    <Box
      aria-hidden
      sx={{
        width: MARK,
        height: MARK,
        flex: 'none',
        borderRadius: '50%',
        border: `2px solid ${summit.onSky.disabled}`,
        boxSizing: 'border-box',
      }}
    />
  )
}

const STATE_TEXT: Record<Kind, string> = {
  done: 'Reached',
  next: 'Next',
  later: 'Ahead',
  summit: 'The goal',
}

function Row({
  kind,
  reached = false,
  label,
  when,
  highlight = false,
}: {
  kind: Kind
  reached?: boolean
  label: string
  when: string
  highlight?: boolean
}) {
  const strong = kind !== 'later' || reached
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        py: '9px',
        fontSize: tokens.font.size.emphasis,
        lineHeight: tokens.font.leading.small,
        minWidth: 0,
        '& + &': { borderTop: deepSkyRule },
      }}
    >
      <Mark kind={kind} reached={reached} />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          fontWeight: strong ? tokens.font.weight.heading : tokens.font.weight.label,
          color: strong ? summit.deepSky.text : summit.onSky.subtitle,
        }}
      >
        <Box component="span" sx={visuallyHidden}>
          {reached ? STATE_TEXT.done : STATE_TEXT[kind]}:{' '}
        </Box>
        {label}
      </Box>
      <Box
        sx={{
          flex: 'none',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.label,
          color: highlight ? summit.gold.main : summit.deepSky.muted,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {when}
      </Box>
    </Box>
  )
}

/** "Apr 9, 2027" outside `year`, "Nov 12" in it. */
const dated = (date: LocalDate, year: string) =>
  date.startsWith(year) ? formatShortDate(date) : `${formatShortDate(date)}, ${date.slice(0, 4)}`

export function MilestoneList({ items, start, goalKg, whrNow }: MilestoneListProps) {
  const weight = items.filter((m) => m.source === 'weight')
  const composition = items.filter((m) => m.source !== 'weight')
  const year = (start?.date ?? new Date().toISOString()).slice(0, 4)
  let camp = 0
  return (
    <>
      <Box
        component="ol"
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}
      >
        {start && (
          <Row kind="done" label={copy.startAt(formatNumber(start.kg, 1))} when={dated(start.date, year)} />
        )}
        {weight.map((m) => {
          const kg = formatNumber(m.kg, 0)
          const isSummit = m.kg !== null && Math.abs(m.kg - goalKg) < 0.05
          if (!isSummit) camp += 1
          const date = m.reachedOn ?? m.expectedOn
          const when = [
            date ? dated(date, year) : null,
            m.state === 'next' && m.awayKg !== null && m.awayKg > 0
              ? `${formatNumber(m.awayKg, 1)} kg to go`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <Row
              key={m.label}
              kind={isSummit ? 'summit' : m.state === 'done' ? 'done' : m.state}
              reached={m.state === 'done'}
              label={isSummit ? copy.goalAt(kg) : copy.milestoneAt(camp, kg)}
              when={when}
              highlight={m.state === 'next'}
            />
          )
        })}
      </Box>
      {composition.length > 0 && (
        <Box
          component="ul"
          aria-label="Body composition milestones"
          sx={{ listStyle: 'none', m: 0, mt: '14px', p: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}
        >
          {composition.map((m) => (
            <Box
              component="li"
              key={m.label}
              sx={{
                ...deepSkyWell,
                borderRadius: `${summit.radius.wellSmall}px`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                px: '10px',
                py: '6px',
                fontSize: tokens.font.size.caption,
                fontWeight: tokens.font.weight.label,
                color: summit.deepSky.text,
              }}
            >
              {m.state === 'done' ? (
                <CheckRounded aria-hidden sx={{ fontSize: 14, color: summit.gold.main }} />
              ) : (
                <Box
                  aria-hidden
                  sx={{
                    width: 10,
                    height: 10,
                    flex: 'none',
                    borderRadius: '50%',
                    boxSizing: 'border-box',
                    border: `1.5px solid ${summit.onSky.disabled}`,
                  }}
                />
              )}
              <Box component="span" sx={visuallyHidden}>
                {m.state === 'done' ? 'Reached' : 'Not reached yet'}:{' '}
              </Box>
              {m.label}
              <Box component="span" sx={{ color: summit.deepSky.muted }}>
                {m.reachedOn
                  ? formatShortDate(m.reachedOn)
                  : m.source === 'tape' && whrNow !== null
                    ? `tape, now ${formatNumber(whrNow, 2)}`
                    : m.source}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </>
  )
}
