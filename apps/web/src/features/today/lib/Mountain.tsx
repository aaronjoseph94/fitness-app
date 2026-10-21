// Owns: Today's mountain in the sky (1d README §5.1) — the silhouette, the dotted route from base camp to the summit
// with a flag at each camp ("90 · Nov 12": its weight and the day it was reached or is forecast), the summit's flag
// and card ("Summit · 65 kg" over the forecast finish date), the gold stretch already climbed and the "You · 93.6"
// marker, all placed along the route by weight (./mountain-route). From 1,180 px of sky up it stands at the sky's
// bottom right beside the headline; below that it moves under the headline and scales,
//   scale = clamp((width − 24) / 850, 0.3, 1),   room under the headline = 560 × scale + 20 px
// (the hero row's own 20 px gap and the sky's 64 px foot are part of that room). It draws itself into the sky element
// (`[data-sky-hero]`) through a portal, so it can sit on the sky's foot whatever holds the page header; the slot it
// is given only reserves its room. Entrance: it rises, the route draws, the flags pop in turn and the marker last;
// the route's dashes march, the summit glows and the marker pings; under reduced motion the loops stop and the rest
// is simply there.
import FlagRounded from '@mui/icons-material/FlagRounded'
import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { memo, useId, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber, formatShortDate, Reveal, useEntrance } from '../../../components'
import { copy } from '../../../copy'
import { enterEasing, reducedEntrance, tokens, withAlpha } from '../../../theme'
import type { Climb } from './climb'
import {
  climbFraction,
  labelSide,
  MOUNTAIN_BOX,
  MOUNTAIN_PATHS,
  pointAt,
  ROUTE_LENGTH,
  ROUTE_PATH,
} from './mountain-route'

const { summit, font, layout } = tokens
const WHITE = tokens.ink.card

/** The mountain's inks (the mock's own: `summit.mountain`). */
const INK = summit.mountain

/** The sky width the mountain's own scale is read against (the mock's `(w − 24) / 850`). */
const SCALE_GUTTER = 24
const SCALE_SPAN = 850
const MIN_SCALE = 0.3
/** The mock's gap between the headline and the scaled mountain, and its inset from the sky's right edge. */
const HEADLINE_GAP = 20
const RIGHT_INSET = 30
/** The hero row's own gap between lines (PageHeader), already part of the room. */
const ROW_GAP = 20

/** The flag label's width estimate for placing it (12 px DM Sans 600 ≈ 7 px a character, plus its padding). */
const labelWidth = (text: string) => text.length * 7 + 18

