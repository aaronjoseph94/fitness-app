# Apple-style interface rebuild — audit and decision log

Owns: the audit of the interface as it was, the design system it was rebuilt onto, and every place where the
Human Interface Guidelines left a choice open and I made one.

Written 2026-10-06. Companion to `docs/SPEC.md` §11 (visual language) and `docs/PROGRESS.md`.

> **Superseded 2026-10-08.** The interface now follows the "2a" design (`docs/design/design_handoff_fitness_2a/README.md`; tokens and the decisions behind them at the top of `apps/web/src/theme.ts`). This file is kept as the record of the Apple-conventions pass; its token values and component notes no longer describe the app.

## 1. Audit — what needed rework

Every screen, component and interaction reviewed, in the order the app presents them. "Rework" means the current
treatment is not what the HIG would do, not that it was broken.

### Chrome (the frame every screen sits in)

| Item | As it was | Problem against the HIG |
| --- | --- | --- |
| Top bar | Opaque `background.default` with a `LinearProgress` and a left-aligned `h3` (20 px) title | iOS bars are a translucent material with content scrolling under, and the nav-bar title is 17 pt semibold — not a 20 px heading. An opaque bar is a hard visual seam; it also can't show the scroll edge effect. |
| Bottom tabs | Opaque paper with a `1px solid` top border, 13 px labels | A hairline border is the Android/Material separator idiom; iOS uses the material itself plus a scroll-edge fade. Active state was "dark ink" only, not the platform's tinted selected item. |
| Nav rail (desktop) | Opaque paper + `borderRight: 1px` | iOS/macOS sidebars are a translucent material; a full-height hairline is again a Material separator. |
| `F` mark in the rail | An ink tile with a letter | Removed in the previous pass; nothing further to do. |
| Status banners, sync chip | The banners already used MUI's tinted `standard` `Alert`; the sync chip forced a `divider` border, and the "didn't load" `Alert` used the `outlined` variant with a 1 px rule | Apple reserves colour for meaning and uses a *tinted* surface — the severity at low alpha — rather than a saturated fill **or a border**. The three tinted banners needed only the card radius; the two bordered cases needed the wash instead of the rule. |
| Quick-log button | Solid accent circle, `elevation.accent` | Right idea (a floating action); the shadow was a coloured glow, which reads as decoration. Apple floats on a neutral shadow. |
| Boot screen | Already a bare `background.default` surface with `aria-busy` — no spinner, no wordmark | Nothing to rework, and this row was wrong in the first pass of this audit: the app's first frame is deliberately blank because §11 forbids a launch spinner and there is nothing on screen yet to materialise. Left exactly as it was. |
| Command palette | Direct `Dialog` open with no transition tuning | Apple's menus materialize from their trigger and dim the background. |

### Primitives (the kit every screen is built from)

