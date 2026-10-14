// Owns: the AI tab's "Waiting for your tap" list — every pending proposal in the live feed (from Ask AI, a split
// day's or the nightly workout draft, or the weekly review) not already shown in the open thread, so Today's "more
// proposals wait in the AI tab" has somewhere to land. Each card says who proposed it (the Coach, the AI clerk), as
// on Today. Also the rest of 2a's right-hand rail: its quiet line when nothing waits, "Recent Train changes" (the
// last 7 days' applied Train changes and split drafts kept over a template, not undone yet, each with its lasting
// one-tap Undo; hidden when there are none) and the "Rails the AI works inside" card.
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, ChatProposal, Proposal } from '@fitness/shared/schemas'
import { useApiQuery } from '../../../api'
import { actorLabel } from '../../proposals'
import { isQueryLoading, QueryStateCard, Reveal, staggerDelay, visuallyHidden } from '../../../components'
import { tokens } from '../../../theme'
import { ProposalItem } from './ProposalItem'
import { useThreadStore } from './thread-store'

const SHOWN = 5

const asChatProposal = (p: Proposal): ChatProposal => ({
  type: 'proposal',
  id: p.id,
  summary: p.summary,
  status: p.proposal_status,
  body: p.body,
})

/** The live feed the rail reads; one query (same key and options) however many parts of the rail read it. */
const useFeed = () =>
  useApiQuery(endpoints.day.events, { query: {} }, { staleTime: 30_000, refetchInterval: 60_000 })

/** The proposals the open thread already shows, under the replies that made them (with their own decision and Undo). */
function useInThread(): ReadonlySet<string> {
  const threadId = useThreadStore((s) => s.threadId)
  const fresh = useThreadStore((s) => s.fresh)
  const thread = useApiQuery(
    endpoints.ai.chatHistory,
    { query: { thread_id: threadId } },
    { enabled: !fresh, staleTime: 60_000 },
  )
  return new Set((thread.data ?? []).flatMap((m) => m.proposals.map((p) => p.id)))
}

/**
 * The proposals waiting for a tap that the open thread is not already showing. Exported so the page can tell whether
 * there is anything to show above a phone's thread.
 */
export function usePendingProposals(): Proposal[] {
  const feed = useFeed()
  const inThread = useInThread()
  return (feed.data?.events ?? [])
    .filter(
      (e): e is Proposal => e.kind === 'proposal' && e.proposal_status === 'pending' && !inThread.has(e.id),
    )
    .reverse()
}

/** How far back "Recent Train changes" reaches, by when the change was applied (the proposal's updated_at). */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Applied and still undoable (POST /api/train-changes/:id/revert): a Train change accepted or applied automatically,
 * or a split draft accepted over a template (`replaced`); neither undone yet (`reverted_at`).
 */
function undoable(e: AiEvent): e is Proposal {
  if (e.kind !== 'proposal') return false
  const b = e.body
  if (b.kind === 'train_change')
    return (
      (e.proposal_status === 'accepted' || e.proposal_status === 'auto_applied') &&
      b.reverted_at === undefined
    )
  return (
    b.kind === 'workout' &&
    e.proposal_status === 'accepted' &&
    b.replaced !== undefined &&
    b.reverted_at === undefined
  )
}

/** The last 7 days' undoable Train changes the open thread is not already showing, newest applied first. */
function useRecentTrainChanges(): Proposal[] {
  const feed = useFeed()
  const inThread = useInThread()
  const now = Date.now()
  return (feed.data?.events ?? [])
    .filter(
      (e): e is Proposal => undoable(e) && now - Date.parse(e.updated_at) <= RECENT_MS && !inThread.has(e.id),
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))
}

const railTitleSx = {
  m: 0,
  flex: 1,
  fontSize: tokens.font.size.body,
  fontWeight: tokens.font.weight.heading,
  lineHeight: tokens.font.leading.label,
  color: tokens.ink.text,
} as const

