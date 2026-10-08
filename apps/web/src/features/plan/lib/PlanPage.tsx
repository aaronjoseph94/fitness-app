// Owns: the plan history page (/plan; GLOSSARY "Plan version", "Proposal", "Guard") — the active targets and the rails
// they live inside, pending proposals with Accept / Reject and each change re-checked against the rails, the guards'
// verdicts (what was held back and why), and every plan version newest first with its diff, forecast and Restore.
// Reads GET /api/plan/versions, /api/events (latest page) and /api/settings. Deciding and restoring need a connection.
import LockRounded from '@mui/icons-material/LockRounded'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, PlanVersion, Proposal, Rails } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call, useApiQuery } from '../../../api'
import {
  cardSurface,
  formatNumber,
  KeyStat,
  KeyStatGrid,
  LoadProblem,
  PageHeader,
  Panel,
  ProposalCard,
  Reveal,
  SectionHeader,
  staggerDelay,
  statValue,
  tabularNums,
} from '../../../components'
import { tokens } from '../../../theme'
import { planChangeRows, useProposalDecision } from '../../proposals'
import { formatDateTime } from '../../quick-log'
import { actorLabel, DEFAULT_ROWS, FIELD, guardLines, isGuardNote, overrideRows, railsText } from './plan-view'
import { VersionCard } from './VersionCard'