| Item | As it was | Problem |
| --- | --- | --- |
| `MuiButton` variants | `contained` = accent fill; `outlined` = 1 px accent border | Apple's four button styles are filled, **tinted** (accent at ~12 % with accent text), plain, and grey. A 1 px outline is not one of them. |
| Press feedback | MUI's `TouchRipple` on every `ButtonBase` | A Material ripple is the single most un-Apple interaction in the app. Apple highlights on touch-*down*, instantly, with a background change (rows) or a small scale (buttons). |
| `MuiCard` | Radius 20, two-layer shadow, `& &` hairline | iOS grouped content is a 16 pt-radius white surface on the grouped grey with almost no shadow; the *surface contrast* does the separation. A 20 px radius with a visible shadow reads as Material elevation. |
| Typography | Custom face (Outfit), one tracking value per style, no per-size leading, no optical sizing | The HIG prefers the system face (which ships optical sizing, tracking tables and legibility tuning). Tracking must be size-specific and leading must track size inversely. |
| Type scale | 12/13/14/15/16/18/20/32/36/40 with ad-hoc heading sizes | Several stops are a pixel apart (14 vs 15 vs 16), which reads as imprecision rather than hierarchy. |
| Motion | `duration.{instant,fast,base,slow,slower}` = 90/160/240/380/620 ms, `easing.enter` = a weak decelerate | The brief's own model is *response* (0.3–0.4 s) with a critically-damped spring; 90 ms is below the perception threshold for a state change and 240 ms for an entrance is short, so entrances snap rather than settle. `easing.exit` was not the mirror of `enter`, so reversible transitions did not retrace their path. |
| Motion (qualitatively) | Transitions fired on state change only | No continuous feedback during a press, no materialize for surfaces, no route transition, so navigation between tabs was a hard cut. |
| Reduced motion | Handled (`transitionOf`, `motionDuration`, `useEntrance`) | Only one of the three accessibility signals was handled. `prefers-reduced-transparency` and `prefers-contrast` were not, which matters now that chrome is translucent. |
| `EmptyState` | unDraw illustration, 18 px title, 14 px body, 140 px art | The art competes with the text; Apple's empty states are a quiet symbol or none, a short headline and one action. |
| `SectionHeader` | 20 px title, optional 14 px subtitle, `mb: 3` | Not the platform's Title 2 (22) and the gap under it was smaller than the gap between sections, so groups did not read as groups. |
| `MetricCard` | Gradient fill, `letterSpacing: 0.2` on the label (positive at a small size is right, but it was the *only* tracking in the card), `-1` on the number | Five saturated gradient blocks in a column is the least restrained surface in the app. |
| `StatCard` | Label, number, delta, sparkline, footnote at fixed sizes | Kept; needed the new type scale and a press state. |
| `ChartCard` / chart frames | 20 px card title, 12 px axis text, `axisFontSize: 12` | Axis text at 12 px is Caption 1, which is right, but the frames needed the same rhythm and radius as every other card. |
| `MetricRing`, `RingsRow`, `LegendChips` | Token-driven | Structurally fine; only the radius/type tokens changed under them. |
| `forms` (`LoadProblem`, `NumberField`) | Token-driven; `LoadProblem` was an `outlined` `Alert` (1 px coloured border) | Needed the new control radius (now on `MuiOutlinedInput`) and, for a failed read, the tinted wash the rest of the app uses. |
| `ProposalCard` | Token-driven | Same. |

### Screens

| Screen | As it was | Problem |
| --- | --- | --- |
| Today | Greeting hero (28 px), five gradient metric cards, quick-log row, hero chart + rail of AI/This-week cards | The hero's 28 px title is not the HIG's Large Title (34) and the five gradient cards put the app's most saturated colour on its most frequently seen screen. |
| Dashboard | Greeting hero, six KPI tiles with a gradient hero, four chart sections | Correct structure (this is the app's best-considered screen); needed the new type, radius and rhythm, and the one permitted gradient. |
| Log | Day journal beside a rail of water/sleep/measurements/fasting/favourites | Token-driven; needed the new rhythm and card language. |
| Train | Today card, templates, recent sessions, tool strip | Token-driven; needed the new card language and press feedback. |
| Progress | Week view beside reviews, six sections of charts | Token-driven; needed type/rhythm. |
| Ask AI | Thread, starters, composer, pending proposals rail | The panel is a sheet without a grabber or materialize; starters are outlined chips (not an Apple pattern). |
| Settings | Eight groups of rows in cards, links table | Row height/hairlines correct for iOS grouped lists; needed the tinted-value treatment and the new type. Every sub-page (`/settings/ai`, `/settings/data`, `/settings/reminders`) inherits. |
| Scans, Photos, Plan, Imports, Data, Reminders, Reports, Library, Builder, Week, Proposals | Token-driven through the shared kit | Consistent by construction; inherit the rebuild. |

### Interactions specifically reworked

1. **Press.** Ripple removed app-wide; rows highlight on touch-down, buttons and icon buttons scale slightly. Both are
   instant (100 ms) so the feedback exists on the press, not on release.
2. **Navigation.** Deliberately left as an instant switch: a whole-column cross-fade was built and then removed. This shell
   cannot tell a push (which does slide) from a tab change (which does not), and iOS switches tabs with no transition at all.
   See decision 10.
3. **Surfaces.** Menus, dialogs and sheets materialize (scale + opacity behind a mirrored easing) rather than only
   fading, and the sheets gained a grabber.
4. **Chrome over content.** The top bar, the bottom tabs and the desktop rail are one translucent material that the page
   scrolls under, and their separator is a *scroll edge effect*: a single `box-shadow` hairline — no layout, no extra
   element — that exists only while `useScrolled` reports content beneath the bar, and is `none` at rest. The top bar's
   points down, the tabs' up, the rail's sideways.
5. **Reversible transitions.** Exit easing is now the exact mirror of enter easing, so a dismissed surface retraces
   the path it arrived along.

## 2. The system it was rebuilt onto

### Type

One family: **the platform's system face** (`-apple-system` → SF Pro on Apple hardware, `Segoe UI` on Windows,
`system-ui` elsewhere), with `font-optical-sizing: auto`. The self-hosted Outfit face was removed for this reason and
because it was ~50 KB of a font the HIG does not want in the first place.

