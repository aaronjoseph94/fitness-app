// Owns: one plan version on the history page — version number, the active badge, who made it and when, its reason, the
// diff it made (from → to per field), its forecast — and "Restore", which confirms first by showing what would change
// from the active targets, then POST /api/plan/versions/:id/restore (a new version copying this one; append-only).
import RestoreRounded from '@mui/icons-material/RestoreRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { endpoints } from '@fitness/shared/api'
import type { PlanVersion } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, useApiMutation } from '../../../api'
import { BeforeAfterList, cardSurface, highlightSurface, StatusChip, tabularNums } from '../../../components'
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
  const headingId = `plan-version-${version.id}-title`
  return (
    <Box
      component="article"
      aria-labelledby={headingId}
      data-testid="plan-version"
      data-active={version.active}
      sx={{ ...(version.active ? highlightSurface : cardSurface), overflow: 'hidden', minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px 12px', pt: `${tokens.pad.header.top}px`, px: `${tokens.pad.header.x}px`, pb: '12px' }}>
        <Box sx={{ flex: '1 1 0%', minWidth: 'min(200px, 100%)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box component="h3" id={headingId} sx={{ m: 0, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.cardTitle }}>
              Version {version.version}
            </Box>
            {version.active && <StatusChip tone="success" label="Active" testId="active-badge" />}
          </Box>
          <Box sx={{ mt: '3px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, ...tabularNums }}>
            By {actorLabel(version.created_by)} · {formatDateTime(version.created_at)}
          </Box>
        </Box>
        {!version.active && active && (
          <Button variant="outlined" size="small" startIcon={<RestoreRounded />} onClick={() => setConfirming(true)} sx={{ ml: 'auto' }} data-testid="restore-version">
            Restore
          </Button>
        )}
      </Box>

      {version.reason && (
        <Box sx={{ px: `${tokens.pad.card.x}px`, pb: '14px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }}>{version.reason}</Box>
      )}

      {rows.length > 0 ? (
        <DiffTable rows={rows} />
      ) : (
        <Box sx={{ px: `${tokens.pad.card.x}px`, pb: '14px', fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Starting targets, no change.</Box>
      )}

      {version.forecast && (
        <Box sx={{ borderTop: `1px solid ${tokens.ink.border}`, px: `${tokens.pad.card.x}px`, py: '12px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>
          <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
            Forecast:{' '}
          </Box>
          {forecastText(version.forecast)}
        </Box>
      )}

      {confirming && active && <RestoreDialog version={version} active={active} onClose={() => setConfirming(false)} onRestored={onRestored} />}
    </Box>
  )
}

/** Fixed widths for the number columns, so Before / After / Change line up across the stacked version cards. */
const NUMBER_COLUMN = { xs: 112, sm: 128 }

/** A version's diff as a flush table: target, before, after and the signed change. */
function DiffTable({ rows }: { rows: readonly DiffRow[] }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table aria-label="What changed" sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <TableCell>Target</TableCell>
            <TableCell align="right" sx={{ width: NUMBER_COLUMN }}>
              Before
            </TableCell>
            <TableCell align="right" sx={{ width: NUMBER_COLUMN }}>
              After
            </TableCell>
            <TableCell align="right" sx={{ width: NUMBER_COLUMN, display: { xs: 'none', sm: 'table-cell' } }}>
              Change
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell sx={{ fontWeight: tokens.font.weight.label }}>{r.label}</TableCell>
              <TableCell align="right" sx={{ color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>
                {r.from}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}>
                {r.to}
              </TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, color: tokens.ink.secondary }}>
                {r.delta ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

/** What a restore would change, as the kit's before → after rows (the confirm dialog). */
export function DiffList({ rows }: { rows: readonly DiffRow[] }) {
  return <BeforeAfterList changes={rows.map((r) => ({ label: r.label, from: r.from, to: r.to }))} />
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
        <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: tokens.font.leading.small }}>
          This makes a new version with version {version.version}'s targets. Nothing is deleted; you can restore version {active.version} the same way.
        </Box>
        {rows.length > 0 ? <DiffList rows={rows} /> : <Box sx={{ fontSize: tokens.font.size.small }}>The targets are the same as now.</Box>}
        {!online && <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Restoring needs a connection.</Box>}
        {restore.isError && (
          <Box role="alert" sx={{ color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
            {problemText(restore.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
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
