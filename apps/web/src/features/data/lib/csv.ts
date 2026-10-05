// Owns: one table's rows as CSV (RFC 4180) for the export zip — a header of every column seen, in first-seen order;
// a field with a comma, quote, CR or LF is quoted with quotes doubled; null is an empty field; CRLF line ends.
// JSON columns stay as their stored JSON text, booleans as 0/1, instants in UTC — what full.json holds, except that
// text a spreadsheet would run as a formula gets a leading ' (CSV is for reading; restore reads full.json only).
import type { ExportRow } from '@fitness/shared/schemas'

/** A plain number ("-2.5", "+3", "1e-3") is data, never a formula, so it keeps its sign. */
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/**
 * Formula injection guard (OWASP "CSV injection"): text starting with = + - @ (or a tab or CR, which some spreadsheets
 * skip before one) is prefixed with ' so Excel, Numbers and Sheets show it as text instead of evaluating it.
 */
function defused(text: string): string {
  return /^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text
}

function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'number' ? String(value) : defused(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: readonly ExportRow[]): string {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows)
    for (const key of Object.keys(row))
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
  const lines = [columns.map(field).join(',')]
  for (const row of rows) lines.push(columns.map((c) => field(row[c])).join(','))
  return `${lines.join('\r\n')}\r\n`
}
