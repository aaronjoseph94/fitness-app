// Owns: Today's headline on the sky (1d README §5.1) — the page's h1 (the trend weight in Outfit 300 at the trend size,
// counting down from the start weight, and "kg"), and under it: "Trend weight · weighed in at …" (today's raw weigh-in,
// marked pending while it waits to sync; the 7-day change after it), the two pills (the change since base camp — teal
// when it is a loss — and kg to the summit in dark glass), the dark glass "Next camp" card (the camp's weight and date,
// a gold bar of the stretch from the camp passed last, kg there and to go at the forecast's weekly rate), and last the
// page's action (the gold "+ Log"), so it stays in the headline column, clear of the mountain at every width.
//
// Contrast on Today's sky (measured, theme.ts header): the pills and the card sit 50–80 % down the sky, where the
// light glass and white .75 drop under 4.5:1, so the summit pill takes the dark glass and the card's lines are white.
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import TrendingFlatRounded from '@mui/icons-material/TrendingFlatRounded'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import {
  CountUp,
  formatNumber,
  formatShortDate,
  formatSigned,
  GlassPill,
  PendingBadge,
  Reveal,
  skyControls,
  useEntrance,
} from '../../../components'
import { copy } from '../../../copy'
import { enterEasing, theme, tokens } from '../../../theme'
import type { Climb } from './climb'

const { summit, font } = tokens

/** Under this the change since base camp reads as flat. */
const FLAT_KG = 0.05

/** The trend number and "kg": the content of the page's h1. */
export function TrendTitle({ trendKg, startKg }: { trendKg: number | null; startKg: number | null }) {
  return (
    <Box
      component="span"
      data-testid="today-header"
      sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '12px', mt: '2px' }}
    >
      <Box
        component="span"
        data-testid="today-trend"
        sx={{
          fontFamily: font.display,
          fontSize: font.fluid.trend,
          fontWeight: font.weight.display,
          lineHeight: font.leading.trend,
          letterSpacing: font.em.hero,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {trendKg === null ? (
          '—'
        ) : (
          <CountUp value={trendKg} from={startKg ?? trendKg} precision={1} delay={400} />
        )}
      </Box>{' '}
      <Box
        component="span"
        sx={{
          fontFamily: font.display,
          fontSize: font.size.trendUnit,
          fontWeight: font.weight.display,
          lineHeight: 1,
        }}
      >
        kg
      </Box>
    </Box>
  )
}

export interface TrendFactsProps {
  climb: Climb | null
  /** Today's raw weigh-in (server or queued). */
  rawKg: number | null
  rawPending: boolean
  change7dKg: number | null
  /** The page's action under the card (the gold "+ Log"), in the hero's control look. */
  action?: ReactNode
}

/** The line under the number: what the number is, today's weigh-in, the 7-day change. */
function TrendLine({
  trendKg,
  rawKg,
  rawPending,
  change7dKg,
}: Omit<TrendFactsProps, 'climb' | 'action'> & { trendKg: number | null }) {
  if (trendKg === null) return <>Weigh in each morning: the trend smooths out the day-to-day swings.</>
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px' }}
    >
      <span>
        Trend weight ·{' '}
        {rawKg !== null ? `weighed in at ${formatNumber(rawKg, 1)} kg` : 'no weigh-in yet today'}
        {change7dKg !== null && (
          <>
            {' · '}
            <Box component="span" data-testid="today-change-7d" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatSigned(change7dKg, 1)} kg in 7 days
            </Box>
          </>
        )}
      </span>
      {rawPending && <PendingBadge />}
    </Box>
  )
}

/** The gold bar of the stretch to the next camp: grows from 0 on mount (in place under reduced motion). */
function CampBar({ ratio }: { ratio: number }) {
  const { entered, reduced } = useEntrance()
  return (
    <Box
      aria-hidden
      sx={{
        mt: '12px',
        height: 10,
        borderRadius: `${summit.radius.pill}px`,
        bgcolor: summit.glass.tile,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
          height: '100%',
          borderRadius: `${summit.radius.pill}px`,
          background: `linear-gradient(90deg, ${summit.gold.main}, ${summit.gold.deep})`,
          transformOrigin: 'left',
          transform: entered ? 'none' : 'scaleX(0)',
          transition: reduced ? 'none' : `transform ${tokens.motion.duration.grow}ms ${enterEasing()} 1000ms`,
        }}
      />
    </Box>
  )
}

