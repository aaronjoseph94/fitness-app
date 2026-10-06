// Owns: the token sections of the styleguide — every colour in `tokens` (name + hex + what it is for, with the
// measured WCAG contrast wherever text sits on it), the type scale, the 4 px spacing scale, radii and the tap target,
// the metric gradients, the depth scale and the motion system (durations, easing curves and a live entrance).
// Reads `tokens` directly, so a change in theme.ts shows here at once.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useState } from 'react'
import { Reveal } from '../../../components'
import { metricGradient, REDUCED_MOTION_QUERY, tokens, transitionOf, type MetricKey } from '../../../theme'
import { Caption, Grid, Panel, Section } from './layout'

interface Swatch {
  name: string
  hex: string
  /** What the colour is for, and its measured contrast where text sits on it. */
  note?: string
}

const entries = (o: Record<string, string>, prefix: string): Swatch[] =>
  Object.entries(o).map(([k, v]) => ({ name: `${prefix}.${k}`, hex: v }))

const GROUPS: { title: string; note: string; swatches: Swatch[] }[] = [
  {
    title: 'Ink',
    note: 'Text in two greys, hairline borders, white cards on a light grey canvas — surfaces are separated by depth, not by an outline.',
    swatches: entries(tokens.ink, 'ink'),
  },
  {
    title: 'Accent',
    note: 'The one action colour: coral. `main` carries white text; `bright` never does. Contrast figures are measured, not eyeballed.',
    swatches: [
      { name: 'accent.main', hex: tokens.accent.main, note: 'Buttons and the active state · white text on it: 5.18:1' },
      { name: 'accent.deep', hex: tokens.accent.deep, note: 'Hover and pressed of `main`. Nothing sits on top of it.' },
      { name: 'accent.bright', hex: tokens.accent.bright, note: 'Icons and accents only — never carries text.' },
      { name: 'accent.soft', hex: tokens.accent.soft, note: 'Tinted chip/background · `main` text on it: 4.67:1' },
    ],
  },
  {
    title: 'Metric',
    note: 'One colour per metric, identical in rings, charts, legends and the report.',
    swatches: entries(tokens.metric, 'metric'),
  },
  {
    title: 'Status',
    note: 'Good / warning / flag. Status only, never a metric.',
    swatches: entries(tokens.status, 'status'),
  },
  {
    title: 'Chart',
    note: 'Gridlines, dashed targets and axis text.',
    swatches: [
      { name: 'chart.grid', hex: tokens.chart.grid },
      { name: 'chart.target', hex: tokens.chart.target },
      { name: 'chart.axis', hex: tokens.chart.axis },
    ],
  },
  {
    title: 'Print',
    note: 'The printed report: black text on white, dark-grey secondary text and running header.',
    swatches: entries(tokens.print, 'print'),
  },
  {
    title: 'Muscle map',
    note: 'Grey body, white separations, four indigo steps.',
    swatches: [
      { name: 'muscleMap.body', hex: tokens.muscleMap.body },
      { name: 'muscleMap.stroke', hex: tokens.muscleMap.stroke },
      ...tokens.muscleMap.steps.map((hex, i) => ({ name: `muscleMap.steps[${i}]`, hex })),
    ],
  },
]

function SwatchTile({ name, hex, note }: Swatch) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          flex: 'none',
          borderRadius: `${tokens.radius.control}px`,
          bgcolor: hex,
          border: `1px solid ${tokens.ink.border}`,
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.text,
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {hex.toUpperCase()}
        </Box>
        {note && (
          <Box sx={{ mt: 0.5, fontSize: tokens.font.size.caption, color: tokens.ink.secondary, lineHeight: 1.4 }}>{note}</Box>
        )}
      </Box>
    </Box>
  )
}

export function ColourSection() {
  return (
    <Section
      id="colour"
      title="Colour"
      subtitle="Colour is reserved for data, plus one action colour for buttons and the active state. Everything else is ink on a card."
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        {GROUPS.map((g) => (
          <Panel key={g.title}>
            <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>{g.title}</Box>
            <Caption sx={{ mt: 0.5, mb: 4 }}>{g.note}</Caption>
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
              }}
            >
              {g.swatches.map((s) => (
                <SwatchTile key={s.name} {...s} />
              ))}
            </Box>
          </Panel>
        ))}
      </Box>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------