const march = keyframes`
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -16; }
`
const glow = keyframes`
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
`
const ping = keyframes`
  0% { opacity: 0.9; transform: scale(1); }
  80%, 100% { opacity: 0; transform: scale(2.4); }
`
const loop = (name: ReturnType<typeof keyframes>, ms: number, timing = 'ease-in-out') => ({
  animation: `${name} ${ms}ms ${timing} infinite`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

/** A pop-in at `delay` ms (scale and fade; a cross-fade under reduced motion). */
function usePop(delay: number) {
  const { entered, reduced } = useEntrance()
  return {
    opacity: entered ? 1 : 0,
    transform: entered ? 'none' : 'scale(0.6)',
    transition: reduced
      ? 'none'
      : `opacity 600ms ${enterEasing()} ${delay}ms, transform 600ms ${enterEasing()} ${delay}ms`,
    animation: reducedEntrance(delay, reduced),
  }
}

/** A stroke that draws itself from 0 to `length` (of the route) over `duration` ms after `delay`. */
function useDraw(length: number, delay: number, duration: number) {
  const { entered, reduced } = useEntrance()
  return {
    strokeDasharray: `${length} ${ROUTE_LENGTH * 2}`,
    strokeDashoffset: entered ? 0 : length,
    transition: reduced ? 'none' : `stroke-dashoffset ${duration}ms ${enterEasing()} ${delay}ms`,
  }
}

/** A flag on the route: the pole, the gold flag and its label on the side that keeps clear of the route. */
function CampFlag({ fraction, text, delay }: { fraction: number; text: string; delay: number }) {
  const p = pointAt(fraction)
  const side = labelSide(fraction, labelWidth(text))
  const pop = usePop(delay)
  return (
    <Box sx={{ position: 'absolute', left: p.x, top: p.y, ...pop, transformOrigin: '0 0' }}>
      <Box sx={{ position: 'absolute', left: -1, bottom: 0, width: 2, height: 26, bgcolor: WHITE }} />
      <FlagRounded
        sx={{ position: 'absolute', left: 0, bottom: 12, fontSize: 20, color: summit.gold.main }}
      />
      <Box
        component="span"
        sx={{
          position: 'absolute',
          ...(side === 'right' ? { left: 22 } : { right: 8 }),
          bottom: 16,
          whiteSpace: 'nowrap',
          px: '9px',
          py: '3px',
          borderRadius: `${summit.radius.pill}px`,
          bgcolor: INK.label,
          color: WHITE,
          fontSize: font.size.caption,
          fontWeight: font.weight.heading,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {text}
      </Box>
    </Box>
  )
}

/** The summit: a glow, the white flag and the card naming the goal and the day the forecast reaches it. */
function SummitFlag({ goalKg, finish, delay }: { goalKg: number; finish: string | null; delay: number }) {
  const p = pointAt(1)
  const pop = usePop(delay)
  return (
    <Box sx={{ position: 'absolute', left: p.x, top: p.y, ...pop, transformOrigin: '0 0' }}>
      <Box
        sx={{
          position: 'absolute',
          left: -46,
          top: -46,
          width: 92,
          height: 92,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, ${withAlpha(summit.gold.main, 0.85)}, ${withAlpha(summit.gold.main, 0)})`,
          ...loop(glow, 3200),
        }}
      />
      <FlagRounded sx={{ position: 'absolute', left: -14, top: -30, fontSize: 30, color: WHITE }} />
      <Box
        sx={{
          position: 'absolute',
          left: 26,
          top: -34,
          whiteSpace: 'nowrap',
          px: '12px',
          py: '7px',
          borderRadius: `${summit.radius.wellSmall}px`,
          bgcolor: WHITE,
          color: summit.ink.deep,
          fontSize: font.size.small,
          fontWeight: font.weight.heading,
          lineHeight: font.leading.small,
          boxShadow: summit.shadow.marker,
        }}
      >
        {copy.goalAt(formatNumber(goalKg, 0))}
        {finish && (
          <Box
            data-testid="today-finish"
            sx={{ fontWeight: font.weight.body, color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatShortDate(finish)}, {finish.slice(0, 4)}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** "You · 93.6": a white dot with a gold halo where the trend is on the route, pinging, and its label above. */
function YouMarker({ fraction, kg, delay }: { fraction: number; kg: number; delay: number }) {
  const p = pointAt(fraction)
  const pop = usePop(delay)
  return (
    <Box sx={{ position: 'absolute', left: p.x, top: p.y, ...pop }}>
      <Box
        sx={{
          position: 'absolute',
          left: -9,
          top: -9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          bgcolor: WHITE,
          boxShadow: `0 0 0 4px ${withAlpha(summit.gold.main, 0.6)}, 0 0 22px ${summit.gold.main}`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: -9,
          top: -9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `2px solid ${WHITE}`,
          boxSizing: 'border-box',
          ...loop(ping, 2400, 'ease-out'),
        }}
      />
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: -30,
          top: -52,
          whiteSpace: 'nowrap',
          px: '11px',
          py: '6px',
          borderRadius: `${summit.radius.button}px`,
          bgcolor: WHITE,
          color: summit.ink.deep,
          fontSize: font.size.small,
          fontWeight: font.weight.heading,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {copy.youAt(formatNumber(kg, 1))}
      </Box>
    </Box>
  )
}

/**
 * The drawing at scale 1 (820 × 560): silhouette, route, climbed stretch, flags, summit, marker. Memoised on `climb`
 * (TodayPage memoises it), so a resize of the sky re-renders only the frame around it.
 */
const MountainArt = memo(function MountainArt({ climb }: { climb: Climb }) {
  const id = useId()
  const body = `${id}-body`
  const face = `${id}-face`
  const { startKg, goalKg, trendKg, camps, finish } = climb
  const climbed = trendKg === null ? 0 : climbFraction(trendKg, startKg, goalKg)
  const climbedLength = climbed * ROUTE_LENGTH
  const route = useDraw(ROUTE_LENGTH, 300, 1800)
  const gold = useDraw(climbedLength, 700, 1400)
  const { entered, reduced } = useEntrance()
  const camp = (kg: number, date: string | null) =>
    `${formatNumber(kg, kg % 1 === 0 ? 0 : 1)}${date ? ` · ${formatShortDate(date)}` : ''}`

  return (
    <>
      <svg
        viewBox={`0 0 ${MOUNTAIN_BOX.width} ${MOUNTAIN_BOX.height}`}
        width={MOUNTAIN_BOX.width}
        height={MOUNTAIN_BOX.height}
        focusable="false"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={INK.top} />
            <stop offset="0.55" stopColor={INK.mid} />
            <stop offset="1" stopColor={INK.foot} />
          </linearGradient>
          <linearGradient id={face} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={INK.face} stopOpacity={0} />
            <stop offset="1" stopColor={INK.face} stopOpacity={INK.faceOpacity} />
          </linearGradient>
        </defs>
        <path d={MOUNTAIN_PATHS.ridge} fill={INK.ridge} />
        <path d={MOUNTAIN_PATHS.body} fill={`url(#${body})`} />
        <path d={MOUNTAIN_PATHS.face} fill={`url(#${face})`} />
        <path
          d={MOUNTAIN_PATHS.gullies}
          fill="none"
          stroke={INK.gully}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Box
          component="path"
          d={ROUTE_PATH}
          fill="none"
          stroke={withAlpha(WHITE, 0.22)}
          strokeWidth={3}
          strokeLinecap="round"
          sx={route}
        />
        <Box
          component="path"
          d={ROUTE_PATH}
          fill="none"
          stroke={withAlpha(WHITE, 0.85)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="2 14"
          sx={{
            opacity: entered ? 1 : 0,
            transition: reduced ? 'none' : `opacity 600ms ${enterEasing()} 1600ms`,
            ...loop(march, 2000, 'linear'),
          }}
        />
        {climbedLength > 0 && (
          <>
            <Box
              component="path"
              d={ROUTE_PATH}
              fill="none"
              stroke={withAlpha(summit.gold.main, 0.35)}
              strokeWidth={14}
              strokeLinecap="round"
              sx={gold}
            />
            <Box
              component="path"
              d={ROUTE_PATH}
              fill="none"
              stroke={summit.gold.main}
              strokeWidth={5}
              strokeLinecap="round"
              sx={gold}
            />
          </>
        )}
        <path d={MOUNTAIN_PATHS.ground} fill={INK.ground} />
      </svg>
      {camps.map((c, i) => (
        <CampFlag
          key={`${i}-${c.kg}`}
          fraction={climbFraction(c.kg, startKg, goalKg)}
          text={camp(c.kg, c.date)}
          delay={1000 + i * 120}
        />
      ))}
      <SummitFlag goalKg={goalKg} finish={finish} delay={1000 + camps.length * 120} />
      {trendKg !== null && <YouMarker fraction={climbed} kg={trendKg} delay={1500} />}
    </>
  )
})

/** The mountain's accessible name: the route in words. */
function describe(climb: Climb): string {
  const camps = climb.camps.map(
    (c) =>
      `${formatNumber(c.kg, 1)} kg${c.date ? ` (${c.reached ? 'reached' : 'forecast'} ${formatShortDate(c.date)})` : ''}`,
  )
  return [
    `${copy.PlanLabel}: ${copy.startAt(formatNumber(climb.startKg, 1))}`,
    camps.length ? `${copy.milestonesLabel} at ${camps.join(', ')}` : null,
    `${copy.goalAt(formatNumber(climb.goalKg, 1))}${climb.finish ? ` (forecast ${formatShortDate(climb.finish)}, ${climb.finish.slice(0, 4)})` : ''}`,
    climb.trendKg !== null ? `you are at ${formatNumber(climb.trendKg, 1)} kg` : null,
  ]
    .filter(Boolean)
    .join('; ')
}

interface Sky {
  sky: HTMLElement | null
  width: number
}

/**
 * Reads the sky element the anchor landed in, and its width, as it resizes — again whenever the anchor element
 * changes. A resize that leaves the width as it was (the sky growing taller) keeps the same state, so nothing renders.
 */
function useSky(anchor: HTMLElement | null): Sky {
  const [state, setState] = useState<Sky>({ sky: null, width: 0 })
  useLayoutEffect(() => {
    const sky = anchor?.closest<HTMLElement>('[data-sky-hero]') ?? null
    if (!sky) return
    const read = () => {
      const width = sky.clientWidth
      setState((prev) => (prev.sky === sky && prev.width === width ? prev : { sky, width }))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(sky)
    return () => observer.disconnect()
  }, [anchor])
  return state
}

/**
 * The mountain for PageHeader's `extras`: under 1,180 px a full-width line of the hero row that holds its room (the
 * mountain itself is drawn on the sky's foot); from 1,180 px it takes no room. Nothing until the profile is known.
 */
export function HeroMountain({ climb }: { climb: Climb | null }): ReactNode {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const { sky, width } = useSky(anchor)
  const wide = width >= layout.todayMountain
  const scale = wide ? 1 : Math.min(1, Math.max(MIN_SCALE, (width - SCALE_GUTTER) / SCALE_SPAN))
  // The mock's room under the headline is 560 × scale + 20; the row gap and the sky's foot already give 20 + 64 of it.
  const room = MOUNTAIN_BOX.height * scale + HEADLINE_GAP - ROW_GAP - layout.hero.padBottom
  return (
    <>
      <Box
        ref={setAnchor}
        aria-hidden
        data-testid="today-mountain-room"
        sx={{
          display: !climb || !sky || wide ? 'none' : 'block',
          flex: '0 0 100%',
          height: Math.max(0, room),
          pointerEvents: 'none',
        }}
      />
      {climb &&
        sky &&
        createPortal(
          <Box
            role="img"
            aria-label={describe(climb)}
            data-testid="today-mountain"
            sx={{
              position: 'absolute',
              right: RIGHT_INSET * scale,
              bottom: 0,
              width: MOUNTAIN_BOX.width,
              height: MOUNTAIN_BOX.height,
              transform: scale === 1 ? 'none' : `scale(${scale})`,
              transformOrigin: 'right bottom',
              pointerEvents: 'none',
              color: WHITE,
              fontFamily: font.family,
              displayPrint: 'none',
            }}
          >
            <Reveal delay={150} sx={{ position: 'absolute', inset: 0 }}>
              <MountainArt climb={climb} />
            </Reveal>
          </Box>,
          sky,
        )}
    </>
  )
}
