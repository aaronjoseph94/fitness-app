// Owns: the scans reads and writes — the list and one scan (polled while the sheet is being read or the debrief is
// being written), confirm / re-read / discard, and what each write makes stale (scans, the trend's milestones, events).
import { endpoints } from '@fitness/shared/api'
import type { Scan } from '@fitness/shared/schemas'
import { useApiMutation, useApiQuery } from '../../../api'

/** Poll quickly while a job is running; slowly while a failed read waits for its automatic retry. */
const POLL_MS = 2_500
const RETRY_POLL_MS = 15_000

/** How often to re-read a scan: while extracting or analysing, else never. */
export function pollInterval(scan: Scan | undefined): number | false {
  if (!scan) return false
  const x = scan.extraction
  if (!scan.confirmed && !scan.extracted && x && (x.status === 'queued' || x.status === 'running')) return x.error ? RETRY_POLL_MS : POLL_MS
  if (scan.analysis?.status === 'pending') return POLL_MS
  return false
}

export function useScans() {
  return useApiQuery(
    endpoints.scans.list,
    {},
    {
      refetchInterval: (q) => {
        const intervals = (q.state.data ?? []).map(pollInterval).filter((v): v is number => v !== false)
        return intervals.length ? Math.min(...intervals) : false
      },
    },
  )
}

export function useScan(id: string, enabled = true) {
  return useApiQuery(endpoints.scans.get, { params: { id } }, { enabled, refetchInterval: (q) => pollInterval(q.state.data) })
}

const STALE_AFTER_SCAN_WRITE = [endpoints.scans.list, endpoints.scans.get, endpoints.scans.schedule, endpoints.body.trend, endpoints.day.events] as const

export function useConfirmScan() {
  return useApiMutation(endpoints.scans.confirm, { invalidates: STALE_AFTER_SCAN_WRITE })
}

export function useReextractScan() {
  return useApiMutation(endpoints.scans.extract, { invalidates: STALE_AFTER_SCAN_WRITE })
}

export function useDiscardScan() {
  return useApiMutation(endpoints.scans.remove, { invalidates: STALE_AFTER_SCAN_WRITE })
}

/** When the next scan is due, as the server has it: a date the coach or a week plan scheduled, else the interval. */
export function useScanSchedule() {
  return useApiQuery(endpoints.scans.schedule, {})
}

export function useScanSettings() {
  return useApiQuery(endpoints.settings.get, {})
}
