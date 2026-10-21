// Owns: the 1d "Summit" design's responsive rules (docs/design/design_handoff_fitness_1d/README.md §3 shell, §4
// responsive rules, §7 "done when"). On each of the nine screens — Today, Dashboard, Log, Train, a Train session,
// Progress, Ask AI, Settings, Scans — loaded fresh at 360, 390, 768, 1024 and 1440 px: the page never scrolls sideways;
// the one "Main" navigation is the fixed bottom tab bar below 960 px and the Summit nav's pill from 960 px up, with the
// six tabs in order, their rail-* test ids and names, and the current destination marked with `aria-current`; and on a
// phone nothing sits under the tab bar once the page is scrolled to its end. Each screen is one story with a loop over
// the widths, and the whole set runs twice — full motion and `prefers-reduced-motion: reduce` — because motion must not
// move layout. Assertions are soft so a single run lists every screen, width and rule that fails, not just the first.
import type { Page } from '@playwright/test'
import { expect, test } from './support'

/** README §4b's widths (phones, tablet portrait, laptop, desktop), each with a plausible window height. */
const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const
type Viewport = (typeof VIEWPORTS)[number]

/** README §3/§4: the phone's bottom tab bar below this width, the desktop pill from it. */
const DESKTOP_NAV_FROM = 960
/** A pixel of rounding is allowed on every edge comparison. */
const ROUNDING_PX = 1
/** README §4 "Tap targets": every interactive element is at least this big (also the tab bar's six cells). */
const TAP_PX = 44

type TabKey = 'today' | 'dashboard' | 'log' | 'train' | 'progress' | 'ai'

/** The six tabs as README §3 names them: `title` in the desktop pill, the short `label` under the phone's icons. */
const TABS: readonly { key: TabKey; path: string; title: string; label: string }[] = [
  { key: 'today', path: '/', title: 'Today', label: 'Today' },
  { key: 'dashboard', path: '/dashboard', title: 'Dashboard', label: 'Dashboard' },
  { key: 'log', path: '/log', title: 'Log', label: 'Log' },
  { key: 'train', path: '/train', title: 'Train', label: 'Train' },
  { key: 'progress', path: '/progress', title: 'Progress', label: 'Progress' },
  { key: 'ai', path: '/ai', title: 'Ask AI', label: 'AI' },
]

/** Which nav item marks a screen: its own tab, the tab it lives under, or the Scans / Settings circle. */
type Current = { tab: TabKey } | { section: TabKey } | { circle: 'rail-scans' | 'rail-settings' }

interface Route {
  name: string
  /** `:id` is replaced with a session started through the API. */
  path: string
  current: Current
  /** A test id (kept from the 2a pages and used by the other specs) that is on screen once the page has its data. */
  ready?: string
}

const ROUTES: readonly Route[] = [
  { name: 'Today', path: '/', current: { tab: 'today' }, ready: 'today-rings' },
  { name: 'Dashboard', path: '/dashboard', current: { tab: 'dashboard' }, ready: 'dashboard-page' },
  { name: 'Log', path: '/log', current: { tab: 'log' } },
  { name: 'Train', path: '/train', current: { tab: 'train' }, ready: 'week-preview' },
  { name: 'Progress', path: '/progress', current: { tab: 'progress' }, ready: 'progress-page' },
  { name: 'Ask AI', path: '/ai', current: { tab: 'ai' } },
  { name: 'Settings', path: '/settings', current: { circle: 'rail-settings' }, ready: 'profile-height_cm' },
  { name: 'Scans', path: '/scans', current: { circle: 'rail-scans' } },
  // A page below a tab: Train keeps the mark as the section that holds it, with aria-current="true".
  {
    name: 'A Train session',
    path: '/train/session/:id',
    current: { section: 'train' },
    ready: 'exercise-log-card',
  },
]

/** Library exercises for the session, as training.spec.ts picks them; any allowed ones fill up the list. */
const SESSION_EXERCISES = ['Barbell Bench Press - Medium Grip', 'Leg Press', 'Seated Cable Rows']

