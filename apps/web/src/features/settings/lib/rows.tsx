// Owns: the building blocks of the Settings list (1d) — a titled group card, the settings row (a 15/600 label over a
// 13 px muted help line, the value on the right, a chevron when it goes somewhere; a hairline above it and the warm well
// on hover; a text value breaks between words or after a "/", never mid-word), its value as an amount (the figure in
// Outfit, the unit in DM Sans), a read-only row, a switch row, a link row (with an optional tinted icon tile), a copy
// row for a value that is meant to be pasted somewhere else, the wrapping two-column layout the Profile and More cards
// lay their rows in (300 px each, README §4), and the seven training-day tiles — so every section looks and behaves the
// same. A link row may carry a short muted note on the right ("next Nov 18") that keeps its width; the label gives way.
//
// The group is a flush kit `Panel`; the row is drawn here rather than with the kit's `ListRow` because 1d's Settings rows
// are a size up (15 px labels, 13 px help, values in Outfit) from the list rows other screens use.
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Switch from '@mui/material/Switch'
import type { Weekday } from '@fitness/shared/schemas'
import { Fragment, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { Panel, tabularNums, visuallyHidden, wellSurface } from '../../../components'
import { tokens, transitionOf } from '../../../theme'
import { formatDays, WEEKDAYS } from './fields'

const hairline = `1px solid ${tokens.ink.hairline}`

/** A row's label size (1d Settings: 15/600; its help line is 13/500). */
const ROW_LABEL = tokens.font.size.emphasis
/** The Profile and More cards' rows: two to a line while each can have 300 px (README §4). */
const ROW_BASIS = 300

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
    <Panel
      id={id}
      title={title}
      description={subtitle}
      actions={actions}
      padding="none"
      testId={`settings-${id}`}
    >
      {children}
    </Panel>
  )
}

/**
 * A value as an amount: the figure in Outfit 400 and the unit after it in 13 px DM Sans, muted ("1,400 kcal"). `text`
 * is the formatted value with its unit ("1,400 kcal"); a value without that unit is shown whole. A real space separates
 * the two, so the row still reads "1,400 kcal" as text.
 */
export function Amount({ text, unit }: { text: string; unit?: string }) {
  const suffix = unit ? ` ${unit}` : ''
  const split = suffix !== '' && text.endsWith(suffix)
  return (
    <Box
      component="span"
      sx={{
        fontFamily: tokens.font.display,
        fontSize: ROW_LABEL,
        fontWeight: tokens.font.weight.number,
        color: tokens.ink.text,
        whiteSpace: 'nowrap',
        ...tabularNums,
      }}
    >
      {split ? text.slice(0, -suffix.length) : text}
      {split && (
        <>
          {' '}
          <Box
            component="span"
            sx={{
              fontFamily: tokens.font.family,
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              color: tokens.ink.muted,
            }}
          >
            {unit}
          </Box>
        </>
      )}
    </Box>
  )
}

/**
 * A text value with a break opportunity after each "/", so a narrow row wraps "America/Edmonton" as "America/" over
 * "Edmonton" rather than mid-word; any other value is returned as it is.
 */
function breakAfterSlash(value: ReactNode): ReactNode {
  if (typeof value !== 'string' || !value.includes('/')) return value
  return value.split('/').map((part, i, parts) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ))
}

/** The leading tile of a More row: a 36 px tinted square with its glyph in the tint's own ink. */
export interface IconTint {
  bg: string
  fg: string
}

interface RowProps {
  label: ReactNode
  help?: ReactNode
  /** Right-aligned value: an `Amount`, a chip, or text (15/500 body copy). */
  value?: ReactNode
  /** Replaces the value and the chevron, e.g. a `<Switch>`. */
  trailing?: ReactNode
  /** A short note on the right in 13/500 muted ("next Nov 18"): it keeps its width, and the label gives way. */
  note?: string
  icon?: SvgIconComponent
  iconTint?: IconTint
  onClick?: () => void
  /** A router link. */
  to?: string
  disabled?: boolean
  /** Let the value wrap under the label on a narrow card (the training-day tiles). */
  wrapValue?: boolean
  testId?: string
}

