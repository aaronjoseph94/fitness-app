// Owns: the 2a banner — a tinted strip with a 1 px border, radius 10, 13 px text and an 18 px glyph in the tone's own
// colour, all from `BANNER_TONES`: info (`tone.info` bg / border / text — a session's start notes, an offline read),
// warning (`tone.warning.bg`, `tone.warning.deep` text — the next fast, a failed read), danger and success. An optional
// title, and an action on the right (a retry).
// MUI's <Alert> is themed to the same look; use this where a banner is part of a layout rather than a notice.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import InfoRounded from '@mui/icons-material/InfoRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { BANNER_TONES, tokens } from '../../theme'

export type BannerTone = 'info' | 'warning' | 'danger' | 'success'

export interface BannerProps {
  /** Default `info`. */
  tone?: BannerTone
  /** A bold first line. */
  title?: ReactNode
  children?: ReactNode
  /** Right-hand slot, e.g. `<Button size="small" variant="outlined">Try again</Button>`. */
  action?: ReactNode
  /** `alert` for a failure the person should hear at once, `status` for a calm update. Default none. */
  role?: 'alert' | 'status'
  testId?: string
}

/** The theme's banner colours (shared with MUI's `<Alert>`) plus each tone's glyph. */
const TONES: Record<BannerTone, { bg: string; border: string; text: string; icon: string; glyph: SvgIconComponent }> = {
  info: { ...BANNER_TONES.info, glyph: InfoRounded },
  warning: { ...BANNER_TONES.warning, glyph: WarningAmberRounded },
  danger: { ...BANNER_TONES.danger, glyph: ErrorOutlineRounded },
  success: { ...BANNER_TONES.success, glyph: CheckCircleRounded },
}

export function Banner({ tone = 'info', title, children, action, role, testId }: BannerProps) {
  const t = TONES[tone]
  const Glyph = t.glyph
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
      <Glyph aria-hidden sx={{ fontSize: 18, color: t.icon, flex: 'none', mt: '1px' }} />
      <Box sx={{ flex: 1, minWidth: 0, '& b, & strong': { fontWeight: tokens.font.weight.heading } }}>
        {title && <Box sx={{ fontWeight: tokens.font.weight.heading }}>{title}</Box>}
        {children}
      </Box>
      {action && <Box sx={{ flex: 'none', alignSelf: 'center', my: '-4px' }}>{action}</Box>}
    </Box>
  )
}
