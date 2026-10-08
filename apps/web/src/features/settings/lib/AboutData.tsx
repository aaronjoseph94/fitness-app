// Owns: the "About this data" card (2a) — where each kind of data is kept (D1 and R2 on Cloudflare, this phone's queue
// and cache, with what is waiting in it now) and what never reaches an LLM, in three short columns on the #FAFAFA
// panel, then the time zone and the way to export everything.
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { Panel } from '../../../components'
import { useOnline, usePendingWrites } from '../../../offline'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Box sx={{ fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>{title}</Box>
      {children}
    </Box>
  )
}

export function AboutData({ timezone }: { timezone: string }) {
  const pending = usePendingWrites().length
  const online = useOnline()
  return (
    <Panel id="about" title="About this data" tone="panel" testId="settings-about">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 4,
          mt: '-2px',
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
          color: tokens.ink.label,
        }}
      >
        <Item title="Kept on Cloudflare">
          Logs, plans, scans and reviews in D1; photos and sheets in R2. Single user, behind Access.
        </Item>
        <Item title="Kept on this device">
          The offline queue and the last day’s cache. Writes sync when you’re back online
          {pending > 0 ? ` (${pending} waiting now${online ? '' : ', offline'}).` : '.'}
        </Item>
        <Item title="Never sent to an LLM">
          Progress photos. Meal photos are downscaled to 1,024 px and the name on a scan sheet is masked first.
        </Item>
      </Box>
      <Box sx={{ mt: 3, fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.muted }}>
        Time zone {timezone} ·{' '}
        <Link
          component={RouterLink}
          to="/settings/data"
          underline="hover"
          // A 44 px tap target on touch, still on the footer's line of text.
          sx={{ color: tokens.accent.main, [COARSE_POINTER_QUERY]: { display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget } }}
        >
          Export everything
        </Link>
      </Box>
    </Panel>
  )
}
