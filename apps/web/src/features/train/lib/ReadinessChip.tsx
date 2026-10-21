// Owns: the readiness chip (SPEC §7, §9 readiness) — a 1d pill: a status-coloured dot, "Readiness 74 · full volume"
// (under 40 flags reduced volume) and an info glyph; on the sky (Train's hero) a 46 px teal pill when readiness is good,
// dark glass with an amber or coral dot otherwise; on a card a soft violet pill. On tap, what it is made of: last
// night's sleep vs 7.5 h, yesterday's steps vs the 14-day median, days since the last session.
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Popover from '@mui/material/Popover'
import type { Readiness } from '@fitness/shared/schemas'
import { useId, useState } from 'react'
import { formatNumber } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'

/** Readiness at or above this reads as good; under 40 suggests reduced volume (SPEC §9). */
const GOOD_FROM = 70
const REDUCED_BELOW = 40

/** The status dot's colour: danger under 40, warning under 70, else the solid success green. */
export function readinessTone(score: number): string {
  return score < REDUCED_BELOW
    ? tokens.tone.danger.text
    : score < GOOD_FROM
      ? tokens.tone.warning.text
      : tokens.tone.success.solid
}

/** The dot on the sky: white on the teal pill, else gold (moderate) or coral (low) on the dark glass. */
function skyDot(score: number): string {
  return score < REDUCED_BELOW
    ? tokens.summit.coral.main
    : score < GOOD_FROM
      ? tokens.summit.gold.main
      : tokens.summit.onSky.text
}

const { summit } = tokens

export function ReadinessChip({ readiness, onSky = false }: { readiness: Readiness; onSky?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const detailsId = useId()
  const good = readiness.score >= GOOD_FROM
  const tone = onSky ? skyDot(readiness.score) : readinessTone(readiness.score)
  const volume = readiness.reduced_volume ? 'reduced volume' : 'full volume'
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
        // Starts with the visible text (WCAG 2.5.3 label in name).
        aria-label={`Readiness ${readiness.score} · ${volume}. Score out of 100. Details`}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls={anchor !== null ? detailsId : undefined}
        data-testid="readiness-chip"
        sx={{
          height: onSky ? 46 : 36,
          px: onSky ? '16px' : '14px',
          gap: '8px',
          flex: 'none',
          maxWidth: '100%',
          borderRadius: `${summit.radius.pill}px`,
          // Status colour on the dot only; the label stays white / ink so it reads at any score (WCAG 1.4.3).
          ...(onSky
            ? good
              ? { bgcolor: summit.pill.teal, border: '1px solid transparent', color: summit.onSky.text }
              : {
                  bgcolor: summit.glass.control,
                  border: `1px solid ${summit.glass.controlBorder}`,
                  backdropFilter: `blur(${summit.glass.blur}px)`,
                  color: summit.onSky.text,
                }
            : { bgcolor: tokens.ink.fill, border: '1px solid transparent', color: summit.ink.deep }),
          // A <button> takes the UA font unless told to inherit the page's.
          fontFamily: 'inherit',
          fontSize: onSky ? 14 : tokens.font.size.small,
          fontWeight: tokens.font.weight.heading,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          '@media (hover: hover)': {
            '&:hover': {
              filter: onSky ? 'brightness(1.08)' : 'none',
              bgcolor: onSky ? undefined : summit.surface.softHover,
            },
          },
          ...(onSky && {
            '&.Mui-focusVisible': {
              outline: `${tokens.focusRing.width}px solid ${summit.onSky.text}`,
              outlineOffset: tokens.focusRing.offset,
            },
          }),
          [COARSE_POINTER_QUERY]: { height: onSky ? 46 : tokens.tapTarget },
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', bgcolor: tone }}
        />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Readiness {readiness.score} · {volume}
        </Box>
        <InfoOutlined
          aria-hidden
          sx={{ fontSize: 18, flex: 'none', color: onSky ? summit.onSky.subtitle : tokens.ink.secondary }}
        />
      </ButtonBase>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            id: detailsId,
            role: 'dialog',
            'aria-label': 'Readiness details',
            sx: { mt: 1, p: 4, maxWidth: 320 },
          },
        }}
      >
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>
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
            fontSize: tokens.font.size.small,
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
            fontSize: tokens.font.size.label,
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
