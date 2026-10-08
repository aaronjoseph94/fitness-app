// Owns: one template on the Train tab (2a) — the 92 px muscle-map thumbnail from its muscle_scores snapshot, name,
// exercise and set counts with its main muscles, when it was last done, "Start" to log it now and the edit button into
// the builder. Today's planned template is the highlighted card with a "Today" chip and the primary Start.
import EditOutlined from '@mui/icons-material/EditOutlined'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import { muscleLevels } from '@fitness/shared/engine'
import type { Muscle, Template } from '@fitness/shared/schemas'
import { memo } from 'react'
import { Link } from 'react-router'
import { cardSurface, formatNumber, highlightSurface, outlinedIconButton, StatusChip } from '../../../components'
import { MUSCLE_LABELS, MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { sessionDay, type SessionLine } from './RecentSessions'

export interface TemplateCardProps {
  template: Template
  onStart: (template: Template) => void
  /** Today's week-plan session is this template. */
  today?: boolean
  /** Its newest finished session in the recent window, if any. */
  lastDone?: SessionLine
}

function TemplateCardInner({ template, onStart, today = false, lastDone }: TemplateCardProps) {
  const sets = template.exercises.reduce((n, e) => n + e.sets, 0)
  const top = (Object.entries(template.muscle_scores) as [Muscle, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLE_LABELS[m].toLowerCase())
  return (
    <Box
      data-testid="template-card"
      sx={{ ...(today ? highlightSurface : cardSurface), display: 'flex', gap: '14px', p: 4, minWidth: 0 }}
    >
      <Box sx={{ width: 92, flex: 'none' }}>
        <MuscleMap levels={muscleLevels(template.muscle_scores)} size={92} title={`Muscles in ${template.name}`} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box
            component="h3"
            sx={{
              m: 0,
              fontSize: tokens.font.size.itemTitle,
              fontWeight: tokens.font.weight.heading,
              lineHeight: tokens.font.leading.itemTitle,
              overflowWrap: 'anywhere',
            }}
          >
            {template.name}
          </Box>
          {today && <StatusChip tone="info" size="small" label="Today" />}
        </Box>
        <Box sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: 'normal', color: tokens.ink.muted }}>
          {template.exercises.length} exercises · {sets} sets{template.origin === 'ai' ? ' · AI' : ''}
          {top.length > 0 && ` · ${top.join(', ')}`}
        </Box>
        {lastDone && (
          <Box
            sx={{
              mt: 1,
              fontSize: tokens.font.size.caption,
              lineHeight: 'normal',
              color: tokens.ink.muted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Last done {sessionDay(lastDone.date)} · {formatNumber(lastDone.volume_kg)} kg
            {lastDone.minutes !== null && ` · ${lastDone.minutes} min`}
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '10px' }}>
          <Button
            variant={today ? 'contained' : 'outlined'}
            size="small"
            startIcon={<PlayArrowRounded />}
            onClick={() => onStart(template)}
            aria-label={`Start ${template.name}`}
            data-testid="template-start"
          >
            Start
          </Button>
          <IconButton
            component={Link}
            to={`/train/builder/${template.id}`}
            aria-label={`Edit ${template.name}`}
            sx={{ ...outlinedIconButton, width: 32, height: 32, color: tokens.ink.label }}
          >
            <EditOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}

export const TemplateCard = memo(TemplateCardInner)