const { size, weight } = tokens.font
const TYPE: {
  name: string
  px: number
  w: number
  sample: string
  secondary?: boolean
  numeric?: boolean
}[] = [
  { name: 'Big number, large', px: size.bigNumberLarge, w: weight.number, sample: '91.4 kg', numeric: true },
  { name: 'Big number', px: size.bigNumber, w: weight.number, sample: '1,050', numeric: true },
  { name: 'Big number, small', px: size.bigNumberSmall, w: weight.number, sample: '26.4 kg', numeric: true },
  { name: 'h1', px: 28, w: weight.heading, sample: 'Today' },
  { name: 'h2', px: 24, w: weight.heading, sample: 'Progress' },
  { name: 'Section title', px: size.sectionTitle, w: weight.heading, sample: 'This week' },
  { name: 'Card title (cardTitle, h4)', px: size.cardTitle, w: weight.heading, sample: 'Raise protein to 140 g' },
  { name: 'Body (body)', px: size.body, w: weight.body, sample: 'Lunch is the first meal; breakfast stays hidden.' },
  { name: 'Emphasis (emphasis, button)', px: size.emphasis, w: weight.label, sample: 'Log weigh-in' },
  { name: 'Small (small, body2)', px: size.small, w: weight.body, sample: 'Trend down 0.8 kg this week.', secondary: true },
  { name: 'Label (label)', px: size.label, w: weight.label, sample: 'Calories remaining', secondary: true },
  { name: 'Caption (caption)', px: size.caption, w: weight.body, sample: 'Mon 5 Oct · 07:42', secondary: true },
]

export function TypeSection() {
  return (
    <Section
      id="type"
      title="Type"
      subtitle={`${tokens.font.family.split(',')[0]?.replace(/'/g, '')} · 400 body, 500 labels, 600 headings, 700 numbers`}
    >
      <Panel>
        {TYPE.map((t, i) => (
          <Box
            key={t.name}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              columnGap: 4,
              rowGap: 1,
              py: 3,
              borderTop: i ? `1px solid ${tokens.ink.border}` : 'none',
            }}
          >
            <Box sx={{ width: 150, flex: 'none' }}>
              <Box sx={{ fontSize: tokens.font.size.label, fontWeight: weight.label, color: tokens.ink.text }}>{t.name}</Box>
              <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
                {t.px} px · {t.w}
              </Box>
            </Box>
            <Box
              sx={{
                flex: '1 1 180px',
                minWidth: 0,
                fontSize: t.px,
                fontWeight: t.w,
                lineHeight: 1.25,
                color: t.secondary ? tokens.ink.secondary : tokens.ink.text,
                fontVariantNumeric: t.numeric ? 'tabular-nums' : undefined,
                overflowWrap: 'anywhere',
              }}
            >
              {t.sample}
            </Box>
          </Box>
        ))}
      </Panel>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------

const STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]

