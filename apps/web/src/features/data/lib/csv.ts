// Owns: one table's rows as CSV (RFC 4180) for the export zip — a header of every column seen, in first-seen order;
// a field with a comma, quote, CR or LF is quoted with quotes doubled; null is an empty field; CRLF line ends.
// JSON columns stay as their stored JSON text, booleans as 0/1, instants in UTC — exactly what full.json holds.
import type { ExportRow } from '@fitness/shared/schemas'

function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
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
