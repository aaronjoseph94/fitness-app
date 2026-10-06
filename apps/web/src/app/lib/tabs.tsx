// Owns: the bottom tabs (SPEC §11 navigation, plus Dashboard — see docs/PROGRESS.md) — key, path, nav label, page
// title and icons — in one table.
//
// The icon set is one family, not a sample of one: every tab draws from the same rounded outline weight, so the bar
// reads as a single row rather than six unrelated glyphs. Inactive destinations take the outlined cut and the active
// one the filled, rounded cut, which is the one weight difference the pair is there to carry (the tab also darkens
// its ink and keeps `aria-current`, so colour is never the only signal).
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import InsightsOutlined from '@mui/icons-material/InsightsOutlined'
import InsightsRounded from '@mui/icons-material/InsightsRounded'
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined'
import RestaurantRounded from '@mui/icons-material/RestaurantRounded'
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined'
import SpaceDashboardRounded from '@mui/icons-material/SpaceDashboardRounded'
import TodayOutlined from '@mui/icons-material/TodayOutlined'
import TodayRounded from '@mui/icons-material/TodayRounded'
import type SvgIcon from '@mui/material/SvgIcon'
import type { TabKey } from '../ui-store'

export interface Tab {
  key: TabKey
  path: string
  /** Short label under the icon. */
  label: string
  /** Title in the top bar. */
  title: string
  Icon: typeof SvgIcon
  ActiveIcon: typeof SvgIcon
}

export const TABS: readonly Tab[] = [
  { key: 'today', path: '/', label: 'Today', title: 'Today', Icon: TodayOutlined, ActiveIcon: TodayRounded },
  {
    key: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    Icon: SpaceDashboardOutlined,
    ActiveIcon: SpaceDashboardRounded,
  },
  { key: 'log', path: '/log', label: 'Log', title: 'Log', Icon: RestaurantOutlined, ActiveIcon: RestaurantRounded },
  { key: 'train', path: '/train', label: 'Train', title: 'Train', Icon: FitnessCenterOutlined, ActiveIcon: FitnessCenterRounded },
  { key: 'progress', path: '/progress', label: 'Progress', title: 'Progress', Icon: InsightsOutlined, ActiveIcon: InsightsRounded },
  { key: 'ai', path: '/ai', label: 'AI', title: 'Ask AI', Icon: AutoAwesomeOutlined, ActiveIcon: AutoAwesomeRounded },
]

export function tabByKey(key: TabKey): Tab {
  const tab = TABS.find((t) => t.key === key)
  if (!tab) throw new Error(`Unknown tab "${key}"`)
  return tab
}
