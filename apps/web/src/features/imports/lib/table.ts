// Owns: reading a health export file in the browser into one flat table (column names + rows of text): CSV (comma,
// semicolon or tab; quoted fields), Health Auto Export JSON ({ data: { metrics: [{ name, units, data: [...] }] } },
// merged into one row per date with "<metric>.<field>" columns), or any JSON array of objects (nested keys dotted).

export interface Table {
  format: 'csv' | 'json'
  columns: string[]
  rows: Record<string, string>[]
}

/** A file this large is almost certainly the full Apple Health export.xml zip, which this screen does not read. */
const MAX_BYTES = 25 * 1024 * 1024

function detectDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0]![0]
}

/** RFC 4180-style CSV: quoted fields may hold the delimiter, newlines and "" for a quote. */
export function parseCsv(text: string): Table {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.slice(0, clean.search(/\r?\n/) === -1 ? undefined : clean.search(/\r?\n/))
  const delimiter = detectDelimiter(firstLine)
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      record.push(field)
      if (record.some((f) => f.trim() !== '')) records.push(record)
      record = []
      field = ''
    } else field += ch
  }
  record.push(field)
  if (record.some((f) => f.trim() !== '')) records.push(record)
  const [header = [], ...body] = records
  const columns = header.map((h, i) => h.trim() || `Column ${i + 1}`)
  return { format: 'csv', columns, rows: body.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()]))) }
}

function flatten(value: unknown, prefix: string, out: Record<string, string>): void {
  if (value === null || value === undefined) return
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else if (!Array.isArray(value)) out[prefix] = String(value)
}

interface HaeMetric {
  name: string
  units?: string
  data: Record<string, unknown>[]
}

function isHae(json: unknown): json is { data: { metrics: HaeMetric[] } } {
  const metrics = (json as { data?: { metrics?: unknown } } | null)?.data?.metrics
  return Array.isArray(metrics) && metrics.every((m) => typeof (m as HaeMetric).name === 'string' && Array.isArray((m as HaeMetric).data))
}

/** The date part of a Health Auto Export timestamp ("2026-10-01 00:00:00 -0600"), else the value itself. */
const dayKey = (v: unknown) => (typeof v === 'string' ? (/^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] ?? v) : String(v))

/** Health Auto Export JSON → one row per date, each metric's fields as "<metric>.<field>" (units in the name). */
function fromHae(metrics: HaeMetric[]): Table {
  const byDate = new Map<string, Record<string, string>>()
  const columns = new Set<string>(['date'])
  for (const m of metrics) {
    const name = m.units ? `${m.name} (${m.units})` : m.name
    for (const point of m.data) {
      const date = dayKey(point.date ?? point.startDate)
      const row = byDate.get(date) ?? { date }
      const flat: Record<string, string> = {}
      flatten(point, '', flat)
      for (const [k, v] of Object.entries(flat)) {
        if (k === 'date') continue
        const col = `${name}.${k}`
        columns.add(col)
        // Several points on one date (hourly exports): add numbers, keep the first text.
        const prev = row[col]
        row[col] = prev !== undefined && Number.isFinite(Number(prev)) && Number.isFinite(Number(v)) ? String(Number(prev) + Number(v)) : (prev ?? v)
      }
      byDate.set(date, row)
    }
  }
  return { format: 'json', columns: [...columns], rows: [...byDate.values()].sort((a, b) => (a.date! < b.date! ? -1 : 1)) }
}

/** The first array of objects in a JSON document (the document itself, or a property one or two levels down). */
function firstArray(json: unknown, depth = 0): Record<string, unknown>[] | null {
  if (Array.isArray(json)) return json.every((x) => typeof x === 'object' && x !== null) ? (json as Record<string, unknown>[]) : null
  if (depth >= 2 || typeof json !== 'object' || json === null) return null
  for (const v of Object.values(json)) {
    const found = firstArray(v, depth + 1)
    if (found) return found
  }
  return null
}

export function parseJson(text: string): Table {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("That JSON file couldn't be read.")
  }
  if (isHae(json)) return fromHae(json.data.metrics)
  const items = firstArray(json)
  if (!items) throw new Error('No list of days found in that JSON file.')
  const rows = items.map((item) => {
    const flat: Record<string, string> = {}
    flatten(item, '', flat)
    return flat
  })
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return { format: 'json', columns, rows }
}

/** Read a CSV or JSON export into a table. */
export async function readTable(file: File): Promise<Table> {
  if (file.size > MAX_BYTES) throw new Error('That file is too large. Export daily totals (CSV or JSON) instead of the full Health archive.')
  const text = await file.text()
  const isJson = /\.json$/i.test(file.name) || file.type.includes('json') || /^\s*[[{]/.test(text.slice(0, 100))
  const table = isJson ? parseJson(text) : parseCsv(text)
  if (table.rows.length === 0) throw new Error('That file has no rows.')
  return table
}
