// Owns: the 2a banner — a tinted strip with a 1 px border, radius 10, 13 px text and an 18 px glyph in the tone's own
// colour: info (#EFF6FF / #BFDBFE / #1E3A8A — a session's start notes, an offline read), warning (#FEF3C7, deep amber
// text — the next fast, a failed read), danger and success. An optional title, and an action on the right (a retry).
// MUI's <Alert> is themed to the same look; use this where a banner is part of a layout rather than a notice.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import InfoRounded from '@mui/icons-material/InfoRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

export type BannerTone = 'info' | 'warning' | 'danger' | 'success'

export interface BannerProps {
  /** Default `info`. */
  tone?: BannerTone
  /** A bold first line. */
  title?: ReactNode
  children?: ReactNode
  /** The leading glyph. Default per tone; `null` for none. */
  icon?: SvgIconComponent | null
  /** Right-hand slot, e.g. `<Button size="small" variant="outlined">Try again</Button>`. */
  action?: ReactNode
  /** `alert` for a failure the person should hear at once, `status` for a calm update. Default none. */
  role?: 'alert' | 'status'
  testId?: string
}

const TONES: Record<BannerTone, { bg: string; border: string; text: string; icon: string; glyph: SvgIconComponent }> = {
  info: { bg: tokens.tone.info.bg, border: tokens.tone.info.border, text: tokens.tone.info.text, icon: tokens.tone.info.icon, glyph: InfoRounded },
  warning: {
    bg: tokens.tone.warning.bg,
    border: tokens.tone.warning.border,
    text: tokens.tone.warning.deep,
    icon: tokens.tone.warning.text,
    glyph: WarningAmberRounded,
  },
  danger: { bg: tokens.tone.danger.soft, border: tokens.tone.danger.border, text: tokens.tone.danger.text, icon: tokens.tone.danger.text, glyph: ErrorOutlineRounded },
  success: {
    bg: tokens.tone.success.soft,
    border: tokens.tone.success.border,
    text: tokens.tone.success.text,
    icon: tokens.tone.success.solid,
    glyph: CheckCircleRounded,
  },
}

export function Banner({ tone = 'info', title, children, icon, action, role, testId }: BannerProps) {
  const t = TONES[tone]
  const Glyph = icon === null ? null : (icon ?? t.glyph)
  return (
    <Box
      role={role}
      data-testid={testId}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        px: '14px',
        py: '12px',
        borderRadius: `${tokens.radius.panel}px`,
        border: `1px solid ${t.border}`,
        bgcolor: t.bg,
        color: t.text,
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
        minWidth: 0,
      }}
    >
      {Glyph && <Glyph aria-hidden sx={{ fontSize: 18, color: t.icon, flex: 'none', mt: '1px' }} />}
      <Box sx={{ flex: 1, minWidth: 0, '& b, & strong': { fontWeight: tokens.font.weight.heading } }}>
        {title && <Box sx={{ fontWeight: tokens.font.weight.heading }}>{title}</Box>}
        {children}
      </Box>
      {action && <Box sx={{ flex: 'none', alignSelf: 'center', my: '-4px' }}>{action}</Box>}
    </Box>
  )
}
