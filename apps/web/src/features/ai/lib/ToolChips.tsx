// Owns: the "which tools were called" row above an Ask AI reply — one soft-violet pill per call with a teal check (a
// failed call is an amber pill; a long name ends in an ellipsis in a narrow thread), tapping a pill opens what was sent
// and what came back as JSON in a warm well.
import CheckRounded from '@mui/icons-material/CheckRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import type { ChatMessage, ToolCall } from '@fitness/shared/schemas'
import { useState } from 'react'
import { wellSurface } from '../../../components'
import { tokens } from '../../../theme'

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** `tools` are the turn's tool rows; each answers the call with the same id. */
export function ToolChips({ calls, tools }: { calls: readonly ToolCall[]; tools: readonly ChatMessage[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const result = (id: string) => tools.find((t) => t.tool_calls?.[0]?.id === id)?.content ?? null
  const selected = calls.find((c) => c.id === open) ?? null
  return (
    <Box data-testid="ask-ai-tools">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {calls.map((c) => {
          const failed = c.ok === false
          const fill = failed ? tokens.tone.warning.bg : tokens.summit.surface.soft
          return (
            <Chip
              key={c.id}
              variant="outlined"
              icon={
                failed ? (
                  <ErrorOutlineRounded sx={{ fontSize: 14 }} />
                ) : c.ok ? (
                  <CheckRounded sx={{ fontSize: 14, color: tokens.tone.success.text }} />
                ) : undefined
              }
              label={failed ? `${c.name} · failed` : c.name}
              onClick={() => setOpen(open === c.id ? null : c.id)}
              aria-expanded={open === c.id}
              sx={{
                minHeight: 24,
                py: '3px',
                border: 0,
                borderRadius: `${tokens.radius.pill}px`,
                fontSize: tokens.font.size.caption,
                fontWeight: tokens.font.weight.heading,
                color: failed ? tokens.tone.warning.text : tokens.summit.ink.deep,
                bgcolor: open === c.id && !failed ? tokens.summit.surface.softHover : fill,
                '&.MuiChip-clickable:hover': {
                  bgcolor: failed ? fill : tokens.summit.surface.softHover,
                },
                // A long tool name ends in an ellipsis inside a narrow thread (~300 px at 1,024); the JSON names it whole.
                '& .MuiChip-label': { overflow: 'hidden' },
              }}
            />
          )
        })}
      </Box>
      <Collapse in={selected !== null} unmountOnExit>
        {selected && (
          <Box
            component="pre"
            data-testid="ask-ai-tool-json"
            sx={{
              m: 0,
              mt: 2,
              px: '14px',
              py: '12px',
              maxHeight: 280,
              overflow: 'auto',
              ...wellSurface,
              fontSize: tokens.font.size.caption,
              lineHeight: 1.45,
              color: tokens.ink.text,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {`${selected.name}(${JSON.stringify(selected.args, null, 2)})\n\n→ ${pretty(result(selected.id) ?? 'null')}`}
          </Box>
        )}
      </Collapse>
    </Box>
  )
}
