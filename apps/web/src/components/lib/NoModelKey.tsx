// Owns: the one "no model key" message every AI feature shows when no provider key is set (UX #14) — "Add a model key
// in Settings → AI to use this." with "Settings → AI" linking to /settings/ai. `tone="light"` (default) sits on a white
// card or the cream panel; `tone="dark"` on the sky or a deep-sky/coach card. Inline: no card of its own, so it fits in
// a sheet's footer, an empty state or a banner.
import KeyRounded from '@mui/icons-material/KeyRounded'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router'
import { tokens } from '../../theme'
import { skyFocus } from './surfaces'

export interface NoModelKeyProps {
  /** The ground it sits on. Default `light`. */
  tone?: 'light' | 'dark'
  /** Default `no-model-key`. */
  testId?: string
}

export const NO_MODEL_KEY_PATH = '/settings/ai'

export function NoModelKey({ tone = 'light', testId = 'no-model-key' }: NoModelKeyProps) {
  const dark = tone === 'dark'
  const { summit } = tokens
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
        color: dark ? summit.onSky.subtitle : tokens.ink.muted,
        minWidth: 0,
      }}
    >
      <KeyRounded
        aria-hidden
        sx={{ fontSize: 18, flex: 'none', mt: '1px', color: dark ? summit.onSky.text : tokens.accent.main }}
      />
      <span>
        Add a model key in{' '}
        <Link
          component={RouterLink}
          to={NO_MODEL_KEY_PATH}
          underline="always"
          sx={
            dark
              ? { color: summit.onSky.text, '&:hover': { color: summit.onSky.text }, ...skyFocus }
              : undefined
          }
        >
          Settings → AI
        </Link>{' '}
        to use this.
      </span>
    </Box>
  )
}
