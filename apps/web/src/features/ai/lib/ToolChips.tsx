// Owns: the "which tools were called" row above an Ask AI reply — one outline pill per call with a green check (a
// failed call is marked in amber), tapping a pill opens what was sent and what came back as JSON.
import CheckRounded from '@mui/icons-material/CheckRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import type { ChatMessage, ToolCall } from '@fitness/shared/schemas'
import { useState } from 'react'
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
        {calls.map((c) => (
          <Chip
            key={c.id}
            variant="outlined"
            icon={
              c.ok === false ? (
                <ErrorOutlineRounded sx={{ fontSize: 14 }} />
              ) : c.ok ? (
                <CheckRounded sx={{ fontSize: 14, color: tokens.tone.success.solid }} />
              ) : undefined
            }
            label={c.ok === false ? `${c.name} · failed` : c.name}
            onClick={() => setOpen(open === c.id ? null : c.id)}
            aria-expanded={open === c.id}
            sx={{
              py: '2px',
              borderRadius: `${tokens.radius.pill}px`,
              fontSize: tokens.font.size.micro,
              fontWeight: tokens.font.weight.body,
              color: c.ok === false ? tokens.tone.warning.text : tokens.ink.label,
              bgcolor: open === c.id ? tokens.ink.fill : tokens.ink.card,
            }}
          />
        ))}
      </Box>
      <Collapse in={selected !== null} unmountOnExit>
        {selected && (
          <Box
            component="pre"
            data-testid="ask-ai-tool-json"
            sx={{
              m: 0,
              mt: 2,
              px: '12px',
              py: '10px',
              maxHeight: 280,
              overflow: 'auto',
              border: `1px solid ${tokens.ink.border}`,
              borderRadius: `${tokens.radius.control}px`,
              bgcolor: tokens.ink.panel,
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
