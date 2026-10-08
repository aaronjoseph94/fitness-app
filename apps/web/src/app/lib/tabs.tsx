// Owns: the app's navigation destinations in one table each — the six bottom tabs (SPEC §11 navigation, plus
// Dashboard — see docs/PROGRESS.md: key, path, nav label, page title and icons), and the desktop sidebar's "Body"
// group and Settings link, which a phone reaches from the pages instead.
//
// The icon set is one family, not a sample of one: every destination draws from the same rounded outline weight, so a
// nav reads as a single column rather than unrelated glyphs. Inactive destinations take the outlined cut and the
// active one the filled, rounded cut, which is the one weight difference the pair is there to carry (the item also
// darkens its ink and keeps `aria-current`, so colour is never the only signal).
import AccessibilityNewOutlined from '@mui/icons-material/AccessibilityNewOutlined'
import AccessibilityNewRounded from '@mui/icons-material/AccessibilityNewRounded'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import HistoryRounded from '@mui/icons-material/HistoryRounded'
import InsightsOutlined from '@mui/icons-material/InsightsOutlined'
import InsightsRounded from '@mui/icons-material/InsightsRounded'
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined'
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded'
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined'
import RestaurantRounded from '@mui/icons-material/RestaurantRounded'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import SettingsRounded from '@mui/icons-material/SettingsRounded'
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined'
import SpaceDashboardRounded from '@mui/icons-material/SpaceDashboardRounded'
import TodayOutlined from '@mui/icons-material/TodayOutlined'
import TodayRounded from '@mui/icons-material/TodayRounded'
import type SvgIcon from '@mui/material/SvgIcon'
import type { TabKey } from '../ui-store'

/** A place the navigation links to, with its outlined (inactive) and filled (active) glyph. */
export interface Destination {
  path: string
  /** The page's name: the sidebar label and the page title. */
  title: string
  Icon: typeof SvgIcon
  ActiveIcon: typeof SvgIcon
  /** The sidebar item's test id. */
  testId: string
}

export interface Tab extends Destination {
  key: TabKey
  /** Short label under the icon in the bottom tabs. */
  label: string
}

const tab = (
  key: TabKey,
  path: string,
  title: string,
  label: string,
  Icon: typeof SvgIcon,
  ActiveIcon: typeof SvgIcon,
): Tab => ({
  key,
  path,
  title,
  label,
  Icon,
  ActiveIcon,
  testId: `rail-${key}`,
})

export const TABS: readonly Tab[] = [
  tab('today', '/', 'Today', 'Today', TodayOutlined, TodayRounded),
  tab('dashboard', '/dashboard', 'Dashboard', 'Dashboard', SpaceDashboardOutlined, SpaceDashboardRounded),
  tab('log', '/log', 'Log', 'Log', RestaurantOutlined, RestaurantRounded),
  tab('train', '/train', 'Train', 'Train', FitnessCenterOutlined, FitnessCenterRounded),
  tab('progress', '/progress', 'Progress', 'Progress', InsightsOutlined, InsightsRounded),
  tab('ai', '/ai', 'Ask AI', 'AI', AutoAwesomeOutlined, AutoAwesomeRounded),
]

/**
 * The sidebar's "Body" group. 2a also draws "Weekly reports" here, but the app has no page that lists them (a report
 * lives at /reports/week/:week, reached from Progress and Today), so there is nothing for the item to open.
 */
export const BODY_DESTINATIONS: readonly Destination[] = [
  {
    path: '/scans',
    title: 'Scans',
    Icon: AccessibilityNewOutlined,
    ActiveIcon: AccessibilityNewRounded,
    testId: 'rail-scans',
  },
  {
    path: '/photos',
    title: 'Photos',
    Icon: PhotoLibraryOutlined,
    ActiveIcon: PhotoLibraryRounded,
    testId: 'rail-photos',
  },
  {
    path: '/plan',
    title: 'Plan history',
    Icon: HistoryOutlined,
    ActiveIcon: HistoryRounded,
    testId: 'rail-plan',
  },
]

export const SETTINGS_DESTINATION: Destination = {
  path: '/settings',
  title: 'Settings',
  Icon: SettingsOutlined,
  ActiveIcon: SettingsRounded,
  testId: 'rail-settings',
}

export function tabByKey(key: TabKey): Tab {
  const found = TABS.find((t) => t.key === key)
  if (!found) throw new Error(`Unknown tab "${key}"`)
  return found
}