/** What `aria-current` each of the six tabs should carry on this screen: "page", "true" (section) or none. */
function expectedMark(current: Current, key: TabKey): 'page' | 'true' | null {
  if ('tab' in current && current.tab === key) return 'page'
  if ('section' in current && current.section === key) return 'true'
  return null
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test.describe(`Summit layout, ${motion === 'reduce' ? 'reduced motion' : 'full motion'}`, () => {
    test.use({ reducedMotion: motion })

    for (const route of ROUTES) {
      test(`${route.name} never scrolls sideways at 360–1440, and its Main navigation holds at every width`, async ({
        page,
      }) => {
        const sessionId = route.path.includes(':id') ? await startSession(page) : null
        const url = route.path.replace(':id', sessionId ?? '')
        try {
          for (const viewport of VIEWPORTS) {
            await test.step(`${viewport.width} × ${viewport.height}`, async () => {
              const at = `${route.name} at ${viewport.width} px`
              await page.setViewportSize(viewport)
              // A fresh load at each width: the shell reads its breakpoint on the first render, not only on resize.
              await page.goto(url)
              await settle(page, route.ready)

              await checkNoSidewaysScroll(page, at)
              await checkMainNavigation(page, route.current, viewport, at)
              // README §3: the phone's page keeps 84 px (+ the home indicator) clear under the fixed tab bar.
              if (viewport.width < DESKTOP_NAV_FROM) await checkNothingUnderTabBar(page, at)
            })
          }
        } finally {
          // The session is open (not finished): remove it so the Today / Train stories after this one start clean.
          if (sessionId) {
            const removed = await page.request.delete(`/api/sessions/${sessionId}`)
            expect
              .soft(removed.ok(), 'DELETE /api/sessions/:id (clean-up of the story’s own session)')
              .toBe(true)
          }
        }
      })
    }
  })
}

/** Start a three-exercise session with one set done through the API (the way training.spec.ts's flow ends up with one). */
async function startSession(page: Page): Promise<string> {
  const listed = await page.request.get('/api/exercises')
  expect(listed.ok(), 'GET /api/exercises').toBe(true)
  const allowed = ((await listed.json()) as { id: string; name: string; allowed: boolean }[]).filter(
    (exercise) => exercise.allowed,
  )
  const preferred = SESSION_EXERCISES.flatMap(
    (name) => allowed.find((exercise) => exercise.name === name) ?? [],
  )
  const picks = [...new Set([...preferred, ...allowed])].slice(0, 3)
  expect(picks, 'the seeded library has allowed exercises to train').toHaveLength(3)

  const id = crypto.randomUUID()
  const started = await page.request.post('/api/sessions', {
    data: {
      id,
      template_id: null,
      origin: 'blank',
      started_at: new Date().toISOString(),
      exercises: picks.map((exercise) => ({
        exercise_id: exercise.id,
        sets: 3,
        rep_min: 8,
        rep_max: 12,
        target_load_kg: 40,
        rest_sec: 90,
        note: null,
      })),
    },
  })
  expect(started.status(), `POST /api/sessions: ${await started.text()}`).toBe(201)

  const logged = await page.request.post(`/api/sessions/${id}/sets`, {
    data: {
      id: crypto.randomUUID(),
      exercise_id: picks[0]!.id,
      set_index: 1,
      reps: 10,
      load_kg: 40,
      completed: true,
    },
  })
  expect(logged.ok(), `POST /api/sessions/:id/sets: ${await logged.text()}`).toBe(true)
  return id
}

/**
 * The page has its heading and data, nothing is still a skeleton or `aria-busy`, and the entrance transitions have
 * finished — so what is measured is the real layout. Ambient loops (twinkling stars, the sun) never end and are ignored.
 */
async function settle(page: Page, ready: string | undefined): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  if (ready) await expect(page.getByTestId(ready).first()).toBeVisible()
  // Best effort: a page that polls never goes idle, and the checks below are the real condition.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
  await expect(
    page.locator('[aria-busy="true"], .MuiSkeleton-root'),
    'the page is still loading (a skeleton or aria-busy region is on screen)',
  ).toHaveCount(0, { timeout: 8_000 })
  await page.evaluate(async () => {
    // Twice: a group's transitions start on the frame after it mounts.
    for (let pass = 0; pass < 2; pass++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const finite = document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      await Promise.allSettled(finite.map((a) => a.finished))
    }
  })
}

/**
 * README §4b/§7: the page itself never scrolls horizontally (only tables and the week split do, inside a wrapper).
 * Two readings, because App.tsx gives `#root` `overflow-x: clip` as a safety net: `scrollWidth` is the literal rule but
 * cannot see anything inside `#root`, so the second asks the elements themselves — nothing outside an intentional
 * scroll or clip wrapper may run past the right edge, where the safety net would silently cut it off.
 */
