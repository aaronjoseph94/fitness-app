// Owns: the plan history page (/plan; GLOSSARY "Plan version", "Proposal", "Guard") — the active targets and the rails
// they live inside, pending proposals with Accept / Reject and each change re-checked against the rails, the guards'
// verdicts (what was held back and why), and every plan version newest first with its diff, forecast and Restore.
// Reads GET /api/plan/versions, /api/events (latest page) and /api/settings. Deciding and restoring need a connection.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, PlanVersion, Proposal, Rails } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useApiMutation, useApiQuery } from '../../../api'
import { ProposalCard, SectionHeader } from '../../../components'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
import { formatDateTime, LoadProblem, problemText } from '../../quick-log'
import { actorLabel, amount, changeRows, DEFAULT_ROWS, FIELD, guardLines, isGuardNote, overrideRows, railsText } from './plan-view'
import { VersionCard } from './VersionCard'

/** What deciding a proposal makes stale. */
const DECISION_REFRESHES = [endpoints.plan.versions, endpoints.plan.get, endpoints.day.get, endpoints.day.range, endpoints.day.events]

export function PlanPage() {
  const versions = useApiQuery(endpoints.plan.versions, {})
  const events = useApiQuery(endpoints.day.events, { query: {} }, { refetchInterval: 30_000 })
  const settings = useApiQuery(endpoints.settings.get, {}, { staleTime: 5 * 60_000 })
  const [notice, setNotice] = useState<string | null>(null)

  const list = versions.data ?? []
  const active = list.find((v) => v.active) ?? null
  const feed = events.data?.events ?? []
  const pending = feed.filter((e): e is Proposal => e.kind === 'proposal' && e.proposal_status === 'pending' && e.body.kind === 'plan_change')
  const verdicts = feed.filter(isGuardNote)
  const rails: Rails | null = settings.data?.settings ?? null

  return (
    <Stack spacing={5} data-testid="plan-page">
      <Box sx={{ fontSize: 15, color: tokens.ink.secondary, lineHeight: 1.5 }}>
        Every change to your targets is a version with a reason. Proposals from the AI or the Coach wait here for a tap, and the
        rails decide what can't be proposed at all.
      </Box>

      <section>
        <SectionHeader title="Now" />
        {versions.isLoading ? (
          <Skeleton variant="rounded" height={180} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        ) : active ? (
          <ActiveTargets active={active} rails={rails} />
        ) : versions.error ? (
          <LoadProblem what="The plan" error={versions.error} onRetry={() => void versions.refetch()} />
        ) : null}
      </section>

      {pending.length > 0 && (
        <section>
          <SectionHeader title="Waiting for you" subtitle="Nothing changes until you accept. The rails are checked again when you do." />
          <Stack spacing={3}>
            {pending.map((p) => (
              <PendingProposal key={p.id} proposal={p} active={active} rails={rails} autoApplySafe={settings.data?.settings.auto_apply_safe ?? false} onDecided={setNotice} />
            ))}
          </Stack>
        </section>
      )}

      {verdicts.length > 0 && (
        <section>
          <SectionHeader title="Held back by the rails" subtitle="Changes the guards dropped before they reached you." />
          <Card sx={{ px: 4, py: 1 }} data-testid="guard-verdicts">
            {verdicts.map((note) => (
              <GuardVerdict key={note.id} note={note} />
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="Versions" subtitle="Newest first. Restoring makes a new version; nothing is ever deleted." />
        {versions.isLoading ? (
          <Stack spacing={3}>
            <Skeleton variant="rounded" height={140} sx={{ borderRadius: `${tokens.radius.card}px` }} />
            <Skeleton variant="rounded" height={140} sx={{ borderRadius: `${tokens.radius.card}px` }} />
          </Stack>
        ) : versions.error && list.length === 0 ? (
          <LoadProblem what="Plan versions" error={versions.error} onRetry={() => void versions.refetch()} />
        ) : (
          <Stack spacing={3}>
            {list.map((v) => (
              <VersionCard key={v.id} version={v} active={active} onRestored={(created) => setNotice(`Restored as version ${created.version}.`)} />
            ))}
          </Stack>
        )}
      </section>

      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Stack>
  )
}

function ActiveTargets({ active, rails }: { active: PlanVersion; rails: Rails | null }) {
  const overrides = overrideRows(active.targets)
  return (
    <Card sx={{ p: 4 }} data-testid="active-targets">
      <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
        Daily targets · version {active.version}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 1 }}>
        <Box sx={{ fontSize: tokens.font.size.bigNumberSmall, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', color: tokens.metric.calories }}>
          {amount('kcal', active.targets.defaults.kcal).replace(' kcal', '')}
        </Box>
        <Box sx={{ fontSize: 15, color: tokens.ink.secondary }}>kcal a day</Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 2, mt: 2 }}>
        {DEFAULT_ROWS.filter((f) => f !== 'kcal').map((field) => (
          <Box key={field} sx={{ fontSize: 14 }}>
            <Box component="span" sx={{ color: tokens.ink.secondary }}>
              {FIELD[field].label}{' '}
            </Box>
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: tokens.font.weight.label }}>
              {amount(field, active.targets.defaults[field])}
            </Box>
          </Box>
        ))}
      </Box>
      {overrides.length > 0 && (
        <Box sx={{ mt: 2, fontSize: 13, color: tokens.ink.secondary }}>
          {overrides.map((o) => `${o.label}: ${o.value}`).join(' · ')}
        </Box>
      )}
      {rails && (
        <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${tokens.ink.border}`, fontSize: 13, color: tokens.ink.secondary, lineHeight: 1.5 }} data-testid="rails-line">
          <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
            Rails:{' '}
          </Box>
          {railsText(rails)}.{' '}
          <Link component={RouterLink} to="/settings" color="inherit" underline="always">
            Only you change them, in Settings
          </Link>
          .
        </Box>
      )}
    </Card>
  )
}

function PendingProposal({
  proposal,
  active,
  rails,
  autoApplySafe,
  onDecided,
}: {
  proposal: Proposal
  active: PlanVersion | null
  rails: Rails | null
  autoApplySafe: boolean
  onDecided: (message: string) => void
}) {
  const online = useOnline()
  const [error, setError] = useState<string | null>(null)
  const settle = {
    invalidates: DECISION_REFRESHES,
    onError: (e: Error) => setError(problemText(e)),
  }
  const accept = useApiMutation(endpoints.plan.acceptProposal, settle)
  const reject = useApiMutation(endpoints.plan.rejectProposal, settle)
  if (proposal.body.kind !== 'plan_change') return null
  const changes = proposal.body.changes
  const lines = active && rails ? guardLines(changes, { actor: proposal.actor, rails, plan: active.targets, autoApplySafe }) : []
  const busy = accept.isPending || reject.isPending

  const decide = (kind: 'accept' | 'reject') => {
    setError(null)
    ;(kind === 'accept' ? accept : reject).mutate(
      { params: { id: proposal.id } },
      {
        onSuccess: (outcome) => {
          if (outcome.status !== 'saved') return
          const d = outcome.data
          if (kind === 'reject') onDecided('Proposal rejected. Nothing changed.')
          else if (d.plan_version) onDecided(`Accepted: now version ${d.plan_version.version}.`)
          else onDecided('The rails held this back when it was re-checked; nothing changed. See "Held back by the rails".')
        },
      },
    )
  }

  return (
    <ProposalCard
      testId="plan-proposal"
      title={proposal.summary}
      source={`Proposal · ${actorLabel(proposal.actor)} · ${formatDateTime(proposal.created_at)}`}
      summary={[...new Set(changes.map((c) => c.reason))].join(' ')}
      changes={changeRows(changes).map((r) => ({ label: r.label, from: r.from, to: r.to }))}
      status={proposal.proposal_status}
      busy={busy || !online}
      onAccept={online ? () => decide('accept') : undefined}
      onReject={online ? () => decide('reject') : undefined}
    >
      <Box sx={{ display: 'grid', gap: 2 }}>
        {lines.length > 0 && (
          <Box component="ul" aria-label="Rails check" data-testid="guard-lines" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {lines.map((l) => (
              <Box component="li" key={l.key} sx={{ display: 'flex', gap: 2, fontSize: 13, lineHeight: 1.45 }}>
                <Box aria-hidden sx={{ width: 8, height: 8, mt: 0.75, flex: 'none', borderRadius: tokens.radius.chip, bgcolor: l.ok ? tokens.status.good : tokens.status.flag }} />
                <Box>
                  <Box component="span" sx={{ fontWeight: tokens.font.weight.label }}>
                    {l.label}:
                  </Box>{' '}
                  <Box component="span" sx={{ color: tokens.ink.secondary }}>
                    {l.ok ? l.detail : `would be held back: ${l.detail}`}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {!online && <Box sx={{ fontSize: 13, color: tokens.ink.secondary }}>Deciding needs a connection; it will wait here.</Box>}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Box>
    </ProposalCard>
  )
}

function GuardVerdict({ note }: { note: Extract<AiEvent, { kind: 'note' }> }) {
  const [head, ...rest] = note.summary.split(': ')
  const reasons = rest.join(': ').split('; ').filter(Boolean)
  return (
    <Box sx={{ py: 3, borderBottom: `1px solid ${tokens.ink.border}`, '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', gap: 2, fontSize: 13, color: tokens.ink.secondary }}>
        <Box sx={{ flex: 1 }}>
          {head} · {actorLabel(note.actor)}
        </Box>
        <Box sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(note.created_at)}</Box>
      </Box>
      <Box component="ul" sx={{ m: 0, mt: 1, pl: 5, fontSize: 14, lineHeight: 1.5 }}>
        {(reasons.length > 0 ? reasons : [note.body.text]).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </Box>
    </Box>
  )
}