/** "Waiting for your tap" at 14/600 with the blue count pill. */
function RailTitle({ count }: { count: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Box component="h2" id="ask-ai-pending-title" sx={railTitleSx}>
        Waiting for your tap
      </Box>
      {count > 0 && (
        <Box
          component="span"
          sx={{
            px: '7px',
            py: '1px',
            borderRadius: `${tokens.radius.pill}px`,
            bgcolor: tokens.accent.main,
            color: tokens.dark.text,
            fontSize: tokens.font.size.micro,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.micro,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
          <Box component="span" sx={visuallyHidden}>
            {' '}
            waiting
          </Box>
        </Box>
      )}
    </Box>
  )
}

export function PendingProposals() {
  const pending = usePendingProposals()
  if (pending.length === 0) return null
  return (
    <Box
      component="section"
      aria-labelledby="ask-ai-pending-title"
      data-testid="ask-ai-pending"
      sx={{ display: 'grid', gap: '16px' }}
    >
      <RailTitle count={pending.length} />
      {pending.length > SHOWN && (
        <Box
          sx={{ mt: '-10px', fontSize: tokens.font.size.caption, color: tokens.ink.muted }}
        >{`The newest ${SHOWN} of ${pending.length}.`}</Box>
      )}
      <Box sx={{ display: 'grid', gap: '12px' }}>
        {pending.slice(0, SHOWN).map((p, i) => (
          <Reveal key={p.id} delay={staggerDelay(i, tokens.motion.stagger.section, 150)}>
            <ProposalItem
              proposal={asChatProposal(p)}
              source={`Proposal · ${actorLabel(p.actor)}`}
              when={p.created_at}
            />
          </Reveal>
        ))}
      </Box>
    </Box>
  )
}

/**
 * "Recent Train changes": what the AI changed in Train (or a split draft kept over a template) in the last 7 days and
 * not undone, each card with its Undo, so taking a change back never depends on the chat that made it still being open.
 * Nothing at all when there is none.
 */
export function RecentTrainChanges() {
  const recent = useRecentTrainChanges()
  if (recent.length === 0) return null
  return (
    <Box
      component="section"
      aria-labelledby="ask-ai-recent-title"
      data-testid="recent-train-changes"
      sx={{ display: 'grid', gap: '16px' }}
    >
      <Box>
        <Box component="h2" id="ask-ai-recent-title" sx={railTitleSx}>
          Recent Train changes
        </Box>
        <Box
          sx={{
            mt: '2px',
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.small,
            color: tokens.ink.muted,
          }}
        >
          {recent.length > SHOWN
            ? `The newest ${SHOWN} of ${recent.length} from the last 7 days.`
            : 'From the last 7 days. Undo puts it back as it was.'}
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gap: '12px' }}>
        {recent.slice(0, SHOWN).map((p, i) => (
          <Reveal key={p.id} delay={staggerDelay(i, tokens.motion.stagger.section, 150)}>
            <ProposalItem
              proposal={asChatProposal(p)}
              source={`Proposal · ${actorLabel(p.actor)}`}
              when={p.updated_at}
            />
          </Reveal>
        ))}
      </Box>
    </Box>
  )
}

/**
 * The rail's heading when nothing waits, so the column still says what lands in it — once the feed has said so. While
 * it loads the line is a skeleton, and a feed it could not read claims nothing: offline it says it needs a connection,
 * and a failed read online is the kit's warning banner with Try again.
 */
export function NothingWaiting() {
  const feed = useFeed()
  const offline = feed.fetchStatus === 'paused' || feed.error?.kind === 'network'
  return (
    <Box component="section" aria-labelledby="ask-ai-pending-title">
      <RailTitle count={0} />
      <Box
        sx={{
          mt: '6px',
          fontSize: tokens.font.size.caption,
          lineHeight: tokens.font.leading.small,
          color: tokens.ink.muted,
        }}
      >
        {isQueryLoading(feed) ? (
          <>
            <Skeleton width="90%" />
            <Skeleton width="60%" />
          </>
        ) : feed.data && !feed.isError ? (
          'Nothing right now. What the AI proposes waits here until you accept or reject it.'
        ) : offline ? (
          'Proposals need a connection.'
        ) : (
          <QueryStateCard query={feed} what="proposals" />
        )}
      </Box>
    </Box>
  )
}

/** The `ink.panel` card at the foot of the rail: the rails every proposal is checked against. */
export function RailsCard() {
  return (
    <Box
      sx={{
        px: '14px',
        py: '12px',
        borderRadius: `${tokens.radius.panel}px`,
        border: `1px solid ${tokens.ink.border}`,
        bgcolor: tokens.ink.panel,
        fontSize: tokens.font.size.caption,
        lineHeight: tokens.font.leading.small,
        color: tokens.ink.label,
      }}
    >
      <Box sx={{ mb: '4px', fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
        Rails the AI works inside
      </Box>
      Calorie floor and proposal ceiling · protein and fat minimums · two 24 h fasts a month · machines and
      free weights only. Only you change these, in Settings.
    </Box>
  )
}
