// Owns: the app's navigation destinations in one table each — the six tabs (SPEC §11 navigation, plus Dashboard — see
// docs/PROGRESS.md: key, path, nav label, page title and icons) that the Summit nav's pill (desktop, `title`) and the
// phone's bottom tab bar (`label`) list, the Scans circle and the Settings avatar beside them, and the "Body" pages
// (Scans, Photos, Plan history). Photos and Plan history are not in the nav (1d): they are reached from the pages that
// link to them and from the ⌘K command palette.
//
// The icon set is one family, not a sample of one: every destination draws from the same rounded outline weight, so a
// nav reads as a single column rather than unrelated glyphs. Inactive destinations take the outlined cut and the
// active one the filled, rounded cut, which is the one weight difference the pair is there to carry (the item also
// darkens its ink and keeps `aria-current`, so colour is never the only signal).
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import DonutLargeOutlined from '@mui/icons-material/DonutLargeOutlined'
import DonutLargeRounded from '@mui/icons-material/DonutLargeRounded'
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
  /** The page's name: the desktop nav's label and the page title. */
  title: string
  Icon: typeof SvgIcon
  ActiveIcon: typeof SvgIcon
  /** The nav item's test id (`rail-*`, kept from the 2a sidebar). */
  testId: string
}

export interface Tab extends Destination {
  key: TabKey
  /** Short label under the icon in the bottom tabs. */
  label: string
}

export const TABS: readonly Tab[] = [
  {
    key: 'today',
    path: '/',
    label: 'Today',
    title: 'Today',
    Icon: TodayOutlined,
    ActiveIcon: TodayRounded,
    testId: 'rail-today',
  },
  {
    key: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    Icon: SpaceDashboardOutlined,
    ActiveIcon: SpaceDashboardRounded,
    testId: 'rail-dashboard',
  },
  {
    key: 'log',
    path: '/log',
    label: 'Log',
    title: 'Log',
    Icon: RestaurantOutlined,
    ActiveIcon: RestaurantRounded,
    testId: 'rail-log',
  },
  {
    key: 'train',
    path: '/train',
    label: 'Train',
    title: 'Train',
    Icon: FitnessCenterOutlined,
    ActiveIcon: FitnessCenterRounded,
    testId: 'rail-train',
  },
  {
    key: 'progress',
    path: '/progress',
    label: 'Progress',
    title: 'Progress',
    Icon: InsightsOutlined,
    ActiveIcon: InsightsRounded,
    testId: 'rail-progress',
  },
  {
    key: 'ai',
    path: '/ai',
    label: 'AI',
    title: 'Ask AI',
    Icon: AutoAwesomeOutlined,
    ActiveIcon: AutoAwesomeRounded,
    testId: 'rail-ai',
  },
]

/**
 * The Scans circle in the Summit nav (desktop and phone). Its glyph is body composition as a split ring (the mock's
 * Material Symbol `body_fat` has no @mui/icons-material twin): not a person, which would read as a second avatar
 * beside Settings', and not the scale, which is the weigh-in's.
 */
export const SCANS_DESTINATION: Destination = {
  path: '/scans',
  title: 'Scans',
  Icon: DonutLargeOutlined,
  ActiveIcon: DonutLargeRounded,
  testId: 'rail-scans',
}

/**
 * The "Body" pages: Scans (the nav's circle), Photos and Plan history (reached from the pages and the command palette;
 * 1d draws no nav item for them). There is no "Weekly reports" page to list (a report lives at /reports/week/:week,
 * reached from Progress and Today).
 */
export const BODY_DESTINATIONS: readonly Destination[] = [
  SCANS_DESTINATION,
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
  const tab = TABS.find((t) => t.key === key)
  if (!tab) throw new Error(`Unknown tab "${key}"`)
  return tab
}
