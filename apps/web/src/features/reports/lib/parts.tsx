// Owns: the report's building blocks — the print-safe panel (hairline card that never splits across pages), the
// stat strip, simple tables, and the print stylesheet (Letter, 15 mm, black on white, running header and page footer
// in the @page margin boxes). Shared by the report's sections; nothing here fetches.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../../theme'

/** Chart widths when the page is laid out for paper: Letter (215.9 mm) − 2 × 15 mm ≈ 703 px of content. */
export const PRINT_FULL = 672
export const PRINT_HALF = 316

/** A titled section that never splits across pages. Its subtitle is screen-only unless `printSubtitle` (paper is tight). */
export function Panel({
  title,
  subtitle,
  printSubtitle = false,
  children,
  testId,
}: {
  title: string
  subtitle?: ReactNode
  printSubtitle?: boolean
  children: ReactNode
  testId?: string
}) {
  return (
    <Box
      component="section"
      data-testid={testId}
      className="report-panel"
      sx={{
        border: `1px solid ${tokens.ink.border}`,
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: tokens.ink.card,
        p: 3,
        minWidth: 0,
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        '@media print': { p: 2, borderRadius: '8px' },
      }}
    >
      <Box component="h2" sx={{ m: 0, fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}>
        {title}
      </Box>
      {subtitle && (
        <Box className="report-secondary" sx={{ mt: 0.25, fontSize: tokens.font.size.caption, color: tokens.ink.secondary, '@media print': printSubtitle ? { fontSize: 10 } : { display: 'none' } }}>
          {subtitle}
        </Box>
      )}
      <Box sx={{ mt: 1.5, minWidth: 0, '@media print': { mt: 1 } }}>{children}</Box>
    </Box>
  )
}

/** Two columns from 600 px and always on paper; one column on a phone. */
export function Pair({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, '@media print': { gridTemplateColumns: '1fr 1fr', gap: 1.5 } }}>
      {children}
    </Box>
  )
}

export interface Stat {
  label: string
  value: string
  detail?: string
}

export function StatStrip({ stats }: { stats: readonly Stat[] }) {
  return (
    <Box
      data-testid="report-stats"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
        gap: 1.5,
        '@media print': { gridTemplateColumns: 'repeat(8, 1fr)', gap: 1 },
        breakInside: 'avoid',
      }}
    >
      {stats.map((s) => (
        <Box key={s.label} sx={{ border: `1px solid ${tokens.ink.border}`, borderRadius: '8px', px: 1.5, py: 1, minWidth: 0 }}>
          <Box className="report-secondary" sx={{ fontSize: 11, color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>
            {s.label}
          </Box>
          <Box sx={{ fontSize: 17, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
            {s.value}
          </Box>
          {s.detail && (
            <Box className="report-secondary" sx={{ fontSize: 11, color: tokens.ink.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.detail}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

export function Table({ head, rows, testId }: { head: readonly string[]; rows: readonly (readonly ReactNode[])[]; testId?: string }) {
  return (
    <Box
      component="table"
      data-testid={testId}
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: tokens.font.size.label,
        fontVariantNumeric: 'tabular-nums',
        '& th': { textAlign: 'left', fontWeight: tokens.font.weight.label, color: tokens.ink.secondary, fontSize: 11, pb: 0.5 },
        '& td': { borderTop: `1px solid ${tokens.ink.border}`, py: 0.5, pr: 1, verticalAlign: 'top' },
        '@media print': { fontSize: 11 },
      }}
    >
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Box className="report-secondary" sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
      {children}
    </Box>
  )
}

const cssString = (s: string) => `"${s.replace(/["\\]/g, '')}"`

/**
 * The print stylesheet: @page margin boxes carry the running header (week, trend) and "Page n of N" (Chrome 131+;
 * other browsers print without them), screen-only parts are hidden, text turns black on white, and colours print.
 */
export function PrintStyles({ header }: { header: string }) {
  const { print } = tokens
  const css = `
@page {
  size: Letter;
  margin: 15mm;
  @top-right { content: ${cssString(header)}; font: 8pt ${tokens.font.family}; color: ${print.header}; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt ${tokens.font.family}; color: ${print.header}; }
}
@media print {
  html, body { background: ${print.page} !important; }
  .no-print { display: none !important; }
  [data-report] { color: ${print.text}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-report] .report-secondary { color: ${print.secondary} !important; }
  [data-report] a { color: ${print.text}; text-decoration: none; }
}`
  return <style data-testid="report-print-css">{css}</style>
}
