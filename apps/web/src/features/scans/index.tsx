// Owns: the Evolt scan pages — list (/scans) and one scan (/scans/:id) (SPEC §8). Placeholders until the scans work
// package replaces them.
import { useParams } from 'react-router'
import { PhasePlaceholder } from '../../app/placeholder'

export function ScansPage() {
  return (
    <PhasePlaceholder title="Scans" phase={4}>
      Every Evolt 360 scan with fat, lean and segment changes.
    </PhasePlaceholder>
  )
}

export function ScanPage() {
  const { id } = useParams()
  return (
    <PhasePlaceholder title="Scan" phase={4}>
      Scan {id}: body fat, visceral level, segmental fat change and the scan debrief.
    </PhasePlaceholder>
  )
}
