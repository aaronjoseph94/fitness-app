// Owns: the empty-states and legends section of the styleguide — every unDraw illustration as a compact empty
// state, one full-size empty state, and the legend chip marks.
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import { EmptyState, ILLUSTRATIONS, LegendChips, type Illustration } from '../../../components'
import { tokens, withAlpha } from '../../../theme'
import { Grid, Panel, Section } from './layout'

const COPY: Record<Illustration, { title: string; body: string; action?: string }> = {
  empty: { title: 'Nothing here yet', body: 'Your logs show up here as soon as you add one.' },
  training: {
    title: 'No sessions yet',
    body: 'Start Monday’s upper day or build your own workout.',
    action: 'Start a session',
  },
  meals: { title: 'No meals logged today', body: 'Type, snap or scan your lunch.', action: 'Log lunch' },
  progress: { title: 'Not enough data', body: 'A week of weigh-ins draws your trend.' },
  schedule: { title: 'No week plan', body: 'Run your coach review to plan next week.' },
  goals: { title: 'First milestone ahead', body: '90 kg is next. Keep the trend going.' },
}

export function EmptyStatesSection() {
  return (
    <Section
      id="empty"
      title="Empty states and legends"
      subtitle="Illustrations from unDraw, recoloured to the weight indigo."
    >
      <Grid min={260}>
        {ILLUSTRATIONS.map((name) => (
          <Card key={name}>
            <EmptyState
              compact
              illustration={name}
              title={COPY[name].title}
              body={COPY[name].body}
              action={COPY[name].action ? { label: COPY[name].action!, onClick: () => undefined } : undefined}
              testId={`empty-${name}`}
            />
          </Card>
        ))}
      </Grid>
      <Card sx={{ mt: 4 }}>
        <EmptyState
          illustration="training"
          title="Build your first template"
          body="Pick exercises from the machines and free weights you have, or let the AI fill a balanced session."
          action={{ label: 'New template', onClick: () => undefined }}
        />
      </Card>
      <Box sx={{ mt: 4 }}>
        <Panel title="Legend chips mirror their mark">
          <LegendChips
            items={[
              { label: 'Bar', color: tokens.metric.calories, mark: 'bar' },
              { label: 'Line', color: tokens.metric.weight, mark: 'line' },
              { label: 'Band', color: withAlpha(tokens.metric.weight, 0.3), mark: 'band' },
              { label: 'Dot', color: tokens.metric.lean, mark: 'dot' },
              { label: 'Ring', color: tokens.metric.lean, mark: 'ring' },
              { label: 'Target', color: tokens.chart.target, mark: 'dashed' },
            ]}
          />
        </Panel>
      </Box>
    </Section>
  )
}
