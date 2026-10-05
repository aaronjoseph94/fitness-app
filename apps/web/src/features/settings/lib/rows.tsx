// Owns: the building blocks of the Settings list — a titled group card, a tappable value row (label, help, value,
// chevron; ≥ 56 px), a read-only row, a switch row, and a link row — so every section looks and behaves the same.
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
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
      <Card sx={{ '& > *:not(:last-child)': { borderBottom: `1px solid ${tokens.ink.border}` } }}>{children}</Card>
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

function Text({ label, help }: { label: string; help?: ReactNode }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.label, lineHeight: 1.35 }}>{label}</Box>
      {help && <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary, lineHeight: 1.4 }}>{help}</Box>}
    </Box>
  )
}

function Value({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ fontSize: 15, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' }}>
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
    <ButtonBase onClick={onClick} disabled={disabled} data-testid={testId} sx={{ ...rowSx, opacity: disabled ? 0.6 : 1 }}>
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

export function LinkRow({ label, help, to }: { label: string; help?: ReactNode; to: string }) {
  return (
    <ButtonBase component={RouterLink} to={to} sx={rowSx}>
      <Text label={label} help={help} />
      <ChevronRightRounded aria-hidden sx={{ color: tokens.ink.secondary, mr: -1 }} />
    </ButtonBase>
  )
}
