// Owns: the public surface of the visual kit (2a) — cards, stat cards, rings, bars, chips, banners, rows, headers,
// segmented controls, the window slider, empty states, the loading/error card for a read, the inline "couldn't load"
// row, the boundary around code loaded on demand, the number field, the proposal shell, the entrance and count-up
// motion, and the number/date/clock formatting every screen shares. Internals live in ./lib. The design is "Components
// (the kit)" in docs/design/design_handoff_fitness_2a/README.md; each file's header and prop docs say how to use it.
export { StatCard, deltaTone, type StatCardProps, type StatDelta } from './lib/StatCard'
export { Reveal, staggerDelay, type RevealProps } from './lib/Reveal'
export { useEntrance, type Entrance } from './lib/useEntrance'
export { CountUp, type CountUpProps } from './lib/CountUp'
export { PageHeader, greetingFor, visuallyHidden, type PageHeaderProps } from './lib/PageHero'
export { MetricRing, type MetricRingProps } from './lib/MetricRing'
export { RingsRow, type RingsRowProps, type RingItem } from './lib/RingsRow'
export { LegendChips, type LegendChipsProps, type LegendItem, type LegendMark } from './lib/LegendChips'
export { ChartCard, type ChartCardProps } from './lib/ChartCard'
export { SectionHeader, type SectionHeaderProps } from './lib/SectionHeader'
export { Panel, PanelRow, type PanelProps, type PanelRowProps } from './lib/Panel'
export { KeyStat, KeyStatGrid, type KeyStatProps, type KeyStatGridProps } from './lib/KeyStat'
export { ProgressBar, type ProgressBarProps } from './lib/ProgressBar'
export { MeterRow, type MeterRowProps } from './lib/MeterRow'
export { WindowSlider, type WindowSliderProps } from './lib/WindowSlider'
export { MiniBars, type MiniBarsProps } from './lib/MiniBars'
export { StatusChip, type StatusChipProps, type StatusChipTone } from './lib/StatusChip'
export { Banner, type BannerProps, type BannerTone } from './lib/Banner'
export { BeforeAfterList, type BeforeAfterListProps } from './lib/BeforeAfter'
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
  statValue,
} from './lib/surfaces'
export { Column, Columns, type ColumnProps, type ColumnsProps } from './lib/Board'
export { EmptyState, type EmptyStateProps } from './lib/EmptyState'
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
  formatDayRange,
  formatMonth,
  formatWeekday,
  formatLongDate,
  formatClock,
  formatRecentTime,
  formatClockTime,
  dateToTime,
  timeToDate,
} from './lib/format'
