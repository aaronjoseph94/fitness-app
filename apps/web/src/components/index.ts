// Owns: the public surface of the visual kit (2a) — cards, stat cards, rings, bars, chips, banners, rows, headers,
// segmented controls, empty states, the loading/error card for a read, the inline "couldn't load" row, the boundary
// around code loaded on demand, the number field, the proposal shell, the entrance and count-up motion, and the
// number/date formatting every screen shares. Internals live in ./lib. The catalogue with props and examples is
// KIT.md in the 2a design brief.
export { StatCard, type StatCardProps, type StatDelta } from './lib/StatCard'
export { MetricCard, type MetricCardProps } from './lib/MetricCard'
export { Reveal, staggerDelay, type RevealProps } from './lib/Reveal'
export { useEntrance, type Entrance } from './lib/useEntrance'
export { CountUp, type CountUpProps } from './lib/CountUp'
export { PageHero, PageHeader, greetingFor, visuallyHidden, type PageHeroProps } from './lib/PageHero'
export { MetricRing, type MetricRingProps } from './lib/MetricRing'
export { RingsRow, type RingsRowProps, type RingItem } from './lib/RingsRow'
export { LegendChips, type LegendChipsProps, type LegendItem, type LegendMark } from './lib/LegendChips'
export { ChartCard, type ChartCardProps } from './lib/ChartCard'
export { SectionHeader, type SectionHeaderProps } from './lib/SectionHeader'
export { Panel, PanelRow, type PanelProps, type PanelRowProps } from './lib/Panel'
export { KeyStat, KeyStatGrid, type KeyStatProps, type KeyStatGridProps } from './lib/KeyStat'
export { ProgressBar, type ProgressBarProps } from './lib/ProgressBar'
export { MiniBars, type MiniBarsProps } from './lib/MiniBars'
export { StatusChip, type StatusChipProps, type StatusChipTone } from './lib/StatusChip'
export { Banner, type BannerProps, type BannerTone } from './lib/Banner'
export { BeforeAfter, BeforeAfterList, type BeforeAfterProps, type BeforeAfterListProps } from './lib/BeforeAfter'
export { ListRow, type ListRowProps } from './lib/ListRow'
export { Segmented, type SegmentedProps, type SegmentedOption } from './lib/Segmented'
export {
  cardSurface,
  panelSurface,
  dashedSurface,
  highlightSurface,
  wellSurface,
  outlinedIconButton,
  tabularNums,
} from './lib/surfaces'
export { Column, Columns, type ColumnProps, type ColumnsProps } from './lib/Board'
export {
  EmptyState,
  ILLUSTRATIONS,
  illustrationUrl,
  type EmptyStateProps,
  type Illustration,
} from './lib/EmptyState'
export { PendingBadge, type PendingBadgeProps } from './lib/PendingBadge'
export { QueryStateCard, isQueryLoading, type QueryStateCardProps } from './lib/QueryStateCard'
export { LoadProblem, NumberField, parseNumber, type NumberFieldProps } from './lib/forms'
export { LoadBoundary, type LoadBoundaryProps } from './lib/LoadBoundary'
export { useSheetDrag, type SheetDrag, type SheetDragHandleProps } from './lib/useSheetDrag'
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
  formatLongDate,
  dateToTime,
  timeToDate,
} from './lib/format'
