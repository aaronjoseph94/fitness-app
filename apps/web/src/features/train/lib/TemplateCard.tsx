// Owns: one template on the Train tab (1d Summit: a radius-26 white card) — the 84 px muscle-map thumbnail from its
// muscle_scores snapshot, name, the weekday of the split it is for, exercise and set counts with its main muscles, when
// it was last done, "Start" to log it now and the edit button into the builder. Today's planned template is the
// gold-ringed card with the gold "Today" chip and the dark Start.
import EditOutlined from '@mui/icons-material/EditOutlined'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import { muscleLevels } from '@fitness/shared/engine'
import type { Muscle, Template } from '@fitness/shared/schemas'
import { memo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cardSurface, formatNumber, highlightSurface, StatusChip } from '../../../components'
import { MUSCLE_LABELS, MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { sessionDay, type SessionLine } from './RecentSessions'

export interface TemplateCardProps {
  template: Template
  onStart: (template: Template) => void
  /** Today's planned session is this template (the week plan's, or today's split template). */
  today?: boolean
  /** The split day it is for ("Mon"), when it is one of this week's. */
  weekday?: string
  /** Its newest finished session in the recent window, if any. */
  lastDone?: SessionLine
}

/** The template card's shell, shared with the AI drafts so they sit in the same row. */
export const templateCardSx = {
  display: 'flex',
  gap: '16px',
  p: '20px',
  minWidth: 0,
  height: '100%',
  boxSizing: 'border-box',
  borderRadius: `${tokens.summit.radius.tile}px`,
} as const

/** A template's or draft's name: DM Sans 17/600, as the mock draws it. */
export function TemplateName({ children }: { children: ReactNode }) {
  return (
    <Box
      component="h3"
      sx={{
        m: 0,
        flex: '1 1 auto',
        minWidth: 0,
        fontSize: 17,
        fontWeight: tokens.font.weight.heading,
        lineHeight: tokens.font.leading.itemTitle,
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </Box>
  )
}

/** A 13/500 muted line under the name. */
export const templateLineSx = {
  fontSize: tokens.font.size.small,
  fontWeight: tokens.font.weight.body,
  lineHeight: 1.45,
  color: tokens.ink.muted,
  fontVariantNumeric: 'tabular-nums',
} as const

function TemplateCardInner({ template, onStart, today = false, weekday, lastDone }: TemplateCardProps) {
  const sets = template.exercises.reduce((n, e) => n + e.sets, 0)
  const top = (Object.entries(template.muscle_scores) as [Muscle, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLE_LABELS[m].toLowerCase())
  return (
    <Box data-testid="template-card" sx={{ ...(today ? highlightSurface : cardSurface), ...templateCardSx }}>
      <Box sx={{ width: 84, flex: 'none' }}>
        <MuscleMap
          levels={muscleLevels(template.muscle_scores)}
          size={84}
          title={`Muscles in ${template.name}`}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TemplateName>{template.name}</TemplateName>
          {today ? (
            <StatusChip tone="gold" label="Today" />
          ) : weekday ? (
            <StatusChip tone="neutral" label={weekday} />
          ) : null}
        </Box>
        <Box sx={{ ...templateLineSx, mt: '4px' }}>
          {template.exercises.length} exercises · {sets} sets{template.origin === 'ai' ? ' · AI' : ''}
          {top.length > 0 && ` · ${top.join(', ')}`}
        </Box>
        {lastDone && (
          <Box sx={{ ...templateLineSx, mt: '2px' }}>
            Last {sessionDay(lastDone.date)} · {formatNumber(lastDone.volume_kg)} kg
            {lastDone.minutes !== null && ` · ${lastDone.minutes} min`}
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: '12px' }}>
          <Button
            variant={today ? 'contained' : 'outlined'}
            color={today ? 'dark' : 'primary'}
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
            sx={{ width: 36, height: 36 }}
          >
            <EditOutlined sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}

export const TemplateCard = memo(TemplateCardInner)
