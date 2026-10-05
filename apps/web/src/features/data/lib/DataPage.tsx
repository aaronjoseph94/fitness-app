// Owns: the Export and restore page (/settings/data) — "Export everything", what the monthly backup keeps, and
// "Restore from export". Both actions need a connection; nothing here goes through the offline queue.
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { useOnline } from '../../../offline'
import { ExportCard } from './ExportCard'
import { DataCard, Help } from './parts'
import { RestoreCard } from './RestoreCard'

export function DataPage() {
  const online = useOnline()
  return (
    <Stack spacing={4} data-testid="data-page" sx={{ pb: 4 }}>
      {!online && (
        <Alert severity="info" data-testid="data-offline">
          You’re offline. Export and restore need a connection.
        </Alert>
      )}
      <ExportCard online={online} />
      <DataCard id="backup" title="Monthly backup">
        <Help>
          On the 1st of every month the server also saves each table as JSON in your private storage
          (reports/backup/YYYY-MM/), one table every five minutes. Photos are not copied there: keep an export
          for those.
        </Help>
      </DataCard>
      <RestoreCard online={online} />
    </Stack>
  )
}
