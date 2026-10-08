// Owns: the building blocks of the Settings list (2a) — a titled group card, a tappable value row (label, help, value,
// chevron), a read-only row, a switch row, a link row, a copy row for a value that is meant to be pasted somewhere
// else, the two-column grid the Profile and More cards lay their rows in, and the seven training-day tiles — so every
// section looks and behaves the same.
//
// Built on the kit: a group is a flush `Panel` (title 16/600, 13 px description, actions right), each row a `ListRow`
// (14/500 label, 12 px help, #52525B value, chevron, #F4F4F5 hairline above, hover #FAFAFA).
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import type { Weekday } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { ListRow, Panel, visuallyHidden } from '../../../components'
import { tokens } from '../../../theme'
import { formatDays, WEEKDAYS } from './fields'

const hairline = `1px solid ${tokens.ink.hairline}`

export function SettingsGroup({
  id,
  title,
  subtitle,
  actions,
  children,
}: {
  id: string
  title: string
  subtitle?: ReactNode
  /** Right of the title, e.g. the Rails card's "Confirm to edit" chip. */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel id={id} title={title} description={subtitle} actions={actions} padding="none" testId={`settings-${id}`}>
      {children}
    </Panel>
  )
}

/**
 * Rows two to a line (2a's Profile and More cards) where there is room for them: from `sm` on a phone-width layout,
 * and from `lg` beside the section nav; one column otherwise. Each row draws its own hairline above it (under the
 * header for the first line, between rows after that); the grid adds only the line between the columns. The rows are
 * all one element (all buttons, or all links), so `nth-of-type` counts them (emotion warns on `nth-child`).
 */
export function RowGrid({ children }: { children: ReactNode }) {
  const twoColumns = {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    '& > :nth-of-type(odd)': { borderRight: hairline },
    // An odd row out takes the whole last line rather than leaving half a line empty.
    '& > :nth-of-type(odd):last-of-type': { gridColumn: '1 / -1', borderRight: 0 },
  }
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        [theme.breakpoints.only('sm')]: twoColumns,
        [theme.breakpoints.up('lg')]: twoColumns,
      })}
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
  return <ListRow label={label} help={help} value={value} onClick={onClick} disabled={disabled} testId={testId} />
}

export function ReadOnlyRow({ label, help, value }: { label: string; help?: ReactNode; value: ReactNode }) {
  return <ListRow label={label} help={help} value={value} />
}

/** The whole row is the switch's label, so a tap on the text flips it too. */
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
    <Box component="label" sx={{ display: 'block', cursor: disabled ? 'default' : 'pointer' }}>
      <ListRow
        label={label}
        help={help}
        trailing={
          <Switch
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            slotProps={{ input: { 'aria-label': label, ...(testId ? { 'data-testid': testId } : {}) } as object }}
          />
        }
      />
    </Box>
  )
}

/**
 * A row whose value is text to copy (the connector URL, a token you just generated): the label and a Copy button on one
 * line, the value wrapping underneath in a #FAFAFA well that is easy to select by hand when the browser refuses the
 * clipboard.
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
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '10px 12px', px: `${tokens.pad.card.x}px`, py: '12px', borderTop: hairline }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>{label}</Box>
        {help && (
          <Box sx={{ mt: '1px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>{help}</Box>
        )}
      </Box>
      <Button
        variant="outlined"
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
          px: '12px',
          py: '8px',
          borderRadius: `${tokens.radius.control}px`,
          bgcolor: tokens.ink.panel,
          border: `1px solid ${tokens.ink.border}`,
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

export function LinkRow({
  label,
  help,
  value,
  icon,
  to,
  testId,
}: {
  label: string
  help?: ReactNode
  /** A short muted note on the right ("3 keys set"). */
  value?: ReactNode
  /** An 18 px muted glyph before the label (the More card). */
  icon?: SvgIconComponent
  to: string
  testId?: string
}) {
  return <ListRow label={label} help={help} value={value} icon={icon} component={RouterLink} to={to} testId={testId} />
}

/**
 * The training days as 2a draws them: seven 28 × 24 tiles in week order, a training day dark, a rest day on the muted
 * fill. A phone, where seven tiles do not fit beside the label, reads the days as text instead; assistive tech always
 * hears the text.
 */
export function DayTiles({ days }: { days: readonly Weekday[] }) {
  const text = formatDays(days)
  return (
    <>
      <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
        {text}
      </Box>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, gap: '4px', verticalAlign: 'middle' }}>
        <Box component="span" sx={visuallyHidden}>
          {text}
        </Box>
        {WEEKDAYS.map((d) => {
          const on = days.includes(d.key)
          return (
            <Box
              component="span"
              key={d.key}
              aria-hidden
              sx={{
                width: 28,
                height: 24,
                display: 'grid',
                placeItems: 'center',
                borderRadius: `${tokens.radius.inner}px`,
                bgcolor: on ? tokens.dark.bg : tokens.ink.fill,
                color: on ? tokens.dark.text : tokens.ink.faint,
                fontSize: tokens.font.size.micro,
                fontWeight: tokens.font.weight.heading,
                lineHeight: 1,
              }}
            >
              {d.long.charAt(0)}
            </Box>
          )
        })}
      </Box>
    </>
  )
}
