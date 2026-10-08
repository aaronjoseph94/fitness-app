// Owns: the 2a meter row (Log's macros, the Dashboard's daily averages) — a 13 px label on the left, the bold value
// with its muted "/ 130 g" (or "/ 45 g min" for a minimum) on the right, a 6 px bar in the given colour under them,
// and an optional 11 px caption ("48 g to go") coloured by tone. While its value loads it keeps its lines' heights.
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { formatNumber } from './format'
import { ProgressBar } from './ProgressBar'

export interface MeterRowProps {
  label: string
  /** Null when there is nothing to show ("—"). */
  value: number | null
  /** Null for no target: the value then reads with its unit only. */
  target: number | null
  unit: string
  /** The target is a minimum ("/ 45 g min"). */
  floor?: boolean
  /** The bar's fill, a token colour. */
  color: string
  /** The bar's accessible name. Default: the label. */
  barLabel?: string
  /** The 11 px line under the bar. Omit for no line; null keeps its height empty. */
  caption?: ReactNode
  captionTone?: 'warning' | 'success' | 'muted'
  /** The value is still loading: a text-line placeholder in its place. */
  loading?: boolean
  /** Grow delay of the bar in ms, to follow the card's entrance. */
  delay?: number
}

const CAPTION_COLOR = {
  warning: tokens.tone.warning.text,
  success: tokens.tone.success.text,
  muted: tokens.ink.secondary,
} as const

export function MeterRow({
  label,
  value,
  target,
  unit,
  floor = false,
  color,
  barLabel,
  caption,
  captionTone = 'muted',
  loading = false,
  delay,
}: MeterRowProps) {
  const ratio = value !== null && target && target > 0 ? value / target : null
  const withCaption = caption !== undefined
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          columnGap: 1,
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
        }}
      >
        <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
          {label}
        </Box>
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {loading ? (
            <Skeleton variant="text" width={56} sx={{ display: 'inline-block' }} />
          ) : (
            <>
              <Box component="b" sx={{ fontWeight: tokens.font.weight.heading }}>
                {formatNumber(value)}
              </Box>{' '}
              <Box component="span" sx={{ color: tokens.ink.secondary }}>
                {target !== null ? `/ ${formatNumber(target)} ${unit}${floor ? ' min' : ''}` : unit}
              </Box>
            </>
          )}
        </Box>
      </Box>
      {/* 2a: the bar sits 6 px under the row when a caption follows (Log), 5 px otherwise (Dashboard). */}
      <Box sx={{ mt: withCaption ? '6px' : '5px' }}>
        <ProgressBar value={ratio} color={color} label={barLabel ?? label} delay={delay} />
      </Box>
      {withCaption && (
        <Box
          sx={{
            mt: '5px',
            minHeight: 15,
            fontSize: tokens.font.size.micro,
            lineHeight: tokens.font.leading.micro,
            color: CAPTION_COLOR[captionTone],
            fontWeight:
              caption !== null && captionTone !== 'muted'
                ? tokens.font.weight.heading
                : tokens.font.weight.body,
          }}
        >
          {caption}
        </Box>
      )}
    </Box>
  )
}
