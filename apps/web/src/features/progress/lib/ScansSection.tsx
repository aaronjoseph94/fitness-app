// Owns: the scans section of Progress (SPEC §8 "the Progress tab charts every metric across scans") — a section title
// with a link to the scans page, the scan charts (two across from 900 px) and a tile for every other metric, from
// GET /api/scans (every confirmed scan, whatever the range: scans are a month apart), or an empty state that leads to
// the upload.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useNavigate } from 'react-router'
import { ChartCard, QueryStateCard, SectionHeader } from '../../../components'
import { confirmedScans, ScanCharts, ScanMetricGrid, useScans } from '../../scans/charts'

export function ScansSection() {
  const navigate = useNavigate()
  const scans = useScans()
  const confirmed = scans.data ? confirmedScans(scans.data) : null
  return (
    <Box component="section" aria-labelledby="progress-scans-title">
      <SectionHeader
        id="progress-scans"
        title="Scans"
        subtitle="Body composition across every Evolt scan"
        action={
          <Button size="small" onClick={() => void navigate('/scans')}>
            All scans
          </Button>
        }
      />
      {!confirmed ? (
        <QueryStateCard query={scans} what="the scans" height={220} titleSize="card" />
      ) : confirmed.length === 0 ? (
        <ChartCard
          title="Body composition across scans"
          titleSize="card"
          subtitle="Per Evolt scan"
          empty={{ title: 'No scans yet', body: 'Upload an Evolt sheet and every metric is charted here.', action: { label: 'Go to scans', onClick: () => void navigate('/scans') } }}
          testId="progress-scans"
        />
      ) : (
        <Box data-testid="progress-scans" sx={{ display: 'grid', gap: 4 }}>
          <ScanCharts scans={confirmed} />
          <ScanMetricGrid scans={confirmed} />
        </Box>
      )}
    </Box>
  )
}
