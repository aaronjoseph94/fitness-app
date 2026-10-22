// Owns: the public surface of the visual kit (1d "Summit") — the sky hero and the slot a page's header renders into,
// the cream panel, wrapping rows, cards (white, deep-sky, coach), stat cards, rings, capsule gauges, bars, chips and
// glass pills, banners, rows, headers, segmented controls, the window slider, empty states, sideways-scrolling tables,
// the loading/error card for a read, the inline "couldn't load" row, the boundary around code loaded on demand, the
// number field, the proposal shell, the entrance and count-up motion, the keyboard ring for dark surfaces, and the
// number/date/clock formatting every screen shares. Internals live in ./lib. The design is
// docs/design/design_handoff_fitness_1d/README.md; each file's header and prop docs say how to use it.
export { StatCard, deltaTone, type StatCardProps, type StatDelta } from './lib/StatCard'
export { Reveal, staggerDelay, type RevealProps } from './lib/Reveal'
export { useEntrance, type Entrance } from './lib/useEntrance'
export { CountUp, type CountUpProps } from './lib/CountUp'
export { PageHeader, skyControls, visuallyHidden, type PageHeaderProps } from './lib/PageHero'
export { HeroSlotProvider, useHeroSlot, type HeroSlot } from './lib/heroSlot'
export { SkyHero, skyLoop, type SkyHeroProps } from './lib/SkyHero'
export { SummitPanel, type SummitPanelProps } from './lib/SummitPanel'
export { WrapRow, wrapCol, fixedCol, type WrapRowProps } from './lib/WrapRow'
export {
  DeepSkyCard,
  CoachCard,
  deepSkySurface,
  deepSkyWell,
  deepSkyRule,
  type DeepSkyCardProps,
  type CoachCardProps,
} from './lib/SkyCards'
export { CapsuleGauge, CapsuleGaugeRow, sizeContainer, type CapsuleGaugeProps } from './lib/CapsuleGauge'
export { GlassPill, type GlassPillProps } from './lib/GlassPill'
export { TableScroll, type TableScrollProps } from './lib/TableScroll'
export { MetricRing, type MetricRingProps } from './lib/MetricRing'
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
  eyebrow,
  displayTitle,
  skyFocus,
  skyFocusWithin,
} from './lib/surfaces'
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