Scale, with size-specific tracking and inversely-tracking leading. Sizes are px at the 16 px root; every size is also
available in `rem` so a larger browser text setting scales the layout with the text.

| Token | Size | Weight | Leading | Tracking |
| --- | --- | --- | --- | --- |
| `largeTitle` | 34 | 700 | 1.20 | −0.6 |
| `title1` | 28 | 700 | 1.21 | −0.5 |
| `sectionTitle` | 22 | 600 | 1.27 | −0.35 |
| `cardTitle` | 18 | 600 | 1.28 | −0.26 |
| `body` | 17 | 400 | 1.29 | −0.24 |
| `emphasis` | 16 | 500 | 1.31 | −0.2 |
| `small` | 15 | 400 | 1.33 | −0.15 |
| `label` | 13 | 500 | 1.38 | −0.08 |
| `caption` | 12 | 400 | 1.33 | 0 |

Numbers (`.bigNumber`) are 400-weight-weight, tabular and negatively tracked (−0.8 at 40 px) so a column of values
aligns to the digit.

### Spacing

Membership is spacing. One rhythm, in `layout.rhythm`:

| Token | px | Used for |
| --- | --- | --- |
| `tight` | 8 | inside a control |
| `group` | 16 | between rows of one group; card padding |
| `block` | 24 | between a last and a first block |
| `section` | 32 | between sections on a page; a card's inset (`p: 4`) |
| `page` | 48 | between a page's major groups |

### Shape

Continuous-corner conventions, approximated: `card` 16, `control` 10, `inner` 8, `chip` 999. (`corner-shape: squircle`
is not yet broadly supported; a plain radius is the closest available.)

### Colour

Unchanged in value, restrained in *use*:

- `accent` stays Facebook blue (`#166FE5`, measured 4.73:1 on white) because that is the brand decision recorded in
  `docs/PROGRESS.md`, and keeping it satisfies "restrained" better than adding a second hue.
- The metric palette is unchanged and still measured (all eleven clear 3:1 on the card and the page; all 22 gradient
  stops clear 4.5:1 for white text).
- `background.default` moved to the platform grouped grey `#F2F2F7`.
- Chrome is neutral; colour is spent on data and on the primary action only.

### Materials and depth

`tokens.material` defines four surfaces, each with a `prefers-reduced-transparency` fallback (solid) and a
`prefers-contrast: more` fallback (solid + hairline):

| Material | Fill | Backdrop | Used by |
| --- | --- | --- | --- |
| `chrome` | white at 74 % | `blur(20px) saturate(180%)` | top bar, bottom tabs, nav rail |
| `sheet` | white at 88 % | `blur(30px) saturate(180%)` | bottom sheets, the Ask AI panel, the palette |
| `scrim` | black at 32 % | — | modal backdrop |
| `pressHighlight` | ink at 5 % | — | the row press state |