/** One settings row: a button, a router link, or (with neither) a plain row whose `trailing` holds its control. */
function Row({
  label,
  help,
  value,
  trailing,
  note,
  icon: Icon,
  iconTint,
  onClick,
  to,
  disabled = false,
  wrapValue = false,
  testId,
}: RowProps) {
  const interactive = Boolean(onClick || to)
  const content = (
    <>
      {Icon && (
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${tokens.radius.control}px`,
            bgcolor: iconTint?.bg ?? tokens.accent.soft,
            color: iconTint?.fg ?? tokens.accent.deep,
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
        </Box>
      )}
      {/*
       * The label keeps 140 px (or half the row) however long the value beside it: a long value wraps instead. A short
       * note is the exception: it keeps its width and the label wraps.
       */}
      <Box
        component="span"
        sx={{
          flex: wrapValue ? '1 1 120px' : 1,
          minWidth: wrapValue || note ? 0 : 'min(140px, 50%)',
          display: 'block',
        }}
      >
        <Box
          component="span"
          sx={{
            display: 'block',
            fontSize: ROW_LABEL,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.label,
            color: tokens.ink.text,
          }}
        >
          {label}
        </Box>
        {help && (
          <Box
            component="span"
            sx={{
              display: 'block',
              mt: '2px',
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.muted,
            }}
          >
            {help}
          </Box>
        )}
      </Box>
      {note && !trailing && (
        <Box
          component="span"
          sx={{
            flex: 'none',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.body,
            color: tokens.ink.muted,
            whiteSpace: 'nowrap',
            ...tabularNums,
          }}
        >
          {note}
        </Box>
      )}
      {trailing ??
        (value !== undefined && value !== null && (
          <Box
            component="span"
            sx={{
              flex: '0 1 auto',
              minWidth: 0,
              maxWidth: wrapValue ? '100%' : '55%',
              textAlign: 'right',
              // Whole words first: a word breaks only when it can't fit a line on its own.
              overflowWrap: 'break-word',
              fontSize: ROW_LABEL,
              fontWeight: tokens.font.weight.body,
              color: tokens.ink.label,
              ...tabularNums,
            }}
          >
            {breakAfterSlash(value)}
          </Box>
        ))}
      {interactive && !trailing && (
        <ChevronRightRounded aria-hidden sx={{ fontSize: 20, color: tokens.ink.faint, flex: 'none' }} />
      )}
    </>
  )

  const sx = {
    display: 'flex',
    alignItems: 'center',
    flexWrap: wrapValue ? 'wrap' : 'nowrap',
    gap: wrapValue ? '10px 12px' : '12px',
    width: '100%',
    minHeight: tokens.tapTarget,
    px: `${tokens.pad.card.x}px`,
    py: '14px',
    textAlign: 'left',
    font: 'inherit',
    color: tokens.ink.text,
    bgcolor: tokens.ink.card,
    borderTop: hairline,
    ...(interactive && {
      transition: transitionOf('background-color', tokens.motion.duration.instant),
      '@media (hover: hover)': { '&:hover': { bgcolor: tokens.ink.panel } },
      '&:active': { bgcolor: tokens.ink.panel },
      // The row sits flush in a card that clips its corners: draw the keyboard ring inside it.
      '&.Mui-focusVisible': { outlineOffset: -2 },
    }),
    ...(disabled && { opacity: 0.5 }),
  } as const

  if (!interactive)
    return (
      <Box data-testid={testId} sx={sx}>
        {content}
      </Box>
    )
  // ButtonBase renders a router link or a button, with one focus ring and one press state for both.
  const as: Record<string, unknown> = to ? { component: RouterLink, to } : {}
  return (
    <ButtonBase data-testid={testId} onClick={onClick} disabled={disabled} {...as} sx={sx}>
      {content}
    </ButtonBase>
  )
}

/**
 * Rows two to a line while each has 300 px (README §4: the Profile and More cards), one to a line below that. Every
 * row draws its hairline above it and one on its right; the strip runs a pixel past the card's right edge, which the
 * card clips, so only the rule between two rows on a line shows, however the rows wrap.
 */
export function RowGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        mr: '-1px',
        '& > *': { flex: `100 1 ${ROW_BASIS}px`, minWidth: 0, borderRight: hairline },
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
  wrapValue,
  testId,
}: {
  label: string
  help?: ReactNode
  value: ReactNode
  onClick: () => void
  disabled?: boolean
  wrapValue?: boolean
  testId?: string
}) {
  return (
    <Row
      label={label}
      help={help}
      value={value}
      onClick={onClick}
      disabled={disabled}
      wrapValue={wrapValue}
      testId={testId}
    />
  )
}

export function ReadOnlyRow({ label, help, value }: { label: string; help?: ReactNode; value: ReactNode }) {
  return <Row label={label} help={help} value={value} />
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
      <Row
        label={label}
        help={help}
        trailing={
          <Switch
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            slotProps={{
              input: { 'aria-label': label, ...(testId ? { 'data-testid': testId } : {}) } as object,
            }}
          />
        }
      />
    </Box>
  )
}

/**
 * A row whose value is text to copy (the connector URL, a token you just generated): the label and a Copy button on one
 * line, the value wrapping underneath in a warm well that is easy to select by hand when the browser refuses the
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
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: '10px 12px',
        px: `${tokens.pad.card.x}px`,
        py: '14px',
        borderTop: hairline,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontSize: ROW_LABEL,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.label,
            color: tokens.ink.text,
          }}
        >
          {label}
        </Box>
        {help && (
          <Box
            sx={{
              mt: '2px',
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.muted,
            }}
          >
            {help}
          </Box>
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
          ...wellSurface,
          flexBasis: '100%',
          px: '14px',
          py: '10px',
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
  note,
  icon,
  iconTint,
  to,
  testId,
}: {
  label: string
  help?: ReactNode
  /** A status chip or a value on the right ("3 keys set"). */
  value?: ReactNode
  /** A short muted note on the right that keeps its width ("next Nov 18"). */
  note?: string
  /** A glyph in a 36 px tinted tile before the label (the More card). */
  icon?: SvgIconComponent
  iconTint?: IconTint
  to: string
  testId?: string
}) {
  return (
    <Row
      label={label}
      help={help}
      value={value}
      note={note}
      icon={icon}
      iconTint={iconTint}
      to={to}
      testId={testId}
    />
  )
}

/**
 * The training days as 1d draws them: seven tiles in week order, a training day in deep ink, a rest day on soft
 * violet; they wrap under the label on a narrow card. Assistive tech hears the days as text.
 */
export function DayTiles({ days }: { days: readonly Weekday[] }) {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', verticalAlign: 'middle' }}
    >
      <Box component="span" sx={visuallyHidden}>
        {formatDays(days)}
      </Box>
      {WEEKDAYS.map((d) => {
        const on = days.includes(d.key)
        return (
          <Box
            component="span"
            key={d.key}
            aria-hidden
            sx={{
              width: 'clamp(26px, 7vw, 32px)',
              height: 28,
              display: 'grid',
              placeItems: 'center',
              borderRadius: `${tokens.radius.inner}px`,
              bgcolor: on ? tokens.dark.bg : tokens.summit.surface.soft,
              // A rest day's letter is body ink on soft violet (8.1:1): quieter than a training day, still readable.
              color: on ? tokens.dark.text : tokens.ink.label,
              fontSize: tokens.font.size.caption,
              fontWeight: tokens.font.weight.heading,
              lineHeight: 1,
            }}
          >
            {d.long.charAt(0)}
          </Box>
        )
      })}
    </Box>
  )
}
