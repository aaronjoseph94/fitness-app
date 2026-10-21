// Owns: the "About this data" card (1d: the page's deep-sky card) — where each kind of data is kept (D1 and R2 on
// Cloudflare, this device's queue and cache, with what is waiting in it now) and what never reaches an LLM, in three
// short columns that wrap at 200 px (README §4) under gold headings, then the time zone and the way to export
// everything.
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { DeepSkyCard, wrapCol } from '../../../components'
import { useOnline, usePendingWrites } from '../../../offline'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'

const { deepSky, gold } = tokens.summit

/** README §4: the three columns wrap once each can't have 200 px. */
const COLUMN_BASIS = 200

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={wrapCol(1, COLUMN_BASIS)}>
      <Box
        component="h3"
        sx={{ m: 0, font: 'inherit', fontWeight: tokens.font.weight.heading, color: gold.main }}
      >
        {title}
      </Box>
      {children}
    </Box>
  )
}

export function AboutData({ timezone }: { timezone: string }) {
  const pending = usePendingWrites().length
  const online = useOnline()
  return (
    <Box id="about" sx={{ scrollMarginTop: tokens.layout.scrollPadding.top }}>
      {/* The section nav focuses `about-title` after it scrolls here, as it does every card's heading. */}
      <DeepSkyCard
        title={<span id="about-title">About this data</span>}
        testId="settings-about"
        ariaLabel="About this data"
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '18px',
            mt: '4px',
            fontSize: tokens.font.size.body,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.body,
            color: tokens.summit.onSky.eyebrow,
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
            Progress photos. Meal photos are downscaled to 1,024 px and the name on a scan sheet is masked
            first.
          </Item>
        </Box>
        <Box
          sx={{
            mt: '16px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.caption,
            color: deepSky.muted,
          }}
        >
          Time zone {timezone} ·{' '}
          <Link
            component={RouterLink}
            to="/settings/data"
            underline="hover"
            // A 44 px tap target on touch, still on the footer's line of text.
            sx={{
              color: gold.main,
              '&:hover': { color: deepSky.text },
              [COARSE_POINTER_QUERY]: {
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: tokens.tapTarget,
              },
            }}
          >
            Export everything
          </Link>
        </Box>
      </DeepSkyCard>
    </Box>
  )
}