Depth is *surface contrast first*: cards sit on the grouped grey with a whisper of a shadow, and only genuinely
floating layers (sheets, menus, the quick-log button) get a real one.

### Motion

`tokens.motion` is now expressed the way the brief asks — response in seconds, critically damped by default:

| Token | ms | Was | Apple equivalent |
| --- | --- | --- | --- |
| `instant` | 100 | 90 | press feedback |
| `fast` | 200 | 160 | hover, small state change |
| `base` | 320 | 240 | response 0.3 — the default |
| `slow` | 420 | 380 | response 0.4 — sheets, rails |
| `slower` | 560 | 620 | large surfaces, bars filling |

`easing.enter` is a strong decelerate, `cubic-bezier(0.32, 0.72, 0, 1)`; `easing.exit` is its **exact mirror**,
`cubic-bezier(1, 0, 0.68, 0.28)`, so a dismissal retraces its arrival.

The entrance is a **real spring**, not a curve that imitates one. `motion/spring.ts` solves Apple's two parameters
analytically — `response` and `damping ratio`, critically damped at 1 and under-damped below it — and returns the value
*and* the velocity at any instant. Two consequences follow, and both were wrong in the first pass:

- **The duration is derived, never prescribed.** `settleTime()` finds when the spring has settled (within 0.1 % of its
travel and moving at under 1 % of it per second); `enterDuration()` reports it. The first pass pasted in a 21-stop
`linear()` sample of a 0.6 s settle and then gave every entrance 320 ms to run in, so the curve was cut off about
half-way and each entrance landed with a jolt. The pair now agrees by construction — 0.546 s, measured in the browser.
- **The curve is generated, not typed.** `springCurve()` samples that same solution into the browser's `linear()`
(Safari 17.2+, Chrome 113+), with the cubic-bézier as the fallback for everything else.

Bounce is spent only where a gesture carried momentum into the release: `SPRING_MOMENTUM` (damping 0.8, response 0.3 —
Apple's own drawer values) settles a sheet that was dragged and thrown, while `SPRING_DEFAULT` (damping 1.0, response
0.35) brings everything else in without overshoot.

**Motion that is a conversation.** The quick-log sheet can be dragged away, and that gesture is the one place the
motion is not an animation at all. `useSheetDrag` tracks the pointer 1:1 — writing `transform` straight to the element
with the paper's own transition switched off, so nothing smooths the moves — reads a short (position, time) history so
the release hands the finger's own velocity to the spring that settles it, chooses the resting place from Apple's
momentum projection rather than from the release point, resists progressively when dragged the wrong way, and settles
through keyframes generated from the analytic spring so the browser drives it and no frame of ours is required. Grab it
again mid-flight and it follows from the *presentation* value — where it actually is, read off the element — with the
running spring cancelled, so an interrupted sheet never jumps back to the target it was heading for.

Two constraints shaped where that gesture may live. It captures the pointer on **pointer-down**, because that is the
only way a fast movement cannot escape the region between events. Capture also retargets the compatibility mouse
events, which takes the `click` away from anything inside the capturing element — so the region it attaches to is the
**grabber strip alone**, and the title row with its Back and Close buttons sits outside it. (An earlier attempt put the
capture on the whole header and silently broke every button in it; the Playwright flow that closes the sheet caught it.)

## 3. Decisions made where the HIG left a choice

1. **Six tabs, not five.** The HIG caps a tab bar at five items (with a "More" tab beyond that). This app has six
   destinations and every one is a top-level task. The brief also requires existing behaviour to be preserved, and
   moving a destination out of the bar changes navigation. **Chosen:** keep six, note the deviation here. If it ever
   needs to shrink, "Ask AI" is the right one to move — it already exists as a sheet on every other tab.
2. **System font over the app's own face.** The HIG prefers the system face; the app shipped Outfit. **Chosen:** the
   system stack. One line in `theme.ts` reverted it at the time; the `@fontsource-variable/outfit` package was removed on
   2026-10-08 (the 2a redesign uses Geist).
