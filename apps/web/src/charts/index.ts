// Owns: the public surface of the chart kit — every chart in SPEC §11's inventory. Props are plain data series
// (dates as "YYYY-MM-DD", values in kg / kcal / g / ml / h), never API types, so callers map their data once.
// Every chart takes `width` (fixed px for print, ~700 on the report page) or fills its container, and carries a
// data-testid. Colours come from `tokens` only.
// Recharts is not in any page's bundle: each Recharts surface loads it on demand (./preload, a second entry point)
// inside a slot of its exact size, near the viewport and after the page has painted; <EagerCharts> draws them on the
// first render (the printable report).
export {
  WeightTrendChart,
  type WeightTrendChartProps,
  type WeightPoint,
  type ForecastPoint,
  type WeightMilestone,
} from './lib/WeightTrendChart'
export { WeeklyLossChart, type WeeklyLossChartProps, type WeeklyLossPoint } from './lib/WeeklyLossChart'
export {
  CaloriesChart,
  MacrosChart,
  WaterChart,
  StepsChart,
  type CaloriesChartProps,
  type CaloriesDay,
  type MealSlotKey,
  type MacrosChartProps,
  type MacrosDay,
  type WaterChartProps,
  type WaterDay,
  type StepsChartProps,
  type StepsDay,
} from './lib/DayCharts'
export { SleepChart, type SleepChartProps, type SleepNight } from './lib/SleepChart'
export {
  BodyCompositionChart,
  BodyFatVisceralChart,
  WaistWhrChart,
  type BodyCompositionChartProps,
  type CompositionScan,
  type BodyFatVisceralChartProps,
  type FatScan,
  type WaistWhrChartProps,
  type WaistPoint,
} from './lib/BodyCharts'
export { SegmentalFatChart, type SegmentalFatChartProps, type SegmentFat } from './lib/SegmentalFatChart'
export {
  TrainingVolumeChart,
  StrengthChart,
  WeekPlanVsActualChart,
  type TrainingVolumeChartProps,
  type VolumeGroup,
  type VolumeWeek,
  type StrengthChartProps,
  type StrengthSession,
  type WeekPlanVsActualChartProps,
  type PlanDay,
  type SessionStatus,
} from './lib/TrainingCharts'
export { CalendarHeatmap, type CalendarHeatmapProps, type HeatmapDay } from './lib/CalendarHeatmap'
export { FastingStrip, type FastingStripProps, type FastEntry, type FastStatus } from './lib/FastingStrip'
export { MilestoneTimeline, type MilestoneTimelineProps, type Milestone } from './lib/MilestoneTimeline'
export { Gauge, type GaugeProps, type GaugeBand, type GaugeTone } from './lib/Gauge'
export { Sparkline, type SparklineProps } from './lib/Sparkline'
export { EagerCharts } from './lib/plot'
export { frameHeight } from './lib/frame'
export { preloadCharts } from './preload'
