// Owns: one template on the Train tab — the 96 px muscle-map thumbnail from its muscle_scores snapshot, name,
// exercise and set counts, its main muscles; tap to edit in the builder, "Start" to log it now.
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import { muscleLevels } from '@fitness/shared/engine'
import type { Muscle, Template } from '@fitness/shared/schemas'
import { memo } from 'react'
import { Link } from 'react-router'
import { MUSCLE_LABELS, MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'

export interface TemplateCardProps {
  template: Template
  onStart: (template: Template) => void
}

function TemplateCardInner({ template, onStart }: TemplateCardProps) {
  const sets = template.exercises.reduce((n, e) => n + e.sets, 0)
  const top = (Object.entries(template.muscle_scores) as [Muscle, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLE_LABELS[m])
  return (
    <Card data-testid="template-card" sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 3 }}>
      <ButtonBase
        component={Link}
        to={`/train/builder/${template.id}`}
        aria-label={`Edit ${template.name}`}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          p: 3,
          justifyContent: 'flex-start',
          textAlign: 'left',
        }}
      >
        <Box sx={{ flex: 'none' }}>
          <MuscleMap
            levels={muscleLevels(template.muscle_scores)}
            size={96}
            title={`Muscles in ${template.name}`}
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              fontSize: tokens.font.size.body,
              fontWeight: tokens.font.weight.heading,
              lineHeight: 1.3,
              overflowWrap: 'anywhere',
            }}
          >
            {template.name}
          </Box>
          <Box sx={{ mt: 0.5, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
            {template.exercises.length} exercises · {sets} sets{template.origin === 'ai' ? ' · AI' : ''}
          </Box>
          {top.length > 0 && (
            <Box sx={{ mt: 0.5, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{top.join(', ')}</Box>
          )}
        </Box>
      </ButtonBase>
      <Button
        variant="outlined"
        startIcon={<PlayArrowRounded />}
        onClick={() => onStart(template)}
        aria-label={`Start ${template.name}`}
        sx={{ flex: 'none' }}
        data-testid="template-start"
      >
        Start
      </Button>
    </Card>
  )
}

export const TemplateCard = memo(TemplateCardInner)