/** 2a's entrance: each card group after the header rises in, a section's stagger apart, in reading order. */
const enter = (i: number) => staggerDelay(i, tokens.motion.stagger.section)

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
    <Stack spacing={`${tokens.rhythm.section}px`} data-testid="plan-page">
      <PageHeader
        title="Plan history"
        subtitle={
          active
            ? `Version ${active.version} is active · ${list.length} ${list.length === 1 ? 'version' : 'versions'}, each with its reason, diff and forecast`
            : 'Every change to your targets, with its reason, diff and forecast'
        }
      />

      {versions.isLoading ? (
        <Skeleton variant="rounded" height={236} />
      ) : active ? (
        <Reveal delay={enter(1)}>
          <ActiveTargets active={active} rails={rails} />
        </Reveal>
      ) : versions.error ? (
        <LoadProblem what="The plan" error={versions.error} onRetry={() => void versions.refetch()} />
      ) : null}

      {pending.length > 0 && (
        <Reveal delay={enter(2)}>
          <section aria-labelledby="plan-waiting-title">
            <SectionHeader id="plan-waiting" title="Waiting for you" subtitle="Nothing changes until you accept. The rails are checked again when you do." />
            <Stack spacing={4}>
              {pending.map((p) => (
                <PendingProposal key={p.id} proposal={p} active={active} rails={rails} autoApplySafe={settings.data?.settings.auto_apply_safe ?? false} onDecided={setNotice} />
              ))}
            </Stack>
          </section>
        </Reveal>
      )}

      {verdicts.length > 0 && (
        <Reveal delay={enter(3)}>
          <section aria-labelledby="plan-held-title">
            <SectionHeader id="plan-held" title="Held back by the rails" subtitle="Changes the guards dropped before they reached you." />
            <Box sx={{ ...cardSurface, overflow: 'hidden' }} data-testid="guard-verdicts">
              {verdicts.map((note) => (
                <GuardVerdict key={note.id} note={note} />
              ))}
            </Box>
          </section>
        </Reveal>
      )}

      <Reveal delay={enter(4)}>
        <section aria-labelledby="plan-versions-title">
          <SectionHeader id="plan-versions" title="Versions" subtitle="Newest first. Restoring makes a new version; nothing is ever deleted." />
          {versions.isLoading ? (
            <Stack spacing={4}>
              <Skeleton variant="rounded" height={160} />
              <Skeleton variant="rounded" height={160} />
            </Stack>
          ) : versions.error && list.length === 0 ? (
            <LoadProblem what="Plan versions" error={versions.error} onRetry={() => void versions.refetch()} />
          ) : (
            <Stack spacing={4}>
              {list.map((v) => (
                <VersionCard key={v.id} version={v} active={active} onRestored={(created) => setNotice(`Restored as version ${created.version}.`)} />
              ))}
            </Stack>
          )}
        </section>
      </Reveal>

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
  const fields = DEFAULT_ROWS.filter((f) => f !== 'kcal')
  return (
    <Panel
      id="active-targets"
      title="Daily targets"
      description={`Version ${active.version} · by ${actorLabel(active.created_by)} · ${formatDateTime(active.created_at)}`}
      padding="none"
      testId="active-targets"
      footer={
        rails && (
          <Box
            data-testid="rails-line"
            sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', px: `${tokens.pad.card.x}px`, py: '12px', bgcolor: tokens.ink.panel, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}
          >
            <LockRounded aria-hidden sx={{ fontSize: 16, mt: '1px', color: tokens.ink.faint, flex: 'none' }} />
            <Box sx={{ minWidth: 0 }}>
              <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
                Rails:{' '}
              </Box>
              {railsText(rails)}.{' '}
              {/* Vertical padding on an inline link grows its touch target to 44 px without changing the line's height. */}
              <Link component={RouterLink} to="/settings" underline="hover" sx={{ py: '14px', fontWeight: tokens.font.weight.label }}>
                Only you change them, in Settings
              </Link>
              .
            </Box>
          </Box>
        )
      }
    >
      <Box sx={{ px: `${tokens.pad.card.x}px`, pb: '16px', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '8px', rowGap: '4px' }}>
        <Box sx={{ ...statValue('standard'), lineHeight: 1.1, color: tokens.ink.text }}>
          {formatNumber(active.targets.defaults.kcal)}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>kcal a day</Box>
        {overrides.length > 0 && (
          <Box sx={{ flexBasis: '100%', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>
            {overrides.map((o) => `${o.label}: ${o.value}`).join(' · ')}
          </Box>
        )}
      </Box>
      <KeyStatGrid columns={fields.length} ruleAbove>
        {fields.map((field) => (
          <KeyStat key={field} label={FIELD[field].label} value={active.targets.defaults[field]} unit={active.targets.defaults[field] === null ? undefined : FIELD[field].unit} />
        ))}
      </KeyStatGrid>
    </Panel>
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
  const d = useProposalDecision(
    proposal.proposal_status,
    (decision) => call(decision === 'accepted' ? endpoints.plan.acceptProposal : endpoints.plan.rejectProposal, { params: { id: proposal.id } }),
    (decision, result) => {
      if (decision === 'rejected') onDecided('Proposal rejected. Nothing changed.')
      else if (result.plan_version) onDecided(`Accepted: now version ${result.plan_version.version}.`)
      else onDecided('The rails held this back when it was re-checked; nothing changed. See "Held back by the rails".')
    },
  )
  if (proposal.body.kind !== 'plan_change') return null
  const changes = proposal.body.changes
  const lines = active && rails ? guardLines(changes, { actor: proposal.actor, rails, plan: active.targets, autoApplySafe }) : []

  return (
    <ProposalCard
      testId="plan-proposal"
      title={proposal.summary}
      source={`Proposal · ${actorLabel(proposal.actor)} · ${formatDateTime(proposal.created_at)}`}
      summary={[...new Set(changes.map((c) => c.reason))].join(' ')}
      changes={planChangeRows(changes)}
      status={d.status}
      busy={d.busy}
      onAccept={d.onAccept}
      onReject={d.onReject}
    >
      <Box sx={{ display: 'grid', gap: 2 }}>
        {lines.length > 0 && (
          <Box component="ul" aria-label="Rails check" data-testid="guard-lines" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {lines.map((l) => (
              <Box component="li" key={l.key} sx={{ display: 'flex', gap: 2, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small }}>
                <Box aria-hidden sx={{ width: 6, height: 6, mt: '7px', flex: 'none', borderRadius: `${tokens.radius.pill}px`, bgcolor: l.ok ? tokens.tone.success.solid : tokens.tone.danger.text }} />
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
        {d.notes}
      </Box>
    </ProposalCard>
  )
}

function GuardVerdict({ note }: { note: Extract<AiEvent, { kind: 'note' }> }) {
  const [head, ...rest] = note.summary.split(': ')
  const reasons = rest.join(': ').split('; ').filter(Boolean)
  return (
    <Box sx={{ px: `${tokens.pad.card.x}px`, py: '12px', '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 3, rowGap: '2px' }}>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>
          {head}
          <Box component="span" sx={{ fontWeight: tokens.font.weight.body, color: tokens.ink.secondary }}>
            {' '}
            · {actorLabel(note.actor)}
          </Box>
        </Box>
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, whiteSpace: 'nowrap', ...tabularNums }}>{formatDateTime(note.created_at)}</Box>
      </Box>
      <Box component="ul" sx={{ m: 0, mt: '4px', pl: '18px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }}>
        {(reasons.length > 0 ? reasons : [note.body.text]).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </Box>
    </Box>
  )
}
