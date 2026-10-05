// Owns: the quiet sync indicator in the top bar — "Offline" and/or "N pending" while writes wait in the offline queue.
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined'
import Chip from '@mui/material/Chip'
import { useOnline, usePendingWrites } from '../../../offline'

export function SyncStatus() {
  const online = useOnline()
  const pending = usePendingWrites().length
  if (online && pending === 0) return null
  const label = [online ? null : 'Offline', pending > 0 ? `${pending} pending` : null].filter(Boolean).join(' · ')
  return (
    <Chip
      data-testid="sync-status"
      size="small"
      variant="outlined"
      icon={online ? <CloudSyncOutlined /> : <CloudOffOutlined />}
      label={label}
      sx={{ color: 'text.secondary', borderColor: 'divider', '& .MuiChip-icon': { color: 'text.secondary' } }}
    />
  )
}