async function checkNoSidewaysScroll(page: Page, at: string): Promise<void> {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    // The layout width: the same as `innerWidth` in headless Chromium (no scrollbar), smaller where one takes room.
    clientWidth: Math.min(document.documentElement.clientWidth, window.innerWidth),
  }))
  expect
    .soft(
      sizes.scrollWidth,
      `${at}: the page scrolls sideways (${sizes.scrollWidth} px of content in a ${sizes.clientWidth} px window)`,
    )
    .toBeLessThanOrEqual(sizes.clientWidth + ROUNDING_PX)
  expect
    .soft(
      await pastRightEdge(page, sizes.clientWidth),
      `${at}: content runs past the ${sizes.clientWidth} px right edge, outside any scroll wrapper (clipped by #root, not scrolled)`,
    )
    .toEqual([])
}

/**
 * The deepest elements whose right edge is past `limit`, widest first (at most five, described by tag, test id, first
 * classes and edge). An element does not count when it is `position: fixed`, has no size, is the sky hero's
 * `aria-hidden` decoration (stars, sun, ridge), or sits inside an ancestor with its own `overflow-x` (a table's
 * wrapper, the week split). `#root`, `body` and `html` are the page's, not such a wrapper; nor is the sky hero
 * (`[data-sky-hero]`), whose `overflow: hidden` is there for that decoration and would otherwise silently clip a title,
 * an action or a chip that runs past the edge.
 */
function pastRightEdge(page: Page, limit: number): Promise<string[]> {
  return page.evaluate((limit) => {
    const inOwnWrapper = (el: Element) => {
      for (let p = el.parentElement; p && p.id !== 'root' && p !== document.body; p = p.parentElement)
        if (!p.hasAttribute('data-sky-hero') && getComputedStyle(p).overflowX !== 'visible') return true
      return false
    }
    const heroDecoration = (el: Element) => el.closest('[data-sky-hero] [aria-hidden="true"]') !== null
    const candidates = Array.from(document.body.querySelectorAll('*')).filter((el) => {
      const rect = el.getBoundingClientRect()
      return (
        rect.width > 0 &&
        rect.right > limit + 1 &&
        getComputedStyle(el).position !== 'fixed' &&
        getComputedStyle(el).visibility !== 'hidden' &&
        !heroDecoration(el) &&
        !inOwnWrapper(el)
      )
    })
    return candidates
      .filter((el) => !Array.from(el.children).some((child) => candidates.includes(child)))
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      .slice(0, 5)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const testId = el.getAttribute('data-testid')
        const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2)
        return (
          `${el.tagName.toLowerCase()}${testId ? `[data-testid=${testId}]` : ''}${classes.map((c) => `.${c}`).join('')}` +
          ` (right ${Math.round(rect.right)}, width ${Math.round(rect.width)})`
        )
      })
  }, limit)
}

/**
 * README §3: below 960 px the six tabs are the fixed bottom bar, from 960 px the Summit nav's pill at the top; either
 * way it is the one navigation named "Main", it lists the six tabs in order with their names and rail-* test ids, and
 * exactly the current destination is marked: `aria-current="page"` on its tab, `"true"` on the tab that holds a page
 * below it (a session under Train), and `"page"` on the Scans / Settings circle for those two screens.
 */
async function checkMainNavigation(
  page: Page,
  current: Current,
  viewport: Viewport,
  at: string,
): Promise<void> {
  const phone = viewport.width < DESKTOP_NAV_FROM
  const nav = await readMainNav(page)

  expect
    .soft(
      nav.count,
      `${at}: exactly one "Main" navigation (${phone ? 'the bottom tab bar' : "the Summit nav's pill"})`,
    )
    .toBe(1)
  expect
    .soft(
      nav.links.map((l) => l.href),
      `${at}: the six tabs, in order`,
    )
    .toEqual(TABS.map((t) => t.path))
  expect
    .soft(
      nav.links.map((l) => l.testId),
      `${at}: each tab keeps its rail-* test id`,
    )
    .toEqual(TABS.map((t) => `rail-${t.key}`))
  expect
    .soft(
      nav.links.map((l) => l.name),
      `${at}: tab names (${phone ? 'the short labels' : 'the page titles'})`,
    )
    .toEqual(TABS.map((t) => (phone ? t.label : t.title)))
  expect
    .soft(
      nav.links.map((l) => l.current),
      `${at}: aria-current on the six tabs (page = own tab, true = the tab holding the page, none = the rest)`,
    )
    .toEqual(TABS.map((t) => expectedMark(current, t.key)))

  if ('circle' in current) {
    const marks = await page.evaluate(
      (testId) =>
        Array.from(document.querySelectorAll(`[data-testid="${testId}"]`)).map((el) =>
          el.getAttribute('aria-current'),
        ),
      current.circle,
    )
    expect
      .soft(marks, `${at}: ${current.circle} carries aria-current="page" (and no tab does)`)
      .toEqual(['page'])
  }

  const lefts = nav.links.map((l) => l.left)
  const rights = nav.links.map((l) => l.right)
  expect
    .soft(Math.min(...lefts), `${at}: every tab starts inside the window`)
    .toBeGreaterThanOrEqual(-ROUNDING_PX)
  expect
    .soft(
      Math.max(...rights),
      `${at}: every tab ends inside the ${viewport.width} px window (reachable, not pushed off)`,
    )
    .toBeLessThanOrEqual(viewport.width + ROUNDING_PX)

  if (phone) {
    expect.soft(nav.fixed, `${at}: the tab bar is position: fixed`).toBe(true)
    expect
      .soft(nav.bottom, `${at}: the tab bar sits on the window's bottom edge (its bottom, not the page's)`)
      .toBeGreaterThanOrEqual(viewport.height - 24)
    expect
      .soft(nav.bottom, `${at}: the tab bar does not run off the bottom`)
      .toBeLessThanOrEqual(viewport.height + ROUNDING_PX)
    const smallest = Math.min(...nav.links.flatMap((l) => [l.width, l.height]))
    expect
      .soft(smallest, `${at}: every tab is at least ${TAP_PX} px each way`)
      .toBeGreaterThanOrEqual(TAP_PX - ROUNDING_PX)
  } else {
    expect
      .soft(nav.top, `${at}: the desktop nav is in the sky at the top, not a bottom bar`)
      .toBeLessThan(viewport.height / 2)
  }
}

