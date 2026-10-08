// Owns: Today's "Recent activity" table (2a) — the newest events of the live AI feed (day adjustments, proposals,
// reviews, notes, changes) as rows of time, who (a blue chip for the AI or the Coach, an outline one for Aaron) with
// what happened (wrapping, never cut), and the figure that goes with it (under the event on a phone); "View log" opens
// the Log tab. The page shows it once the feed has answered (a placeholder or the failed-read banner before that).
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import type { AiEvent } from '@fitness/shared/schemas'
import { Link as RouterLink } from 'react-router'
import { Panel, StatusChip } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { activityRow } from './event-view'

/** Rows shown: the feed keeps more. */
const ROWS = 6

/** The value column from `sm` up; on a phone the event is the last column and keeps the card's right gutter. */
const HIDE_ON_PHONE = { display: { xs: 'none', sm: 'table-cell' } } as const
const EVENT_CELL = { pl: 0, pr: { xs: `${tokens.pad.card.x}px`, sm: 0 } } as const

export function RecentActivity({ events }: { events: readonly AiEvent[] }) {
  const rows = events.slice(0, ROWS).map((e) => activityRow(e))
  return (
    <Panel
      title="Recent activity"
      titleSize="card"
      padding="none"
      actions={
        <Link
          component={RouterLink}
          to="/log"
          underline="hover"
          sx={{
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            [COARSE_POINTER_QUERY]: { display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget },
          }}
        >
          View log
        </Link>
      }
    >
      {rows.length === 0 ? (
        <Box sx={{ px: `${tokens.pad.card.x}px`, pb: `${tokens.pad.card.y}px`, fontSize: tokens.font.size.small, color: tokens.ink.muted }}>
          Day adjustments, proposals and notes from the AI show here.
        </Box>
      ) : (
        // Time and value keep their own width (an empty value takes none); the event takes the rest and wraps. On a
        // phone the value moves under the event, which needs the width.
        <Table aria-label="Recent activity" sx={{ '& tbody tr:last-of-type td': { borderBottom: 0, pb: '12px' }, '& td': { verticalAlign: 'top' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
              <TableCell sx={{ ...EVENT_CELL, width: '100%' }}>Event</TableCell>
              <TableCell align="right" sx={HIDE_ON_PHONE}>
                Value
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell sx={{ color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', lineHeight: '22px' }}>{r.when}</TableCell>
                <TableCell sx={EVENT_CELL}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
                    <StatusChip tone={r.ai ? 'info' : 'outline'} label={r.who} />
                    <Box sx={{ minWidth: 0, lineHeight: '22px', overflowWrap: 'anywhere' }}>
                      {r.text}
                      {r.value && <Box sx={{ display: { sm: 'none' }, fontWeight: tokens.font.weight.label }}>{r.value}</Box>}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ ...HIDE_ON_PHONE, fontWeight: tokens.font.weight.label, whiteSpace: 'nowrap', lineHeight: '22px' }}>
                  {r.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  )
}