3. **A dark secondary text colour instead of Apple's `secondaryLabel`.** Apple's `secondaryLabel` over white measures
   about 3.4:1, under the 4.5:1 this app holds itself to. **Chosen:** keep `#5F6B7C` (4.91:1 on the grouped grey) —
   the HIG's accessibility guidance outranks its colour picker.
4. **The measured metric palette instead of the iOS system colours.** `systemGreen` `#34C759` is 2.28:1 on white and
   `systemOrange` `#FF9500` is 2.06:1 — both fail the 3:1 floor this app needs for a chart line or a ring. **Chosen:**
   keep the darker palette. Same reasoning as (3).
5. **Gradients stay, but only one per screen.** The brief asks for restraint; the metric gradient is the app's one
   identity surface and the Dashboard hero is the one place it earns its place. **Chosen:** the hero keeps its
   gradient, Today's five metric cards are now plain white cards with the metric colour used meaningfully (icon tile,
   target bar) rather than as a fill. `MetricCard` gained a `surface` prop so both are the same component.
6. **Centred nav-bar titles.** iOS centres the nav-bar title; this app left-aligns it, because a web top bar shares
   its row with a back button, the sync chip, the palette, Ask AI and Settings. **Chosen:** left-aligned, at the
   HIG's 17 px semibold rather than as a page heading.
7. **No haptics.** The brief's multimodal-feedback principle would put a haptic on commit/snap moments, but the
   target is an iOS home-screen web app and iOS Safari does not expose `navigator.vibrate`. **Chosen:** no haptics;
   the press highlight and the fill animation carry the causality instead.
8. **Mobile-web scroll behaviour.** Scroll rubber-banding and momentum are the browser's here; the app does not
   re-implement them, so page scrolling is left alone entirely. The Ask AI panel keeps MUI's own presentation, because
   its header and its thread are one subtree inside `Chat` and there is no region of the paper a gesture could own.
   The **quick-log sheet** is the exception and the one gesture the app does own: its physics are hand-rolled in
   `useSheetDrag`, because a sheet you can throw is the clearest case of motion as a conversation and MUI's drawer
   brings none.
9. **`prefers-reduced-motion` keeps cross-fades.** The brief is explicit that reduced motion means a gentler
   equivalent, not nothing. **Chosen:** entrances become a declarative opacity cross-fade with no travel and no scale,
   presses lose their transform, and `transitionOf()` keeps the changes that still aid comprehension — a colour, an
   opacity, an elevation — while dropping the movement.
   Two things had to be fixed for that to be true rather than aspirational. `transitionOf()` had been returning `none`
   for *everything*, which deleted the very cross-fades it promised. And MUI's own CssBaseline installs a blanket
   `animation-duration: 0.01ms !important` / `transition-duration: 0.01ms !important` under this preference, which
   silently squashed them anyway; the app now relaxes the animation half (with a more specific selector, because MUI's
   rule is emitted after this block and would otherwise win). Transition durations are deliberately left squashed: what
   remains there is a colour or an opacity, which reads correctly as an instant change, whereas relaxing them would put
   MUI's own drawer and popover *travel* back on screen at the moment the viewer asked not to see it.
   The cross-fade is a **keyframe animation** rather than a transition so that it plays from the element's first paint
   on the browser's own clock, with no dependency on a JavaScript frame.
10. **No route transition.** The first pass wrapped the page column in a cross-fade on every route change; it was removed
    again. The shell cannot distinguish a tab switch (instant on iOS, no transition) from a push (which slides), and a
    whole-column fade is a transition the platform does not have. What arrives already materialises — each page's own hero
    and card groups rise in through `Reveal`/`useEntrance` as they mount. A build-time detail settled it: the fade keyed off
    a `requestAnimationFrame`, and in a window that throttles frames the animation clock can stall mid-flight, leaving the
    page at `opacity: 0`. `useScrolled` was written the same way for the same reason — one passive listener and a numeric
    comparison, no frame.
