// Owns: the scan debrief as stored — one ai_events note per analysis run (date = the scan's local date, job_id = the
// scan_analysis job) whose body carries the narrative as `text` plus the scan id, who wrote it, the proposals it made
// and the milestones it re-anchored. The dashboard reads it as a plain note; the scan page reads the rest.
import { Id, ScanMilestoneUpdate } from '@fitness/shared/schemas'
import * as z from 'zod'

export const DebriefNoteBody = z.object({
  text: z.string().min(1),
  scan_id: Id,
  narrative_by: z.enum(['ai', 'engine']),
  proposal_ids: z.array(Id).default([]),
  milestone_updates: z.array(ScanMilestoneUpdate).default([]),
})
export type DebriefNoteBody = z.infer<typeof DebriefNoteBody>

/** Body of the nightly "scan due" note (SPEC §3: remind when a scan is due). */
export const ScanDueNoteBody = z.object({ text: z.string().min(1), flag: z.literal('scan_due'), due: z.iso.date(), last_scan_date: z.iso.date().nullable() })
export type ScanDueNoteBody = z.infer<typeof ScanDueNoteBody>
