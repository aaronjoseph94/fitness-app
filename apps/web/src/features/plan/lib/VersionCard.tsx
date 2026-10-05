// Owns: one plan version on the history page — version number, the active badge, who made it and when, its reason, the
// diff it made (from → to per field), its forecast — and "Restore", which confirms first by showing what would change
// from the active targets, then POST /api/plan/versions/:id/restore (a new version copying this one; append-only).
import RestoreRounded from '@mui/icons-material/RestoreRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { endpoints } from '@fitness/shared/api'
import type { PlanVersion } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, useApiMutation } from '../../../api'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
import { formatDateTime } from '../../quick-log'
import { actorLabel, diffRows, forecastText, targetsDiff, type DiffRow } from './plan-view'

/** What a restore makes stale: the plan, the versions list, the day (targets) and the event feed. */
const RESTORE_REFRESHES = [endpoints.plan.versions, endpoints.plan.get, endpoints.day.get, endpoints.day.range, endpoints.day.events]

interface VersionCardProps {
  version: PlanVersion
  active: PlanVersion | null
  onRestored: (created: PlanVersion) => void
}

export function VersionCard({ version, active, onRestored }: VersionCardProps) {
  const [confirming, setConfirming] = useState(false)
  const rows = diffRows(version.diff)
  return (
    <Card component="article" data-testid="plan-version" data-active={version.active} sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component="h3" sx={{ m: 0, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading }}>
          Version {version.version}
        </Box>
        {version.active && (
          <Box
            component="span"
            data-testid="active-badge"
            sx={{
              px: 2,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: tokens.radius.chip,
              fontSize: tokens.font.size.caption,
              fontWeight: tokens.font.weight.label,
              color: tokens.ink.card,
              bgcolor: tokens.status.good,
            }}
          >
            Active
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatDateTime(version.created_at)}</Box>
      </Box>
      <Box sx={{ mt: 1, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
        By {actorLabel(version.created_by)}
        {version.reason ? ` · ${version.reason}` : ''}
      </Box>

      {rows.length > 0 ? <DiffList rows={rows} /> : <Box sx={{ mt: 2, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Starting targets, no change.</Box>}

      {version.forecast && (
        <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: tokens.ink.secondary, lineHeight: 1.5 }}>
          <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
            Forecast:{' '}
          </Box>
          {forecastText(version.forecast)}
        </Box>
      )}

      {!version.active && active && (
        <Button variant="outlined" startIcon={<RestoreRounded />} onClick={() => setConfirming(true)} sx={{ mt: 3 }} data-testid="restore-version">
          Restore
        </Button>
      )}
      {confirming && active && <RestoreDialog version={version} active={active} onClose={() => setConfirming(false)} onRestored={onRestored} />}
    </Card>
  )
}

export function DiffList({ rows }: { rows: readonly DiffRow[] }) {
  return (
    <Box component="dl" sx={{ m: 0, mt: 2, borderTop: `1px solid ${tokens.ink.border}` }}>
      {rows.map((r) => (
        <Box key={r.key} sx={{ display: 'flex', alignItems: 'baseline', gap: 2, py: 1.5, borderBottom: `1px solid ${tokens.ink.border}` }}>
          <Box component="dt" sx={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
            {r.label}
          </Box>
          <Box component="dd" sx={{ m: 0, fontSize: tokens.font.size.small, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' }}>
            <Box component="span" sx={{ color: tokens.ink.secondary }}>
              {r.from}
            </Box>
            {' → '}
            <Box component="span" sx={{ fontWeight: tokens.font.weight.heading }}>
              {r.to}
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function RestoreDialog({
  version,
  active,
  onClose,
  onRestored,
}: {
  version: PlanVersion
  active: PlanVersion
  onClose: () => void
  onRestored: (created: PlanVersion) => void
}) {
  const online = useOnline()
  const restore = useApiMutation(endpoints.plan.restoreVersion, { invalidates: RESTORE_REFRESHES })
  const rows = diffRows(targetsDiff(active.targets, version.targets))
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="restore-title">
      <DialogTitle id="restore-title">Restore version {version.version}?</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, lineHeight: 1.5 }}>
          This makes a new version with version {version.version}'s targets. Nothing is deleted; you can restore version {active.version} the same way.
        </Box>
        {rows.length > 0 ? <DiffList rows={rows} /> : <Box sx={{ fontSize: tokens.font.size.small }}>The targets are the same as now.</Box>}
        {!online && <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Restoring needs a connection.</Box>}
        {restore.isError && (
          <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small }}>
            {problemText(restore.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4, gap: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!online || restore.isPending}
          onClick={() =>
            restore.mutate(
              { params: { id: version.id } },
              {
                onSuccess: (outcome) => {
                  if (outcome.status === 'saved') onRestored(outcome.data)
                  onClose()
                },
              },
            )
          }
          data-testid="restore-confirm"
        >
          {restore.isPending ? 'Restoring…' : `Restore version ${version.version}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
