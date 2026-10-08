// Owns: the Export and restore page (/settings/data) — "Export everything", what the monthly backup keeps, and
// "Restore from export". Both actions need a connection; nothing here goes through the offline queue.
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { PageHeader, Reveal, staggerDelay } from '../../../components'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
import { ExportCard } from './ExportCard'
import { DataCard } from './parts'
import { RestoreCard } from './RestoreCard'

/** 2a's entrance: each card group after the header rises in, a section's stagger apart, in reading order. */
const enter = (i: number) => staggerDelay(i, tokens.motion.stagger.section)

export function DataPage() {
  const online = useOnline()
  return (
    <Stack spacing={`${tokens.rhythm.section}px`} data-testid="data-page">
      <PageHeader title="Export and restore" subtitle="Everything you logged is yours: take it as one zip, or write an export into a fresh instance." />
      {!online && (
        <Alert severity="info" data-testid="data-offline">
          You’re offline. Export and restore need a connection.
        </Alert>
      )}
      <Reveal delay={enter(1)}>
        <ExportCard online={online} />
      </Reveal>
      <Reveal delay={enter(2)}>
        <DataCard
          id="backup"
          title="Monthly backup"
          tone="panel"
          description={
            <>
              On the 1st of every month the server also saves each table as JSON in your private storage (reports/backup/YYYY-MM/), one table every five
              minutes. Photos are not copied there: keep an export for those.
            </>
          }
        />
      </Reveal>
      <Reveal delay={enter(3)}>
        <RestoreCard online={online} />
      </Reveal>
    </Stack>
  )
}
