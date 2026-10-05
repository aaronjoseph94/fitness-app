// Owns: the token sections of the styleguide — every colour in `tokens` (name + hex), the type scale, the 4 px
// spacing scale, radii and the tap target. Reads `tokens` directly, so a change in theme.ts shows here at once.
import Box from '@mui/material/Box'
import { tokens } from '../../../theme'
import { Caption, Grid, Panel, Section } from './layout'

interface Swatch {
  name: string
  hex: string
}

const entries = (o: Record<string, string>, prefix: string): Swatch[] =>
  Object.entries(o).map(([k, v]) => ({ name: `${prefix}.${k}`, hex: v }))

const GROUPS: { title: string; note: string; swatches: Swatch[] }[] = [
  {
    title: 'Ink',
    note: 'Text in two greys, hairline borders, white cards on a near-white page.',
    swatches: entries(tokens.ink, 'ink'),
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
    title: 'Muscle map',
    note: 'Grey body, white separations, four indigo steps.',
    swatches: [
      { name: 'muscleMap.body', hex: tokens.muscleMap.body },
      { name: 'muscleMap.stroke', hex: tokens.muscleMap.stroke },
      ...tokens.muscleMap.steps.map((hex, i) => ({ name: `muscleMap.steps[${i}]`, hex })),
    ],
  },
]

function SwatchTile({ name, hex }: Swatch) {
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
            fontSize: 14,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.text,
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </Box>
        <Box sx={{ fontSize: 13, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {hex.toUpperCase()}
        </Box>
      </Box>
    </Box>
  )
}

export function ColourSection() {
  return (
    <Section
      id="colour"
      title="Colour"
      subtitle="Colour is reserved for data. Everything else is ink on white."
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        {GROUPS.map((g) => (
          <Panel key={g.title}>
            <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.heading }}>{g.title}</Box>
            <Caption sx={{ mt: 0.5, mb: 4 }}>{g.note}</Caption>
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(170px, 100%), 1fr))',
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
  { name: 'h4 / card title', px: 18, w: weight.heading, sample: 'Raise protein to 140 g' },
  { name: 'Body', px: size.body, w: weight.body, sample: 'Lunch is the first meal; breakfast stays hidden.' },
  { name: 'Body 2', px: 14, w: weight.body, sample: 'Trend down 0.8 kg this week.', secondary: true },
  { name: 'Button', px: 15, w: weight.label, sample: 'Log weigh-in' },
  { name: 'Label', px: size.label, w: weight.label, sample: 'Calories remaining', secondary: true },
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
              <Box sx={{ fontSize: 13, fontWeight: weight.label, color: tokens.ink.text }}>{t.name}</Box>
              <Box sx={{ fontSize: 12, color: tokens.ink.secondary }}>
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
                    fontSize: 12,
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
                  fontSize: 12,
                  color: tokens.ink.secondary,
                }}
              >
                44
              </Box>
              <Caption sx={{ mt: 1.5 }}>tap target</Caption>
            </Box>
          </Box>
          <Caption sx={{ mt: 4 }}>
            Layout: phone {tokens.layout.phoneWidth} px first · content max {tokens.layout.maxContent} px ·
            bottom nav {tokens.layout.bottomNavHeight} px. Cards: 16 px radius, 1 px{' '}
            {tokens.ink.border.toUpperCase()} border, no shadow.
          </Caption>
        </Panel>
      </Grid>
    </Section>
  )
}
