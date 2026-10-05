// Owns: the public surface of the visual kit's building blocks — cards, rings, legends, headers, empty states,
// the proposal shell and the number/date formatting every screen shares. Internals live in ./lib.
export { StatCard, type StatCardProps, type StatDelta } from './lib/StatCard'
export { MetricRing, type MetricRingProps } from './lib/MetricRing'
export { RingsRow, type RingsRowProps, type RingItem } from './lib/RingsRow'
export { LegendChips, type LegendChipsProps, type LegendItem, type LegendMark } from './lib/LegendChips'
export { ChartCard, type ChartCardProps } from './lib/ChartCard'
export { SectionHeader, type SectionHeaderProps } from './lib/SectionHeader'
export {
  EmptyState,
  ILLUSTRATIONS,
  illustrationUrl,
  type EmptyStateProps,
  type Illustration,
} from './lib/EmptyState'
export { PendingBadge, type PendingBadgeProps } from './lib/PendingBadge'
export {
  ProposalCard,
  type ProposalCardProps,
  type ProposalChange,
  type ProposalStatus,
} from './lib/ProposalCard'
export {
  formatNumber,
  formatSigned,
  formatShortDate,
  formatMonth,
  formatWeekday,
  dateToTime,
  timeToDate,
} from './lib/format'
