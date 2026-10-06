// Owns: the /styleguide page (SPEC §11): one scrollable page rendering every token, control, card, ring, chart
// (with sample data), the muscle map and the empty states, grouped by section. This is where the look is iterated:
// change apps/web/src/theme.ts or a kit component and this page shows it everywhere at once. It renders inside
// the app shell (route /styleguide, wide column), which supplies the page gutter, title bar and bottom padding.
import Box from '@mui/material/Box'
import { tokens } from '../../theme'
import { CardsSection, MetricCardsSection, ProposalsSection, RingsSection } from './lib/CardsSection'
import { ChartsSection } from './lib/ChartsSection'
import { ControlsSection } from './lib/ControlsSection'
import { EmptyStatesSection } from './lib/EmptyStatesSection'
import { MuscleMapSection } from './lib/MuscleMapSection'
import { ColourSection, GradientSection, MotionSection, SpaceSection, TypeSection } from './lib/TokensSections'

const NAV = [
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['space', 'Space'],
  ['gradient', 'Gradients'],
  ['motion', 'Motion'],
  ['controls', 'Controls'],
  ['cards', 'Cards'],
  ['metric', 'Metric cards'],
  ['rings', 'Rings'],
  ['proposals', 'Proposals'],
  ['charts', 'Charts'],
  ['muscle-map', 'Muscle map'],
  ['empty', 'Empty states'],
] as const

export function StyleguidePage() {
  return (
    <Box data-testid="styleguide" sx={{ color: tokens.ink.text, pt: 2, pb: 8 }}>
      <Box component="header">
        <Box
          sx={{
            fontSize: tokens.font.size.label,
            fontWeight: tokens.font.weight.label,
            color: tokens.metric.weight,
          }}
        >
          Visual kit
        </Box>
        <Box sx={{ mt: 1.5, fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, lineHeight: 1.5, maxWidth: 560 }}>
          Every token, card and chart with sample data from the 2026-09-26 baseline. Tokens live only in{' '}
          <Box component="code" sx={{ fontSize: tokens.font.size.small, color: tokens.ink.text }}>
            apps/web/src/theme.ts
          </Box>
          ; change one there and this page shows it everywhere.
        </Box>
        <Box
          component="nav"
          aria-label="Styleguide sections"
          sx={{ mt: 5, display: 'flex', flexWrap: 'wrap', gap: 2 }}
        >
          {NAV.map(([id, label]) => (
            <Box
              key={id}
              component="a"
              href={`#${id}`}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: tokens.tapTarget,
                px: 4,
                borderRadius: `${tokens.radius.chip}px`,
                border: `1px solid ${tokens.ink.border}`,
                bgcolor: tokens.ink.card,
                color: tokens.ink.text,
                fontSize: tokens.font.size.small,
                fontWeight: tokens.font.weight.label,
                textDecoration: 'none',
                '&:hover': { borderColor: tokens.chart.target },
                '&:focus-visible': { outline: `2px solid ${tokens.metric.weight}`, outlineOffset: 2 },
              }}
            >
              {label}
            </Box>
          ))}
        </Box>
      </Box>

      <ColourSection />
      <TypeSection />
      <SpaceSection />
      <GradientSection />
      <MotionSection />
      <ControlsSection />
      <CardsSection />
      <MetricCardsSection />
      <RingsSection />
      <ProposalsSection />
      <ChartsSection />
      <MuscleMapSection />
      <EmptyStatesSection />
    </Box>
  )
}

export default StyleguidePage
