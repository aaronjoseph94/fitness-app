// Owns: proposals as every card shows them (SPEC §6, §8; GLOSSARY "Proposal") — the shared labels (targets, weekdays,
// reminders, who proposed), a plan change's rows with its weekdays folded ("Protein · Mon–Thu") and its title rule (the
// summary up to PROPOSAL_TITLE_MAX characters, else the change's title), the title, rows and "Why:" of a Train change
// ("Rename Upper A → Push": its summary, else built here) or of new training days, a goal change's title, "now" line and
// rows ("Summit: 88 kg by Mar 31"), and the decide-with-rollback hook behind Accept / Reject on Today, the AI tab and
// the plan page. The Worker decides per kind (POST /api/proposals/:id/accept|reject); this module only shows and sends.
export {
  TARGET_FIELD,
  REMINDER_LABEL,
  actorLabel,
  targetAmount,
  targetLabel,
  planChangeRows,
  planChangeTitle,
  planChangeHeading,
  PROPOSAL_TITLE_MAX,
} from './lib/labels'
export { trainBodyView } from './lib/train-change'
export { goalChangeView, type GoalChangeView } from './lib/goal-change'
export { useProposalDecision, type Decision } from './lib/decision'
