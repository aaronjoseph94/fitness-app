// Owns: the five bottom tabs (SPEC §11 navigation) — key, path, nav label, page title and icons — in one table.
import AutoAwesome from '@mui/icons-material/AutoAwesome'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import EditNote from '@mui/icons-material/EditNote'
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import FitnessCenter from '@mui/icons-material/FitnessCenter'
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined'
import Insights from '@mui/icons-material/Insights'
import InsightsOutlined from '@mui/icons-material/InsightsOutlined'
import Today from '@mui/icons-material/Today'
import TodayOutlined from '@mui/icons-material/TodayOutlined'
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
  { key: 'today', path: '/', label: 'Today', title: 'Today', Icon: TodayOutlined, ActiveIcon: Today },
  { key: 'log', path: '/log', label: 'Log', title: 'Log', Icon: EditNoteOutlined, ActiveIcon: EditNote },
  { key: 'train', path: '/train', label: 'Train', title: 'Train', Icon: FitnessCenterOutlined, ActiveIcon: FitnessCenter },
  { key: 'progress', path: '/progress', label: 'Progress', title: 'Progress', Icon: InsightsOutlined, ActiveIcon: Insights },
  { key: 'ai', path: '/ai', label: 'AI', title: 'Ask AI', Icon: AutoAwesomeOutlined, ActiveIcon: AutoAwesome },
]

export function tabByKey(key: TabKey): Tab {
  const tab = TABS.find((t) => t.key === key)
  if (!tab) throw new Error(`Unknown tab "${key}"`)
  return tab
}