/** The glass "Next camp" card: the camp, its date, how much of the stretch is done and what is left at what rate. */
function NextCampCard({ climb }: { climb: Climb }) {
  const next = climb.next
  if (!next) return null
  const kg = formatNumber(next.kg, next.kg % 1 === 0 ? 0 : 1)
  const title = next.summit ? copy.goalAt(kg) : copy.nextMilestoneAt(kg)
  const done = `${formatNumber(next.doneKg, 1)} of ${formatNumber(next.stretchKg, 1)} kg there`
  const toGo = `${formatNumber(next.toGoKg, 1)} kg to go`
  const rate = climb.rateKg !== null ? ` at ${formatNumber(climb.rateKg, 2)} kg a week` : ''
  return (
    <Box
      data-testid="today-next-camp"
      sx={{
        mt: '26px',
        px: '20px',
        py: '18px',
        width: 'min(420px, 100%)',
        boxSizing: 'border-box',
        borderRadius: `${summit.radius.small}px`,
        bgcolor: summit.glass.card,
        [theme.breakpoints.down('sm')]: { bgcolor: summit.glass.cardStrong },
        border: `1px solid ${summit.glass.cardBorder}`,
        backdropFilter: `blur(${summit.glass.cardBlur}px)`,
        color: summit.onSky.text,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <FlagRounded aria-hidden sx={{ fontSize: 22, color: summit.gold.main, flex: 'none' }} />
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: font.size.itemTitle,
            fontWeight: font.weight.heading,
            lineHeight: font.leading.itemTitle,
          }}
        >
          {title}
        </Box>
        {next.date && (
          <Box
            component="span"
            sx={{
              flex: 'none',
              fontSize: font.size.body,
              fontWeight: font.weight.body,
              color: summit.onSky.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatShortDate(next.date)}
          </Box>
        )}
      </Box>
      <CampBar ratio={next.stretchKg > 0 ? next.doneKg / next.stretchKg : 0} />
      <Box
        sx={{
          mt: '8px',
          fontSize: font.size.body,
          fontWeight: font.weight.body,
          lineHeight: font.leading.small,
          color: summit.onSky.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {done} · {toGo}
        {rate}
      </Box>
    </Box>
  )
}

/** Everything under the h1: the line, the pills, the next-camp card and the page's action. */
export function TrendFacts({ climb, rawKg, rawPending, change7dKg, action }: TrendFactsProps) {
  const trendKg = climb?.trendKg ?? null
  const since = climb && trendKg !== null ? trendKg - climb.startKg : null
  const flat = since === null || Math.abs(since) < FLAT_KG
  const toGo = climb && trendKg !== null ? Math.max(0, trendKg - climb.goalKg) : null
  return (
    <>
      <Box component="span" sx={{ display: 'block', fontWeight: font.weight.body }}>
        <TrendLine trendKg={trendKg} rawKg={rawKg} rawPending={rawPending} change7dKg={change7dKg} />
      </Box>
      {(since !== null || toGo !== null) && (
        <Reveal delay={760}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '10px', mt: '18px' }}>
            {since !== null && (
              <GlassPill
                tone={!flat && since < 0 ? 'teal' : 'glass'}
                icon={flat ? TrendingFlatRounded : since < 0 ? ArrowDownwardRounded : ArrowUpwardRounded}
                ariaLabel={`${formatSigned(since, 1)} kg ${copy.sinceStart}`}
                testId="today-since-start"
              >
                {formatNumber(Math.abs(since), 1)} kg {copy.sinceStart}
              </GlassPill>
            )}
            {toGo !== null && (
              <GlassPill tone="dark" testId="today-to-go">
                {copy.toGoal(formatNumber(toGo, 1))}
              </GlassPill>
            )}
          </Box>
        </Reveal>
      )}
      {climb?.next && (
        <Reveal delay={900}>
          <NextCampCard climb={climb} />
        </Reveal>
      )}
      {action && (
        <Reveal delay={1000}>
          <Box sx={{ ...skyControls, display: 'flex', flexWrap: 'wrap', gap: '10px', mt: '22px' }}>
            {action}
          </Box>
        </Reveal>
      )}
    </>
  )
}
