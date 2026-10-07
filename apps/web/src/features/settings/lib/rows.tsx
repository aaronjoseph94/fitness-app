// Owns: the building blocks of the Settings list — a titled group card, a tappable value row (label, help, value,
// chevron; ≥ 56 px), a read-only row, a switch row, a link row, and a copy row for a value that is meant to be pasted
// somewhere else — so every section looks and behaves the same.
//
// Built as the HIG's grouped table: white card on the grouped grey, one hairline between rows and none after the last,
// the separator *inset* so it starts where the label does, the value in secondary ink at body size (a row's value is
// information, not a link — accent colour is reserved for what you can act on), and a press highlight on pointer-down
// for the rows that do something, now that MUI's ripple is gone app-wide (a row with no press state reads as dead).
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import Switch from '@mui/material/Switch'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { SectionHeader } from '../../../components'
import { tokens } from '../../../theme'

export function SettingsGroup({ id, title, subtitle, children }: { id: string; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" aria-labelledby={`${id}-title`} data-testid={`settings-${id}`}>
      <SectionHeader id={id} title={title} subtitle={subtitle} />
      <Card
        sx={{
          // Inset separators, drawn as a pseudo-element so the row's own box (and its press highlight) stays intact,
          // and only between rows — never after the last one, and never around the group's own edge.
          '& > *:not(:last-child)': {
            position: 'relative',
            '&::after': {
              content: '""',
              position: 'absolute',
              left: tokens.rhythm.group,
              right: 0,
              bottom: 0,
              height: '1px',
              backgroundColor: tokens.ink.border,
            },
          },
        }}
      >
        {children}
      </Card>
    </Box>
  )
}

const rowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  width: '100%',
  minHeight: 56,
  px: 4,
  py: 2.5,
  textAlign: 'left',
  font: 'inherit',
  color: tokens.ink.text,
} as const

/** A row that does something answers the press on pointer-down — the HIG's row highlight, never a ripple. */
const rowPressSx = {
  transition: `background-color ${tokens.motion.duration.instant}ms ${tokens.motion.easing.standard}`,
  '&:active': { backgroundColor: tokens.material.press },
} as const

function Text({ label, help }: { label: string; help?: ReactNode }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box
        sx={{
          fontSize: tokens.font.size.body,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.body,
          letterSpacing: tokens.font.tracking.body,
        }}
      >
        {label}
      </Box>
      {help && (
        <Box
          sx={{
            mt: 0.5,
            fontSize: tokens.font.size.label,
            color: tokens.ink.secondary,
            lineHeight: tokens.font.leading.label,
            letterSpacing: tokens.font.tracking.label,
          }}
        >
          {help}
        </Box>
      )}
    </Box>
  )
}

/** Right-aligned value: body size, secondary ink, tabular so a column of numbers still lines up. */
function Value({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        fontSize: tokens.font.size.body,
        fontWeight: tokens.font.weight.body,
        color: tokens.ink.secondary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: tokens.font.leading.body,
        whiteSpace: 'nowrap',
        textAlign: 'right',
      }}
    >
      {children}
    </Box>
  )
}

export function ValueRow({
  label,
  help,
  value,
  onClick,
  disabled,
  testId,
}: {
  label: string
  help?: ReactNode
  value: ReactNode
  onClick: () => void
  disabled?: boolean
  testId?: string
}) {
  return (
    <ButtonBase onClick={onClick} disabled={disabled} data-testid={testId} sx={{ ...rowSx, ...rowPressSx, opacity: disabled ? 0.6 : 1 }}>
      <Text label={label} help={help} />
      <Value>{value}</Value>
      <ChevronRightRounded aria-hidden sx={{ color: tokens.ink.secondary, mr: -1 }} />
    </ButtonBase>
  )
}

export function ReadOnlyRow({ label, help, value }: { label: string; help?: ReactNode; value: ReactNode }) {
  return (
    <Box sx={rowSx}>
      <Text label={label} help={help} />
      <Value>{value}</Value>
    </Box>
  )
}

export function SwitchRow({
  label,
  help,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string
  help?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  testId?: string
}) {
  return (
    <Box component="label" sx={{ ...rowSx, cursor: disabled ? 'default' : 'pointer' }}>
      <Text label={label} help={help} />
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        slotProps={{ input: { 'aria-label': label, ...(testId ? { 'data-testid': testId } : {}) } as object }}
      />
    </Box>
  )
}

/**
 * A row whose value is text to copy (the connector URL, a token you just generated): the label and a Copy button on one
 * line, the value wrapping underneath in a box that is easy to select by hand when the browser refuses the clipboard.
 */
export function CopyRow({
  label,
  help,
  value,
  copied,
  onCopy,
  testId,
}: {
  label: string
  help?: ReactNode
  value: string
  copied: boolean
  onCopy: () => void
  testId?: string
}) {
  return (
    <Box sx={{ ...rowSx, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Text label={label} help={help} />
      <Button
        size="small"
        onClick={onCopy}
        startIcon={<ContentCopyRounded />}
        disabled={value === ''}
        data-testid={testId}
        sx={{ flex: 'none' }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Box
        sx={{
          flexBasis: '100%',
          px: 3,
          py: 2,
          borderRadius: `${tokens.radius.control}px`,
          // A well, not an outlined box: a grey fill on the white card does the separating, so no hairline is needed.
          backgroundColor: tokens.ink.page,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
          color: tokens.ink.text,
          overflowWrap: 'anywhere',
          userSelect: 'all',
        }}
      >
        {value}
      </Box>
    </Box>
  )
}

export function LinkRow({ label, help, to }: { label: string; help?: ReactNode; to: string }) {
  return (
    <ButtonBase component={RouterLink} to={to} sx={{ ...rowSx, ...rowPressSx }}>
      <Text label={label} help={help} />
      <ChevronRightRounded aria-hidden sx={{ color: tokens.ink.secondary, mr: -1 }} />
    </ButtonBase>
  )
}
