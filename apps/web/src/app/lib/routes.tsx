// Owns: the route table (React Router data mode) — every path, its lazily loaded page, and its shell settings (`handle`).
// Adding a page means one entry here; the shell reads title, tab, width and quick-log from the handle. No route loaders
// start reads: measured (Lighthouse mobile, 2026-10-05), starting them before the page's code made every tab's LCP
// later, because the responses are parsed before the page's first render.
import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { preloadCharts } from '../../charts/preload'
import type { TabKey } from '../ui-store'
import type { RouteHandle } from './route-handle'
import { AppShell } from './shell/AppShell'
import { BootScreen } from './shell/BootScreen'
import { NotFound } from './shell/NotFound'
import { PrintLayout } from './shell/PrintLayout'
import { RouteError } from './shell/RouteError'
import { tabByKey } from './tabs'

/** Lazy page: the module's named export, or its default export when a module prefers that convention. */
function page(load: () => Promise<object>, exportName: string): RouteObject['lazy'] {
  return async () => {
    const module = (await load()) as Record<string, unknown>
    const Component = module[exportName] ?? module.default
    if (Component == null) throw new Error(`The page module exports neither ${exportName} nor a default`)
    return { Component: Component as ComponentType }
  }
}

function tab(key: TabKey, extra: Omit<RouteHandle, 'title' | 'tab'> = {}): RouteHandle {
  return { title: tabByKey(key).title, tab: key, ...extra }
}

const routes: RouteObject[] = [
  {
    Component: AppShell,
    ErrorBoundary: RouteError,
    HydrateFallback: BootScreen,
    children: [
      {
        // Page errors render inside the shell, so the tabs still work.
        ErrorBoundary: RouteError,
        children: [
          {
            index: true,
            handle: tab('today', { quickLog: true, width: 'wide', hero: true }),
            lazy: page(() => import('../../features/today'), 'TodayPage'),
          },
          {
            path: 'dashboard',
            handle: tab('dashboard', { width: 'wide', hero: true }),
            lazy: page(() => import('../../features/dashboard'), 'DashboardPage'),
          },
          {
            path: 'log',
            handle: tab('log', { quickLog: true, width: 'wide' }),
            lazy: page(() => import('../../features/log'), 'LogPage'),
          },
          {
            path: 'train',
            handle: tab('train', { width: 'wide' }),
            lazy: page(() => import('../../features/train'), 'TrainPage'),
          },
          { path: 'train/session/:id', handle: { title: 'Session' } satisfies RouteHandle, lazy: page(() => import('../../features/train'), 'SessionPage') },
          {
            path: 'train/library',
            handle: { title: 'Exercise library' } satisfies RouteHandle,
            lazy: page(() => import('../../features/library'), 'LibraryPage'),
          },
          {
            path: 'train/library/:id',
            handle: { title: 'Exercise' } satisfies RouteHandle,
            lazy: page(() => import('../../features/library'), 'ExercisePage'),
          },
          { path: 'train/equipment', handle: { title: 'Equipment' } satisfies RouteHandle, lazy: page(() => import('../../features/library'), 'EquipmentPage') },
          {
            path: 'train/builder',
            handle: { title: 'Workout builder' } satisfies RouteHandle,
            lazy: page(() => import('../../features/builder'), 'BuilderPage'),
          },
          {
            path: 'train/builder/:templateId',
            handle: { title: 'Edit template' } satisfies RouteHandle,
            lazy: page(() => import('../../features/builder'), 'BuilderPage'),
          },
          {
            path: 'train/ai',
            handle: { title: 'AI workout' } satisfies RouteHandle,
            lazy: page(() => import('../../features/builder'), 'AiWorkoutPage'),
          },
          {
            path: 'progress',
            handle: tab('progress', { width: 'wide' }),
            lazy: page(() => import('../../features/progress'), 'ProgressPage'),
          },
          { path: 'ai', handle: tab('ai', { width: 'wide' }), lazy: page(() => import('../../features/ai'), 'AskAiPage') },
          { path: 'settings', handle: { title: 'Settings' } satisfies RouteHandle, lazy: page(() => import('../../features/settings'), 'SettingsPage') },
          {
            path: 'settings/ai',
            handle: { title: 'AI and Claude' } satisfies RouteHandle,
            lazy: page(() => import('../../features/settings/ai'), 'AiSettingsPage'),
          },
          { path: 'settings/data', handle: { title: 'Export and restore' } satisfies RouteHandle, lazy: page(() => import('../../features/data'), 'DataPage') },
          { path: 'settings/reminders', handle: { title: 'Reminders' } satisfies RouteHandle, lazy: page(() => import('../../features/reminders'), 'RemindersPage') },
          { path: 'plan', handle: { title: 'Plan history' } satisfies RouteHandle, lazy: page(() => import('../../features/plan'), 'PlanPage') },
          { path: 'scans', handle: { title: 'Scans' } satisfies RouteHandle, lazy: page(() => import('../../features/scans'), 'ScansPage') },
          { path: 'scans/:id', handle: { title: 'Scan' } satisfies RouteHandle, lazy: page(() => import('../../features/scans'), 'ScanPage') },
          {
            path: 'imports/health',
            handle: { title: 'Import Apple Watch data' } satisfies RouteHandle,
            lazy: page(() => import('../../features/imports'), 'HealthImportPage'),
          },
          { path: 'photos', handle: { title: 'Progress photos' } satisfies RouteHandle, lazy: page(() => import('../../features/photos'), 'PhotosPage') },
          { path: 'photos/new', handle: { title: 'New photos' } satisfies RouteHandle, lazy: page(() => import('../../features/photos'), 'PhotoCapturePage') },
          { path: '*', handle: { title: 'Not found' } satisfies RouteHandle, Component: NotFound },
        ],
      },
    ],
  },
  {
    // No app chrome: the page prints, and the Worker renders it to the archived PDF (SPEC §8 weekly review).
    path: 'reports/week/:week',
    Component: PrintLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: BootScreen,
    // Recharts loads with the page: the report draws its charts on the first render, so "ready" means drawn.
    children: [
      {
        index: true,
        lazy: page(() => Promise.all([import('../../features/reports'), preloadCharts()]).then(([module]) => module), 'WeeklyReportPage'),
      },
    ],
  },
]

let router: ReturnType<typeof createBrowserRouter> | undefined

/** The app's router, created on first use (after startup has tidied the URL). */
export function appRouter(): ReturnType<typeof createBrowserRouter> {
  router ??= createBrowserRouter(routes)
  return router
}
