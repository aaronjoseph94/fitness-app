// Owns: proposals as every card shows them (SPEC §6, §8; GLOSSARY "Proposal") — the shared labels (targets, weekdays,
// reminders, who proposed), a plan change's rows with its weekdays folded ("Protein · Mon–Thu") and its title rule (the
// summary up to PROPOSAL_TITLE_MAX characters, else the change's title), and the decide-with-rollback hook behind
// Accept / Reject on Today, the AI tab and the plan page. The Worker decides per kind (POST
// /api/proposals/:id/accept|reject); this module only shows and sends.
export {
  TARGET_FIELD,
  WEEKDAY_LABEL,
  REMINDER_LABEL,
  actorLabel,
  targetAmount,
  targetLabel,
  planChangeRows,
  planChangeTitle,
  planChangeHeading,
  PROPOSAL_TITLE_MAX,
} from './lib/labels'
export { useProposalDecision, type Decision, type ProposalDecision } from './lib/decision'