export function SpaceSection() {
  return (
    <Section id="space" title="Space, radius, touch" subtitle="4 px base scale · tokens.space(n)">
      <Grid min={320}>
        <Panel title="Spacing">
          <Box sx={{ display: 'grid', gap: 2 }}>
            {STEPS.map((n) => (
              <Box key={n} sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Box
                  sx={{
                    width: 96,
                    flex: 'none',
                    fontSize: tokens.font.size.caption,
                    color: tokens.ink.secondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  space({n}) · {tokens.space(n)}
                </Box>
                <Box
                  sx={{ height: 12, width: tokens.space(n), bgcolor: tokens.metric.weight, borderRadius: 1 }}
                />
              </Box>
            ))}
          </Box>
        </Panel>
        <Panel title="Radius and tap target">
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'flex-end' }}>
            {(
              [
                ['card', tokens.radius.card, 88, 64],
                ['control', tokens.radius.control, 88, 44],
                ['inner', tokens.radius.inner, 88, 40],
                ['chip', tokens.radius.chip, 88, 32],
              ] as const
            ).map(([name, r, w, h]) => (
              <Box key={name} sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    width: w,
                    height: h,
                    borderRadius: `${Math.min(r, h / 2)}px`,
                    border: `1px solid ${tokens.ink.border}`,
                    bgcolor: tokens.ink.page,
                  }}
                />
                <Caption sx={{ mt: 1.5 }}>
                  {name} · {r === 999 ? 'pill' : `${r} px`}
                </Caption>
              </Box>
            ))}
            <Box sx={{ textAlign: 'center' }}>
              <Box
                sx={{
                  width: tokens.tapTarget,
                  height: tokens.tapTarget,
                  borderRadius: `${tokens.radius.control}px`,
                  border: `1px dashed ${tokens.chart.target}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: tokens.font.size.caption,
                  color: tokens.ink.secondary,
                }}
              >
                44
              </Box>
              <Caption sx={{ mt: 1.5 }}>tap target</Caption>
            </Box>
          </Box>
          <Caption sx={{ mt: 4 }}>
            Layout: phone {tokens.layout.phoneWidth} px first · content max {tokens.layout.maxContent} px · desktop nav
            rail {tokens.layout.railWidth} px · bottom nav {tokens.layout.bottomNavHeight} px. Cards:{' '}
            {tokens.radius.card} px radius, no border, {tokens.elevation.card} (see Depth).
          </Caption>
        </Panel>
      </Grid>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------

/** One gradient per metric, in the order `tokens.metric` declares them. */
const GRADIENTS = (Object.keys(tokens.metric) as MetricKey[]).map((metric) => ({ metric, stops: tokens.gradient[metric] }))

const SHADOWS: readonly (readonly [string, string])[] = [
  ['elevation.card', tokens.elevation.card],
  ['elevation.raised', tokens.elevation.raised],
  ['elevation.overlay', tokens.elevation.overlay],
  ['elevation.accent', tokens.elevation.accent],
]

/**
 * The metric gradients and the depth scale. A gradient is allowed in exactly one place — the fill of a metric card —
 * because there it encodes which metric the card is. Each swatch is the real `metricGradient()` output carrying the
 * same white text a card carries, so this page shows what a card shows rather than a colour chip.
 */
export function GradientSection() {
  return (
    <Section
      id="gradient"
      title="Metric gradients and depth"
      subtitle="White on a metric gradient was measured at 4.5:1 or better at BOTH stops. The reference image's pastels measured 1.87:1–3.33:1 and were rejected for exactly that reason."
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        <Panel title="One gradient per metric (metricGradient)">
          <Box
            sx={{
              display: 'grid',
              gap: 4,
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
            }}
          >
            {GRADIENTS.map(({ metric, stops }) => (
              <Box key={metric}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: `${tokens.radius.card}px`,
                    backgroundImage: metricGradient(metric),
                    boxShadow: tokens.elevation.raised,
                    color: tokens.ink.card,
                  }}
                >
                  <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label, letterSpacing: 0.2 }}>
                    {metric}
                  </Box>
                  <Box
                    sx={{
                      mt: 2,
                      fontSize: tokens.font.size.statNumber,
                      fontWeight: tokens.font.weight.number,
                      lineHeight: 1.05,
                      letterSpacing: -1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    92.4
                  </Box>
                  <Box
                    sx={{
                      mt: 3,
                      height: 6,
                      borderRadius: `${tokens.radius.chip}px`,
                      bgcolor: 'rgba(255,255,255,0.26)',
                      overflow: 'hidden',
                    }}
                  >
                    <Box sx={{ height: '100%', width: '62%', borderRadius: 'inherit', bgcolor: tokens.ink.card }} />
                  </Box>
                </Box>
                <Caption sx={{ mt: 1.5 }}>
                  {stops[0].toUpperCase()} → {stops[1].toUpperCase()} · white text ≥ 4.5:1 at both stops
                </Caption>
              </Box>
            ))}
          </Box>
        </Panel>

        <Panel title="Depth">
          <Caption sx={{ mb: 4 }}>
            A card is separated from the {' '}
            {tokens.ink.page.toUpperCase()} canvas by depth, not by an outline. A card inside a card keeps a hairline
            instead of a second shadow, so a stack never reads as floating panels.
          </Caption>
          <Box
            sx={{
              display: 'grid',
              gap: 4,
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
            }}
          >
            {SHADOWS.map(([name, css]) => (
              <Box key={name} sx={{ p: 4, borderRadius: `${tokens.radius.card}px`, bgcolor: tokens.ink.card, boxShadow: css }}>
                <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>
                  {name}
                </Box>
                <Caption sx={{ mt: 1, overflowWrap: 'anywhere' }}>{css}</Caption>
              </Box>
            ))}
          </Box>
        </Panel>
      </Box>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------

const DURATIONS: readonly (readonly [string, number])[] = [
  ['instant', tokens.motion.duration.instant],
  ['fast', tokens.motion.duration.fast],
  ['base', tokens.motion.duration.base],
  ['slow', tokens.motion.duration.slow],
  ['slower', tokens.motion.duration.slower],
]

const EASINGS: readonly (readonly [string, string])[] = [
  ['enter', tokens.motion.easing.enter],
  ['standard', tokens.motion.easing.standard],
  ['exit', tokens.motion.easing.exit],
]

/** The four control points of a `cubic-bezier(...)` token, so the curve can be drawn from the token itself. */
function controlPoints(easing: string): [number, number, number, number] {
  const n = (easing.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 1, n[3] ?? 1]
}

/** One easing drawn to scale (x to the right, y up), with the token's own string under it. */
function EasingTile({ name, easing }: { name: string; easing: string }) {
  const [x1, y1, x2, y2] = controlPoints(easing)
  const s = 72
  const path = `M0 ${s} C ${x1 * s} ${(1 - y1) * s}, ${x2 * s} ${(1 - y2) * s}, ${s} 0`
  return (
    <Box sx={{ minWidth: 0 }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={`${name}: ${easing}`} focusable="false">
        <rect x="0.5" y="0.5" width={s - 1} height={s - 1} fill="none" stroke={tokens.chart.grid} />
        <path d={path} fill="none" stroke={tokens.metric.weight} strokeWidth={tokens.chart.lineWidth} />
      </svg>
      <Box sx={{ mt: 1.5, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>{name}</Box>
      <Caption sx={{ overflowWrap: 'anywhere' }}>{easing}</Caption>
    </Box>
  )
}

/** The live entrance: three `Reveal`s with a stagger, remounted by the replay button so the motion is watchable. */
function EntranceDemo() {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY)
  const [run, setRun] = useState(0)
  return (
    <Box>
      <Button variant="contained" onClick={() => setRun((n) => n + 1)} data-testid="motion-replay">
        Replay the entrance
      </Button>
      <Box
        sx={{
          mt: 4,
          display: 'grid',
          gap: 3,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))',
        }}
      >
        {[0, 80, 160].map((delay, i) => (
          <Reveal key={`${run}-${i}`} delay={delay}>
            <Box
              sx={{
                p: 3,
                borderRadius: `${tokens.radius.control}px`,
                bgcolor: tokens.ink.sunken,
                border: `1px solid ${tokens.ink.border}`,
              }}
            >
              <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>
                +{delay} ms
              </Box>
              <Caption sx={{ mt: 0.5 }}>
                opacity 0 → 1, translateY({tokens.motion.rise} px) → 0, {tokens.motion.duration.base} ms
              </Caption>
            </Box>
          </Reveal>
        ))}
      </Box>
      <Caption sx={{ mt: 4 }}>
        {reduced
          ? 'Reduced motion is on, so `transitionOf` returns "none" and the group above renders in place with no motion at all.'
          : 'Only opacity and transform animate — never a layout property — so an entrance can never shift content and costs no CLS. Turn on prefers-reduced-motion to watch it bypassed.'}
      </Caption>
    </Box>
  )
}

/**
 * The motion system: the duration ladder, the three easings (drawn from their own token strings, with a live settle),
 * and the entrance group the pages use. This is the section that answers "does it move like one app?".
 */
export function MotionSection() {
  return (
    <Section
      id="motion"
      title="Motion"
      subtitle={`One system for how the app moves: a duration ladder, three easings and a ${tokens.motion.rise} px rise. Every transition goes through \`transitionOf\`, which returns "none" under prefers-reduced-motion.`}
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        <Panel title="Duration (motion.duration)">
          {DURATIONS.map(([name, ms]) => (
            <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 2 }}>
              <Box
                sx={{
                  width: 140,
                  flex: 'none',
                  fontSize: tokens.font.size.small,
                  color: tokens.ink.text,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {name} · {ms} ms
              </Box>
              <Box
                sx={{
                  height: 12,
                  width: `${ms / 2}px`,
                  maxWidth: '100%',
                  borderRadius: `${tokens.radius.chip}px`,
                  bgcolor: tokens.accent.main,
                }}
              />
            </Box>
          ))}
        </Panel>

        <Panel title="Easing (motion.easing)">
          <Box
            sx={{
              display: 'grid',
              gap: 4,
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))',
            }}
          >
            {EASINGS.map(([name, easing]) => (
              <EasingTile key={name} name={name} easing={easing} />
            ))}
          </Box>
          <Caption sx={{ mt: 4 }}>
            Hover a track: the dot settles with that easing over {tokens.motion.duration.slower} ms, through
            transitionOf("transform", {tokens.motion.duration.slower}, easing).
          </Caption>
          <Box sx={{ mt: 2, display: 'grid', gap: 3 }}>
            {EASINGS.map(([name, easing]) => (
              <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Box sx={{ width: 90, flex: 'none', fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>{name}</Box>
                <Box
                  sx={{
                    position: 'relative',
                    width: 170,
                    height: 14,
                    borderRadius: `${tokens.radius.chip}px`,
                    bgcolor: tokens.ink.sunken,
                    border: `1px solid ${tokens.ink.border}`,
                    '&:hover .settler': { transform: 'translateX(156px)' },
                  }}
                >
                  <Box
                    className="settler"
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: `${tokens.radius.chip}px`,
                      bgcolor: tokens.accent.main,
                      transition: transitionOf('transform', tokens.motion.duration.slower, easing),
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </Panel>

        <Panel title="Entrance (Reveal)">
          <EntranceDemo />
        </Panel>
      </Box>
    </Section>
  )
}
