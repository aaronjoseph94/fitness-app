// Owns: the scans section of Progress (SPEC §8 "the Progress tab charts every metric across scans") — the scan charts
// in compact form from GET /api/scans (every confirmed scan, whatever the range: scans are a month apart), a link to
// the scans page, and an empty state that leads to the upload.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useNavigate } from 'react-router'
import { ChartCard } from '../../../components'
import { confirmedScans, ScanCharts, useScans } from '../../scans/charts'
import { ChartSkeleton, ErrorCard, isLoading } from './states'

export function ScansSection() {
  const navigate = useNavigate()
  const scans = useScans()
  const all = <Button size="small" onClick={() => void navigate('/scans')}>All scans</Button>
  if (isLoading(scans)) return <ChartSkeleton height={220} />
  if (!scans.data) return <ErrorCard query={scans} what="the scans" />
  const confirmed = confirmedScans(scans.data)
  if (confirmed.length === 0)
    return (
      <ChartCard
        title="Body composition across scans"
        subtitle="Fat and lean mass, body fat % and visceral level per Evolt scan"
        empty={{ title: 'No scans yet', body: 'Upload an Evolt sheet and every metric is charted here.', illustration: null, action: { label: 'Go to scans', onClick: () => void navigate('/scans') } }}
        testId="progress-scans"
      />
    )
  return (
    <Box data-testid="progress-scans" sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: -1 }}>{all}</Box>
      <ScanCharts scans={confirmed} compact />
    </Box>
  )
}