11. **An informational chip is 24 px; a tappable one is 44.** The sync chip is a 24 px pill while it only reports "Offline"
    or "2 pending", and the theme's `MuiChip.clickable` lifts it to the 44 px floor the moment a failed write makes it
    openable. The HIG's minimum is for things you must hit; a status label you *may* hit is not the same control at the
    same moment.

## 4. What shipped, and how it was checked

Everything above is in the working tree; nothing in this document is a plan.

- `pnpm check` — four package typechecks and `lint:boundaries`, clean, 664 modules cruised, 0 dependency violations.
- `pnpm test` — 63 files, 398 tests (the motion solver is the app's first unit-tested module; `vitest.config.ts`
  gained a `web` project for DOM-free app logic).
- `npx playwright test` — 11 flows pass against a fresh build (web build, then a freshly migrated and seeded D1 on the local
  Worker).
- A scripted browser pass at 390 × 844 over `/`, `/today`, `/dashboard`, `/train`, `/progress`, `/log`, `/settings`,
  `/settings/ai` and `/settings/data`, measuring the built app: `overflowX === 0` on every route; **zero** interactive
  elements under 44 px tall (the three `size="small"` buttons that failed this — "New" on Train, "All scans" on Progress,
  "Copy" on `/settings/ai` — were fixed by deleting `minHeight: 36` from `MuiButton.sizeSmall`, so the 44 px tap floor on
  the root holds); the top bar and the visible tab bar reporting `box-shadow: none` at rest and the hairline only after
  `window.scrollTo`; the tab bar 64 px tall over `rgba(255,255,255,0.74)` with `backdrop-filter: blur(20px) saturate(1.8)`;
  a failed read rendering `rgba(180, 83, 9, 0.12)` with `border: 0px none` at a 16 px radius; and the sync chip as
  `rgba(17, 24, 39, 0.06)`, borderless. Zero `.MuiTouchRipple-root` nodes on any route, so the app-wide ripple removal
  holds.
- The motion layer, driven through the real browser with actual pointer events (Playwright, 390 × 844): the entrance
  measured at `opacity, transform` for **0.546 s** with a **generated** `linear(...)` curve, so the spring and its
  duration are in sync; the quick-log sheet **springing back** after a short slow drag and settling to `transform: none`;
  **dismissing** after a long slow drag and after a flick; a reopened sheet inheriting **no** transform from the spring
  that closed it; and, under `prefers-reduced-motion: reduce`, the drag moving nothing and closing nothing, the
  entrance still playing `crossFadeIn` at **0.2 s**, and the desktop rail keeping `background-color, color` while
  dropping `transform`.
- **With the animation clock killed outright** (`requestAnimationFrame` stubbed to a no-op before the app loads — the
  failure the non-compositing preview webview reproduces): the hero still reaches `opacity: 1`, no space-occupying
  element is left invisible, and the sheet drag still dismisses. `useEntrance` used to wait on a frame and nothing else,
  so a window whose clock never ticked showed an **invisible page**; the frame is now the preferred moment to start an
  entrance rather than the only one, and the sheet's settle is browser-driven keyframes rather than a loop of ours.
- **The equipment screen became the room it describes** (2026-10-06, with the real inventory). Forty-seven machines in
  one alphabetical list read as a database; they now sit under the part of the gym they are in — Life Fitness, Hammer
  Strength, racks & rigs, free weights, cardio — and the machines the club does **not** have are their own section at the
  end, "Not at your gym", which is where a tap brings one back. Same rows, same segmented status control, same testids;
  the only new token is `area`, and the grouping order comes from `EQUIPMENT_AREAS` in the shared schemas so the screen
  and the AI prompt read the room in one order. Checked in the browser at 390 × 844: six sections with 11 / 20 / 5 / 4 /
  8 / 8 rows, and marking a machine "Don't have" moving the allowed-exercise count and holding it across a reload.
