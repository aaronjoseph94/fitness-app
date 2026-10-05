// Owns: the "which tools were called" row under an Ask AI reply — one small chip per call (a failed call is marked),
// tapping a chip opens what was sent and what came back as JSON.
import BuildOutlined from '@mui/icons-material/BuildOutlined'
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {calls.map((c) => (
          <Chip
            key={c.id}
            size="small"
            variant="outlined"
            icon={<BuildOutlined sx={{ fontSize: 14 }} />}
            label={c.ok === false ? `${c.name} · failed` : c.name}
            onClick={() => setOpen(open === c.id ? null : c.id)}
            aria-expanded={open === c.id}
            sx={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: c.ok === false ? tokens.status.warning : tokens.ink.secondary,
              borderColor: tokens.ink.border,
              bgcolor: open === c.id ? tokens.ink.page : 'transparent',
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
              p: 3,
              maxHeight: 280,
              overflow: 'auto',
              border: `1px solid ${tokens.ink.border}`,
              borderRadius: `${tokens.radius.control}px`,
              bgcolor: tokens.ink.page,
              fontSize: 12,
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