interface NavState {
  count: number
  fixed: boolean
  top: number
  bottom: number
  links: {
    href: string | null
    testId: string | null
    name: string
    current: string | null
    left: number
    right: number
    width: number
    height: number
  }[]
}

/** The "Main" navigation as it is now (no waiting: the page has settled), by role as Aaron's screen reader finds it. */
async function readMainNav(page: Page): Promise<NavState> {
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  const count = await nav.count()
  if (count === 0) return { count, fixed: false, top: 0, bottom: 0, links: [] }
  const state = await nav.first().evaluate((el) => {
    let fixed = false
    for (let p: Element | null = el; p; p = p.parentElement)
      if (getComputedStyle(p).position === 'fixed') fixed = true
    // The name a screen reader reads: the label, else the text without the aria-hidden glyph.
    const nameOf = (a: Element) => {
      const label = a.getAttribute('aria-label')
      if (label) return label.trim()
      const copy = a.cloneNode(true) as Element
      copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
    const box = el.getBoundingClientRect()
    return {
      fixed,
      top: box.top,
      bottom: box.bottom,
      links: Array.from(el.querySelectorAll('a')).map((a) => {
        const rect = a.getBoundingClientRect()
        return {
          href: a.getAttribute('href'),
          testId: a.getAttribute('data-testid'),
          name: nameOf(a),
          current: a.getAttribute('aria-current'),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        }
      }),
    }
  })
  return { count, ...state }
}

/**
 * Scroll to the end of the page and compare the last piece of content in `main` with the top of the fixed tab bar: its
 * bottom must not be past it. "Last piece" is found by walking down the last in-flow, visible child at each level (the
 * fixed and absolute layers — the tab bar, the quick-log button, decorations — are not content), so the cream panel's
 * own padding, which is meant to sit under the bar, does not count.
 */
async function checkNothingUnderTabBar(page: Page, at: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  if ((await nav.count()) !== 1) return // reported by checkMainNavigation
  const result = await nav.first().evaluate((bar) => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    const main = document.querySelector('main')
    if (!main) return null
    const inFlow = (el: Element) => {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (style.position === 'fixed' || style.position === 'absolute') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    let last: Element = main
    for (;;) {
      const next = Array.from(last.children).filter(inFlow).at(-1)
      if (!next) break
      last = next
    }
    const testId = last.getAttribute('data-testid')
    const classes = (last.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2)
    return {
      what:
        `${last.tagName.toLowerCase()}${testId ? `[data-testid=${testId}]` : ''}${classes.map((c) => `.${c}`).join('')}` +
        ` "${(last.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`,
      lastBottom: last.getBoundingClientRect().bottom,
      barTop: bar.getBoundingClientRect().top,
    }
  })
  expect.soft(result, `${at}: the page has a main landmark with content in it`).not.toBeNull()
  if (!result) return
  expect
    .soft(
      result.lastBottom,
      `${at}: the last content in main (${result.what}) ends at ${Math.round(result.lastBottom)} px, under the tab bar that starts at ${Math.round(result.barTop)} px`,
    )
    .toBeLessThanOrEqual(result.barTop + ROUNDING_PX)
}
