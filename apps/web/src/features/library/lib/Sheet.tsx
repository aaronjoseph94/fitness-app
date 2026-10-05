// Owns: the tall bottom sheet the picker and the detail sheet sit in — drag handle, title row with close, an optional
// fixed header block (search and filters), a scrolling body and an optional footer, phone-width and safe-area aware.
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import type { Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { tokens } from '../../../theme'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** Fixed under the title (does not scroll). */
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  testId?: string
  /** Stack above another sheet (the picker opened from the detail sheet, and the reverse). */
  nested?: boolean
}

export function Sheet({ open, onClose, title, subtitle, header, footer, children, testId, nested = false }: SheetProps) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      // A sheet is modal: above dialogs it was opened from (Drawer's own default sits below them).
      sx={{ zIndex: (t) => t.zIndex.modal + (nested ? 1 : 0) }}
      slotProps={{
        paper: {
          'aria-label': typeof title === 'string' ? title : undefined,
          'data-testid': testId,
          sx: {
            maxWidth: (t: Theme) => t.breakpoints.values.sm,
            mx: 'auto',
            height: '94dvh',
            display: 'flex',
            flexDirection: 'column',
            borderTopLeftRadius: tokens.radius.card,
            borderTopRightRadius: tokens.radius.card,
          },
        } as object,
      }}
    >
      <Box sx={{ width: 36, height: 4, borderRadius: tokens.radius.chip, bgcolor: 'divider', mx: 'auto', mt: 2, flex: 'none' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pl: 5, pr: 2, pt: 1, flex: 'none' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="sectionTitle" component="h2" sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {title}
          </Typography>
          {subtitle && <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, mt: 0.25 }}>{subtitle}</Box>}
        </Box>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseRounded />
        </IconButton>
      </Box>
      {header && <Box sx={{ px: 5, pt: 2, pb: 2, flex: 'none' }}>{header}</Box>}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 5, pb: footer ? 2 : `calc(${tokens.space(6)}px + env(safe-area-inset-bottom, 0px))` }}>
        {children}
      </Box>
      {footer && (
        <Box
          sx={{
            flex: 'none',
            px: 5,
            pt: 3,
            pb: `calc(${tokens.space(3)}px + env(safe-area-inset-bottom, 0px))`,
            borderTop: `1px solid ${tokens.ink.border}`,
            bgcolor: tokens.ink.card,
          }}
        >
          {footer}
        </Box>
      )}
    </Drawer>
  )
}
