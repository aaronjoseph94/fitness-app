// Owns: the readiness chip (SPEC §7, §9 readiness) — the 0–100 score coloured by status (under 40 flags reduced
// volume), and on tap what it is made of: last night's sleep vs 7.5 h, yesterday's steps vs the 14-day median, days
// since the last session.
import BoltRounded from '@mui/icons-material/BoltRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Popover from '@mui/material/Popover'
import type { Readiness } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatNumber } from '../../../components'
import { tokens, withAlpha } from '../../../theme'

/** Readiness at or above this reads as good; under 40 suggests reduced volume (SPEC §9). */
const GOOD_FROM = 70
const REDUCED_BELOW = 40

export function readinessTone(score: number): string {
  return score < REDUCED_BELOW
    ? tokens.status.flag
    : score < GOOD_FROM
      ? tokens.status.warning
      : tokens.status.good
}

export function ReadinessChip({ readiness }: { readiness: Readiness }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const tone = readinessTone(readiness.score)
  const rows: [string, string][] = [
    [
      'Sleep last night',
      readiness.sleep_h === null ? 'Not logged' : `${formatNumber(readiness.sleep_h, 1)} h of 7.5 h`,
    ],
    [
      'Steps yesterday',
      readiness.steps_vs_median === null
        ? 'Not logged'
        : `${formatNumber(readiness.steps_vs_median, 2)} × your 14-day median`,
    ],
    [
      'Since last session',
      readiness.days_since_last_session === null
        ? 'No session yet'
        : readiness.days_since_last_session === 1
          ? '1 day'
          : `${readiness.days_since_last_session} days`,
    ],
  ]
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`Readiness ${readiness.score} of 100. Details`}
        data-testid="readiness-chip"
        sx={{
          height: 32,
          px: 2.5,
          gap: 1,
          borderRadius: tokens.radius.chip,
          bgcolor: withAlpha(tone, 0.1),
          color: tone,
          fontSize: 14,
          fontWeight: tokens.font.weight.heading,
          fontVariantNumeric: 'tabular-nums',
          flex: 'none',
        }}
      >
        <BoltRounded sx={{ fontSize: 18 }} aria-hidden />
        Readiness {readiness.score}
      </ButtonBase>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              p: 4,
              maxWidth: 320,
              borderRadius: `${tokens.radius.card}px`,
              border: `1px solid ${tokens.ink.border}`,
            },
          },
        }}
      >
        <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.heading }}>
          Readiness {readiness.score} / 100
        </Box>
        <Box
          component="dl"
          sx={{
            m: 0,
            mt: 2,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 3,
            rowGap: 1.5,
            fontSize: 14,
          }}
        >
          {rows.map(([label, value]) => (
            <Box key={label} sx={{ display: 'contents' }}>
              <Box component="dt" sx={{ color: tokens.ink.secondary }}>
                {label}
              </Box>
              <Box component="dd" sx={{ m: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </Box>
            </Box>
          ))}
        </Box>
        <Box
          sx={{
            mt: 3,
            fontSize: 13,
            color: readiness.reduced_volume ? tokens.status.flag : tokens.ink.secondary,
            lineHeight: 1.45,
          }}
        >
          {readiness.reduced_volume
            ? 'Low today: consider one set fewer per exercise, or a lighter session.'
            : 'Sleep counts most (half), then days since your last session, then yesterday’s steps.'}
        </Box>
      </Popover>
    </>
  )
}
