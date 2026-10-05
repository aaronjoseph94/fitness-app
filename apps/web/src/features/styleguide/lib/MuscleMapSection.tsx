// Owns: the muscle-map section of the styleguide — both views with the legend, single views, a 96 px thumbnail
// on a template card, and an interactive map where each tap cycles a muscle through the levels.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import type { Muscle } from '@fitness/shared/schemas'
import { useState } from 'react'
import { MUSCLE_LABELS, MuscleMap, MuscleMapLegend, levelLabel, type MuscleLevel } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { Caption, Grid, Panel, Section } from './layout'

const UPPER: Partial<Record<Muscle, MuscleLevel>> = {
  chest: 4,
  shoulders: 3,
  triceps: 3,
  lats: 4,
  'middle back': 3,
  biceps: 2,
  traps: 2,
  forearms: 1,
  abdominals: 1,
}
const LOWER: Partial<Record<Muscle, MuscleLevel>> = {
  quadriceps: 4,
  glutes: 4,
  hamstrings: 3,
  calves: 2,
  adductors: 2,
  abductors: 1,
  'lower back': 1,
}

export function MuscleMapSection() {
  const [levels, setLevels] = useState<Partial<Record<Muscle, MuscleLevel>>>({ chest: 2, lats: 3 })
  const [last, setLast] = useState<Muscle | null>(null)
  const cycle = (m: Muscle) => {
    setLevels((l) => ({ ...l, [m]: (((l[m] ?? 0) + 1) % 5) as MuscleLevel }))
    setLast(m)
  }
  return (
    <Section
      id="muscle-map"
      title="Muscle map"
      subtitle="react-muscle-map geometry (public domain), 17 free-exercise-db muscles, four indigo steps."
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        <Panel title="Upper day · both views">
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <MuscleMap levels={UPPER} title="Upper A: muscles trained" />
          </Box>
          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
            <MuscleMapLegend />
          </Box>
        </Panel>
        <Grid min={280}>
          <Panel title="Lower day · back view">
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <MuscleMap levels={LOWER} view="back" size={180} />
            </Box>
          </Panel>
          <Panel title="Lower day · front view">
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <MuscleMap levels={LOWER} view="front" size={180} />
            </Box>
          </Panel>
          <Panel title="Thumbnail · 96 px on a template card">
            <Box sx={{ display: 'grid', gap: 3 }}>
              {(
                [
                  ['Upper A', '6 exercises · 20 sets', UPPER],
                  ['Lower A', '5 exercises · 18 sets', LOWER],
                ] as const
              ).map(([name, meta, lv]) => (
                <Card
                  key={name}
                  sx={{ display: 'flex', alignItems: 'center', gap: 4, p: 3, boxShadow: 'none' }}
                >
                  <MuscleMap levels={lv} size={96} title={`${name} muscle map`} />
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>{name}</Box>
                    <Caption sx={{ mt: 0.5 }}>{meta}</Caption>
                  </Box>
                </Card>
              ))}
            </Box>
          </Panel>
          <Panel title="Interactive · tap a muscle to cycle its level">
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <MuscleMap
                levels={levels}
                onSelect={cycle}
                selected={last}
                size={300}
                title="Interactive muscle map"
              />
            </Box>
            <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2, minHeight: tokens.tapTarget }}>
              <Box sx={{ flex: 1, fontSize: tokens.font.size.small, color: tokens.ink.text }} aria-live="polite">
                {last ? `${MUSCLE_LABELS[last]}: ${levelLabel(levels[last] ?? 0)}` : 'Nothing selected'}
              </Box>
              <Button
                onClick={() => {
                  setLevels({})
                  setLast(null)
                }}
              >
                Reset
              </Button>
            </Box>
            <MuscleMapLegend showNone dense />
          </Panel>
        </Grid>
      </Box>
    </Section>
  )
}
