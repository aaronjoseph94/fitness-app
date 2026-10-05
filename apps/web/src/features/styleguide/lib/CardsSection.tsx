// Owns: the cards and rings sections of the styleguide — StatCards as Today uses them, the rings row and ring
// states (under, at, over target), the pending badge and the proposal card in each status.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { Sparkline } from '../../../charts'
import { sample } from '../../../charts/sample-data'
import {
  MetricRing,
  PendingBadge,
  ProposalCard,
  RingsRow,
  StatCard,
  formatNumber,
  type ProposalStatus,
} from '../../../components'
import { tokens } from '../../../theme'
import { Caption, Grid, Panel, Section } from './layout'

const trend = sample.weight.points.at(-1)!.trend!
const lost = 95.1 - trend
const finish = sample.weight.forecast.at(-1)!.date

export function CardsSection() {
  return (
    <Section
      id="cards"
      title="Cards"
      subtitle="One big number per card. Delta arrows are coloured by whether the direction is good."
    >
      <Grid min={260}>
        <StatCard
          label="Trend weight"
          value={trend}
          unit="kg"
          precision={1}
          metric="weight"
          emphasis="hero"
          delta={{ value: -lost, period: 'since 2026-09-26', good: 'down' }}
          sparkline={<Sparkline values={sample.weightSparkline} metric="weight" />}
          testId="stat-trend-weight"
        />
        <StatCard
          label="To go"
          value={trend - sample.targets.goalKg}
          unit="kg"
          precision={1}
          footnote={`Projected finish ${finish}`}
        />
        <StatCard
          label="Calories remaining"
          value={350}
          unit="kcal"
          metric="calories"
          delta={{ value: 52, unit: 'kcal', period: 'over yesterday', good: 'neutral' }}
          badge={<PendingBadge count={2} />}
          onClick={() => undefined}
        />
        <StatCard
          label="Protein, 7-day average"
          value={124}
          unit="g"
          metric="protein"
          delta={{ value: -6, period: 'vs 130 g target', good: 'up' }}
        />
        <StatCard
          label="Lean mass"
          value={58.0}
          unit="kg"
          precision={1}
          metric="lean"
          delta={{ value: -1.6, period: 'since baseline', good: 'up' }}
        />
        <StatCard label="Last scan" value={null} unit="kg" footnote="No scan yet this block" />
      </Grid>
    </Section>
  )
}

export function RingsSection() {
  return (
    <Section
      id="rings"
      title="Rings"
      subtitle="Value of target in the metric colour; past 100 % a second lap overlaps the first."
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        <Panel title="Today">
          <RingsRow
            rings={[
              {
                id: 'calories',
                label: 'Calories',
                value: 1050,
                target: 1400,
                metric: 'calories',
                centre: '350',
                centreCaption: 'left',
                detail: 'of 1,400',
                unit: 'kcal',
              },
              {
                id: 'protein',
                label: 'Protein',
                value: 96,
                target: 130,
                metric: 'protein',
                centreCaption: 'g',
                detail: 'of 130 g',
                unit: 'g',
              },
              {
                id: 'water',
                label: 'Water',
                value: 2250,
                target: 3000,
                metric: 'water',
                centre: '2.3',
                centreCaption: 'L',
                detail: 'of 3.0 L',
                unit: 'ml',
              },
              {
                id: 'steps',
                label: 'Steps',
                value: 6240,
                target: 8000,
                metric: 'steps',
                centre: '6.2k',
                detail: 'of 8,000',
                unit: 'steps',
              },
              {
                id: 'sleep',
                label: 'Sleep',
                value: 7.1,
                target: 7.5,
                metric: 'sleep',
                centre: '7.1',
                centreCaption: 'h',
                detail: 'of 7.5 h',
                unit: 'h',
              },
            ]}
          />
        </Panel>
        <Grid min={280}>
          <Panel title="States">
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {(
                [
                  ['Empty', 0],
                  ['Under', 0.45],
                  ['At', 1],
                  ['Over', 1.32],
                ] as const
              ).map(([name, r]) => (
                <Box key={name} sx={{ textAlign: 'center' }}>
                  <MetricRing
                    label={name}
                    value={Math.round(3000 * r)}
                    target={3000}
                    metric="water"
                    centre={`${Math.round(r * 100)}%`}
                  />
                  <Caption sx={{ mt: 1.5 }}>{name}</Caption>
                </Box>
              ))}
            </Box>
          </Panel>
          <Panel title="Sizes">
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'flex-end' }}>
              {[44, 64, 96, 128].map((s) => (
                <Box key={s} sx={{ textAlign: 'center' }}>
                  <MetricRing
                    label="Protein"
                    value={96}
                    target={130}
                    metric="protein"
                    size={s}
                    centreCaption={s >= 64 ? 'g' : undefined}
                  />
                  <Caption sx={{ mt: 1.5 }}>{s} px</Caption>
                </Box>
              ))}
            </Box>
          </Panel>
        </Grid>
      </Box>
    </Section>
  )
}

export function ProposalsSection() {
  const [status, setStatus] = useState<ProposalStatus>('pending')
  const [why, setWhy] = useState(false)
  return (
    <Section
      id="proposals"
      title="Proposals and badges"
      subtitle="Every AI change waits behind a tap: Accept, Reject or Why."
    >
      <Grid min={320}>
        <ProposalCard
          source="Weekly review · AI"
          title="Raise protein to 140 g"
          summary="Lean mass fell 0.7 kg between scans while protein averaged 124 g. Shift 40 kcal from carbs to protein; calories stay at 1,400."
          changes={[
            { label: 'Protein target', from: '130 g', to: '140 g' },
            { label: 'Carbs (remainder)', from: '≈ 118 g', to: '≈ 108 g' },
            { label: 'Daily kcal', from: formatNumber(1400), to: formatNumber(1400) },
          ]}
          status={status}
          onAccept={() => setStatus('accepted')}
          onReject={() => setStatus('rejected')}
          onWhy={() => setWhy((w) => !w)}
        >
          {why && (
            <Box
              sx={{
                p: 3,
                borderRadius: `${tokens.radius.control}px`,
                bgcolor: tokens.ink.page,
                fontSize: tokens.font.size.small,
                color: tokens.ink.text,
                lineHeight: 1.5,
              }}
            >
              Lean-loss guard: lean mass was 26 % of the loss between the last two scans (limit 25 %). More
              protein and keeping all four sessions protect it.
            </Box>
          )}
        </ProposalCard>
        <Box sx={{ display: 'grid', gap: 4 }}>
          <ProposalCard
            source="Coach · MCP"
            title="Swap Thursday to a pull day"
            summary="Thursday is a fast day next week; keep it light."
            status="auto_applied"
          />
          <Panel title="Pending badge">
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
              <PendingBadge />
              <PendingBadge count={3} />
              <PendingBadge label="Waiting to sync" count={2} />
            </Box>
            {status !== 'pending' && (
              <Button sx={{ mt: 3 }} onClick={() => setStatus('pending')}>
                Reset the proposal
              </Button>
            )}
          </Panel>
        </Box>
      </Grid>
    </Section>
  )
}
