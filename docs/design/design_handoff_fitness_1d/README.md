# Fitness app — 1d "Summit" redesign · handoff for Claude Code

Target: `aaronjoseph94/fitness-app`, `apps/web`. This is a **presentation-only** change. Keep every data hook, query, guard, dialog, snackbar, offline banner and `data-testid`; restyle and re-lay-out what they render.

Open `App-1d-Overview.dc.html` in a browser to see all nine screens at 1440 px (row 4) and at 390 × 844 (row 5, live pages in frames). Each `*.dc.html` also opens on its own, and every file reflows when you resize the window. The mock data is one day: Wednesday, Oct 7, day 12 of the plan.

Suggested instruction for Claude Code:
> Implement the 1d Summit redesign in `apps/web` from `design_handoff_fitness_1d/README.md`. Start with the theme tokens (including the Outfit / DM Sans type in §2), the shell (Summit nav: desktop pill + mobile top bar and bottom tabs) and the page hero, then Today, then the other screens in the order below. Presentation only: keep all hooks, routes, guards and test ids. Match the responsive rules in §4 exactly and check every screen at 390, 768, 1024 and 1440 px.

## 1. Files

| Mock | Route | Repo sources it re-skins |
| --- | --- | --- |
| `Summit-Nav.dc.html` | shell | `app/lib/tabs.tsx` (TABS, BODY_DESTINATIONS, SETTINGS_DESTINATION), `app/lib/shell/*` (NavRail, TopBar, bottom tabs) |
| `Today-1d-Summit.dc.html` | `/` | `features/today/index.tsx`, `lib/TodayHeader.tsx` (TrendHeadline, TrendFacts), `TodayRings.tsx`, `QuickLogRow.tsx`, `TodaySession.tsx`, `ThisWeekCard.tsx`, `AiCard.tsx`, `CoachNote.tsx`, `RecentActivity.tsx` |
| `Dashboard-1d.dc.html` | `/dashboard` | `features/dashboard/index.tsx`, `lib/KpiBand.tsx`, `GoalRail.tsx`, `BodySection.tsx`, `NutritionSection.tsx`, `RecoverySection.tsx`, `TrainingSection.tsx` |
| `Log-1d.dc.html` | `/log` | `features/log/lib/LogPage.tsx`, `DateSwitcher.tsx`, `DayHeader.tsx`, `MealsSection.tsx`, `MealCard.tsx`, `WaterCard.tsx`, `SleepStepsCard.tsx`, `MeasurementsCard.tsx`, `FastingCard.tsx`, `FavouritesManager.tsx` |
| `Train-1d.dc.html` | `/train` | `features/train/lib/TrainPage.tsx`, `TodayCard.tsx`, `WeekSplitCard.tsx`, `TemplateCard.tsx`, `DraftTemplateCard.tsx`, `RecentSessions.tsx`, `ReadinessChip.tsx` |
| `Session-1d.dc.html` | `/train/session/:id` | `features/train/lib/SessionLogger.tsx`, `ExerciseLogCard.tsx`, `SetRow.tsx`, `RestTimerBar.tsx`, `FinishSummary.tsx` |
| `Progress-1d.dc.html` | `/progress` | `features/progress/index.tsx`, `lib/SummaryStats.tsx`, `WeightColumn.tsx`, `HabitsColumn.tsx`, `MilestoneList.tsx`, `TrainingSection.tsx`, `WeeklyReviewsSection.tsx` |
| `AskAI-1d.dc.html` | `/ai` | `features/ai/index.tsx`, `lib/Chat.tsx`, `ChatsRail.tsx`, `TurnView.tsx`, `ToolChips.tsx`, `Composer.tsx`, `PendingProposals.tsx`, `ProposalItem.tsx` |
| `Settings-1d.dc.html` | `/settings` | `features/settings/index.tsx`, `lib/SectionNav.tsx`, `lib/rows.tsx`, `lib/fields.ts`, `lib/AboutData.tsx` |
| `Scans-1d.dc.html` | `/scans` | `features/scans/lib/ScansPage.tsx`, `LatestScan.tsx`, `ScanCharts.tsx`, `DeltaTable.tsx` |

Supporting: `anim.js` (entrance and motion reference; the app already has `Reveal`/`useEntrance`), `muscle-map.js` (generated from the repo's `muscle-map/lib/geometry.ts`; use the repo's `MuscleMap` with the palettes below), `assets/food/*.svg` (already in the repo's food glyph set). `support.js` is only the mock runtime; do not port it.

## 2. Tokens

Add these to `apps/web/src/theme` as a `summit` token set and point the existing semantic tokens at them.

**Ink and surfaces**
- Page cream `#FFF8EE` · card `#FFFFFF` · warm well `#FFF5EC` · dashed empty slot bg `#FFFCF7`, border `2px dashed #E3D6F2`
- Ink `#1F1033` · deep ink (dark buttons, dark chips) `#2B0F4F` · body copy `#4E4063` · muted `#7A6B8E` · faint (placeholders, chevrons, axis) `#B8ABC9` · hairline `#F1E9F7`
- Soft violet fill (secondary buttons, neutral chips) `#F3ECFA`, hover `#EEE6FF`
- Accent violet `#7B3FE4` (links, focus, active set row), strong `#6A33D6`; link hover `#FF5D5D`
- Gold highlight `#FFD27A` (today, current, "you are here", done-check on dark)

**Status**: success `#0E8797` on `#DDF7F4` (dot `#17B8A6`) · warning `#C26A00` on `#FFF2DC` · danger `#E8384F` on `#FFEDE8`.

**Metric ramps** (bar gradient low→high, tint track)
- Calories `#FF4D6D → #FF9A6B`, track `#FFEDE8`
- Protein `#FF9F2E → #FFD36B`, track `#FFF2DC`
- Water `#129AAE → #5EE7DF`, track `#DDF7F4`
- Steps `#6A33D6 → #B18CFF`, track `#EEE6FF`
- Sleep `#3F3FC8 → #8FA2FF`, track `#E6E8FF`
- Muscle map: body `#F1E9F7`, stroke `#FFFFFF`, volume steps `#EEE6FF #C9B3FF #9A6BFF #6A33D6`; fat-share steps `#FFEDE8 #FFB3A6 #FF8A7A #FF4D6D`

**Gradients**
- Today sky: `linear-gradient(180deg,#1A0A42 0%,#3E1A73 26%,#9A3A8E 50%,#FF7569 70%,#FFBE86 86%,#FFE3B5 100%)`
- Inner-page sky: `linear-gradient(180deg,#1A0A42 0%,#3E1A73 38%,#9A3A8E 74%,#FF7569 100%)`
- Deep-sky card (one per screen, for the plan-level fact): `linear-gradient(170deg,#2B0F4F,#1A0A33)`, white text, `rgba(255,255,255,.08)` inner wells, `rgba(255,255,255,.1)` hairlines
- Coach / AI highlight: `linear-gradient(135deg,#4A1C78,#9A3A8E 60%,#FF7569)`
- Primary CTA (Start session, Finish, Send): `linear-gradient(135deg,#FF7569,#9A3A8E)`; gold CTA (Ask AI, + Log, Upload): `linear-gradient(135deg,#FFD27A,#FF8A5B)` with ink `#2B0F4F`

**Type** (revised: light weights, no heavy faces). **Outfit** for display and numbers, **DM Sans** for UI. Both from Google Fonts, `display=swap`:
`https://fonts.googleapis.com/css2?family=Outfit:wght@200..600&family=DM+Sans:opsz,wght@9..40,400..700&display=swap`
Add the weights to `index.html` and the theme (`fontFamily.display = 'Outfit'`, `fontFamily.body = '"DM Sans"'`). Nothing in the app goes above 600; `<b>`/`strong` = 600. Material Symbols Rounded stays for icons.
- Page h1: Outfit **300**, `clamp(34px, 8.5vw, 56px)`, line-height 1.05, letter-spacing -.02em (Ask AI and Settings: `clamp(32px, 7.5vw, 48px)`)
- Today trend number: Outfit **300** `clamp(84px, 22vw, 150px)`, line-height .9, -.03em; Dashboard hero number `clamp(52px, 14vw, 72px)`
- Card title: Outfit **400**, 17–20 px (section headings 24 px), -.01em
- Stat values: Outfit **400**, 17–30 px, tabular numbers; units beside them are DM Sans 500
- Eyebrow: DM Sans **600**, 13–14 px, uppercase, letter-spacing .12em (cards) or .16em (hero)
- Body: DM Sans **500**, 13–15 px; labels 500–600; captions 12 px 500 muted
- Weight map from the first draft (Outfit/DM Sans): DM Sans 800→600, 700→500, 600→500, 500→400; Outfit 700→300, 600→400, 500→300. The mocks already use the new values; copy them as they are.

**Radii**: hero/panel top `44px 44px 0 0` · large card 30 · tile card 26 · small card 22 · well 14–18 · button 12–16 · chip and pill 999.
**Shadows**: card `0 18px 50px rgba(74,28,120,.10)` (hover `0 22px 60px rgba(74,28,120,.2)`) · deep-sky card `0 18px 50px rgba(43,15,79,.3)` · cream panel over the sky `0 -20px 50px rgba(43,15,79,.18)` · coral CTA `0 10px 26px rgba(255,117,105,.35)` · gold CTA `0 8px 24px rgba(255,138,91,.4)` · bottom tab bar `0 12px 40px rgba(26,10,51,.45)`.
**Spacing**: card padding 22–28 px · gaps 26 (page rows) / 18 (tiles) / 8–14 (inside cards).

## 3. Shell

**Page frame**: the sky hero (inner pages `min-height 340px`, Ask AI / Settings `280px`, Today `660px`; `padding-bottom: 64px`) holds the nav, an eyebrow, the h1, a one-line subtitle and the page actions. Decorations: twinkling stars, a breathing sun glow and a floating sun disc centred around x ≈ 535–790 px (kept clear of the actions), and a two-layer ridge silhouette at the bottom (`rgba(37,12,70,.55)` / `rgba(26,10,51,.6)`). Then the cream panel: `margin-top:-44px`, radius `44 44 0 0`, the panel shadow, content inside.

**Horizontal gutter** (nav, hero row, panel): `max(clamp(16px, 4vw, 56px), calc((100vw - 1328px) / 2))`, so content is 1328 px max and centred.

**Summit nav, desktop (container ≥ 960 px)**: 46 px glass logo tile → Today; a glass pill (`rgba(255,255,255,.12)`, border `rgba(255,255,255,.2)`, blur 14) with the six TABS (labels = `title`: Today, Dashboard, Log, Train, Progress, Ask AI), active item white with ink `#2B0F4F`; on the right: Scans glyph (46 px circle), gold "Ask AI" pill, avatar "A" → Settings.

**Summit nav, mobile (< 960 px)**: a top bar (44 px logo tile, spacer, Scans circle, avatar) plus a **fixed bottom tab bar**: `left/right 10px`, `bottom: calc(10px + env(safe-area-inset-bottom))`, radius 24, `rgba(31,16,51,.94)` + blur 18, six equal cells from TABS (icon 22 px + `label`: Today, Dashboard, Log, Train, Progress, AI), each ≥ 52 px tall; active cell white with the filled icon. Give the page `padding-bottom: calc(84px + env(safe-area-inset-bottom))` so nothing sits under the bar. This replaces the phone's existing bottom tabs; keep `aria-current`, the rail test ids and the quick-log FAB rules (on Today and Log the hero "+ Log" button opens the sheet).

## 4. Responsive rules (implement exactly)

Breakpoints are **container widths** (the page column), not device names:
- `< 960`: mobile nav (§3); Session rest timer goes compact
- `< 900`: Ask AI hides the chats rail (the past-chats menu in the thread header stays the way to switch)
- `< 760`: Settings section nav stops being sticky and lays its links out as a 2-up grid (`repeat(auto-fill, minmax(140px, 1fr))`)
- `< 1180`: Today's mountain moves under the headline and scales: `scale = clamp((width − 24) / 850, .3, 1)`, hero `padding-bottom = 560 × scale + 20 px`

**Multi-column rows wrap; they never squeeze.** Every row of cards is `display:flex; flex-wrap:wrap; gap` (not a fixed grid). Each child gets `flex: <ratio×100> 1 <ratio × X>px` for a fraction column, or `flex: 1 1 <N>px` for a fixed column. That keeps the desktop ratios exact and wraps when the bases no longer fit. X = 280 by default and 150 for 4–5-up tiles; the exceptions are listed below. In MUI this is `Box sx={{ display:'flex', flexWrap:'wrap', gap }}` with `sx={{ flex: '160 1 448px', minWidth: 0 }}` on the children. Don't map it to `Columns md/lg`, which snaps at different widths.

| Screen | Row (desktop ratio) | Wrap basis |
| --- | --- | --- |
| Today | fuel card : coach + quick log (1.45 : 1) | X 280 |
| Today | five fuel gauges | always one row of five (`repeat(5, minmax(0,1fr))`); the card is a size container (`container-type:inline-size`); capsule `clamp(28px,10.5cqi,72px)` × `clamp(80px,26cqi,170px)`, value `clamp(12px,4.4cqi,24px)` with the unit at .62em, labels `clamp(10px,3.6cqi,14px)`; about 180 px tall on a phone |
| Today | quick-log buttons (5) | 80 px each |
| Today | session : AI check-in : this week (1 : 1 : 1) | X 280 |
| Dashboard | trend : against the plan (1.6 : 1); trend facts : sparkline (1fr : 300px) | X 280 |
| Dashboard | five KPI tiles | 150 px (2-up on a phone) |
| Dashboard | loss / composition / macros; training 1.2 : 1 : 1.1 | X 280 |
| Log | day header: eaten : macros : weigh-in (1.1 : 1.3 : 1) | X 260 |
| Log | macro bars 2-up | 150 px |
| Log | meals : rail (2 : 1) | X 280 |
| Train | today card : muscle panel (1fr : 300px); templates : recent (2 : 1); template cards 2-up | X 280 |
| Train | exercise list | `repeat(auto-fit, minmax(min(100%,300px),1fr))` |
| Train | tool cards (4) | 220 px |
| Train | week split (7 days) | horizontal scroll, `grid-auto-columns: minmax(128px,1fr)` |
| Session | exercises : rail (1fr : 320px) | X 280 |
| Session | set row grid | `36px 1.3fr 1fr 1fr .8fr 44px` (fluid, not wrapped) |
| Progress | four summary cards | 150 px |
| Progress | weight + charts : camps + habits (1.3 : 1); calories : macros 2-up; training 1 : 1.3 : 1.2 | X 280 |
| Ask AI | chats 260px : thread 1fr : pending 340px | px columns `1 1 Npx`, thread X 280 |
| Settings | nav 220px : cards | 220px / X 280 |
| Settings | profile and More two-column rows | 300 px |
| Settings | About this data (3) | 200 px |
| Scans | next scan : latest scan (1 : 2); composition chart : segments + water (1.3 : 1) | X 280 |
| Scans | latest-scan stat cells (4 + 4) | 130 px |

Other rules:
- **Tables** (meal items, segments, every scan) sit in an `overflow-x:auto` wrapper with `min-width:520px` and scroll sideways on a phone.
- **Header rows** inside cards (`title + chips + actions`) use `flex-wrap:wrap`, with `min-width:0` on the title.
- **Hero rows and hero actions** wrap: the segmented control and the buttons drop under the title on a phone.
- **Charts** use percentage geometry, and their grids are `repeat(n, minmax(0,1fr))` (never a bare `1fr`, which won't shrink below its content). Scans' fat/lean card is a size container: the bars are `clamp(12px,7cqi,44px)` wide with gaps `clamp(2px,1.2cqi,8px)`, the value labels `clamp(9px,2.6cqi,13px)` with no wrapping, and the axis copy is short ("Sep 26 · Nov 7 · Dec 19 · Summit") while the legend says which scans are expected.
- **Hero decoration** (sun glow and disc) is positioned in % (`left: calc(58% − half its width)`), so it shows at every width.
- **Session rest timer** is fixed to the bottom (`left/right 16px`, max-width 1328, centred with margins, not transforms). Below 960 it sits at `bottom: calc(92px + safe-area)` above the tab bar and hides the timer glyph and the "then …" line; "Skip rest" becomes "Skip".
- **Tap targets**: every interactive element is ≥ 44 px on a coarse pointer (the repo's `COARSE_POINTER_QUERY` and `tokens.tapTarget`).
- **Single-column stacks** (`display:grid` with only a gap) must declare `grid-template-columns:minmax(0,1fr)`; otherwise the implicit track grows to a table's 520 px min-width and pushes cards off the screen.
- Avoid fixed widths except the 220/260/300/320/340 px side columns above; anything that holds text uses `min-width:0`.


## 4b. Mobile package (390 × 844)

The phone version is the same code at a narrow container, not a separate app. `App-1d-Overview.dc.html` row 5 shows all nine pages live at 390 × 844; open any `*-1d.dc.html` at that width to inspect it. Checklist for Claude Code, per screen:
- **Nav**: compact top bar (44 px logo tile, Scans circle, avatar) plus the fixed six-tab bar (§3). Page bottom padding `calc(84px + env(safe-area-inset-bottom))`.
- **Hero**: h1 uses the clamp sizes in §2; the eyebrow, subtitle and actions wrap under the title; sun glow and disc stay in the sky.
- **Panel**: cream panel radius `44 44 0 0`, gutter `clamp(16px,4vw,56px)` (16 px at 390).
- **Layout**: every multi-column row wraps to one column (§4 table); KPI and summary tiles go 2-up; Today's five gauges stay in one row (container-query sizing).
- **Today**: mountain moves under the headline, scale `clamp((width − 24)/850, .3, 1)`.
- **Overflow**: tables and the Train week split scroll sideways inside their wrapper; the page itself never scrolls horizontally.
- **Ask AI**: chats rail hidden under 900; switch chats from the thread header menu. **Settings**: section nav is non-sticky, 2-up links. **Session**: rest timer sits above the tab bar, compact.
- **Targets**: ≥ 44 px tap size on coarse pointers; safe-area insets on the tab bar and rest timer.
- **Test at** 360, 390, 430 (phones), 768 (tablet portrait), 1024, 1440.

## 5. Screens

Copy is final. Use the real values from the hooks; the mock numbers below only show the shape.

1. **Today**: the full sky hero. Eyebrow "Day 12 of the climb · Wed, Oct 7"; trend number with count-up from the start weight; "Trend weight · weighed in at …"; a teal "↓ 1.5 kg since base camp" pill and a glass "28.6 kg to the summit" pill; a glass "Next camp · 90 kg" card with a gold progress bar. Mountain: the dotted route with milestone flags (90 / 85 / 80 / 75 / 70, the summit at 65 with its date) and the "You · 93.6" marker; the gold segment is the distance climbed. Panel: "Today's fuel" (five capsule gauges: kcal left, protein, water, steps, sleep) beside the coach note (gradient card) and the five quick-log buttons; then session (readiness ring, exercises, coral Start), AI check-in (suggestions plus the pending proposal with Accept / Reject / Why?) and the deep-sky "This week" (seven day dots: gold done, glowing today, ringed planned, dim rest, coral fast; the fast and next-scan rows).
2. **Dashboard**: window segmented control (30 / 90 / 180 days) and Export in the hero. Trend card (72 px number, pills, the base camp → summit bar, sparkline); deep-sky "Against the plan" (ring %, weekly rate, sessions, fasts, days logged, next camp, next scan); five KPI tiles with 12-bar sparklines (the bar for a day on target is the strong colour; today is the tint); weekly loss vs expected (dashed gold line = expected, legend in the caption); body composition; macro averages with input-method chips; Training: stacked weekly volume, the volume map, strength rows with % chips.
3. **Log**: date switcher pill (‹ Tue 6 · Today · Thu 8 disabled ›) and gold "+ Log". A three-part day header (eaten / macros / weigh-in with "Edit weigh-in"). Meal cards: Confirmed chip, kcal, menu, item table with an Estimated chip and source chips (Favourite, CNF, AI). Empty slots are dashed cards with "Add dinner"; dinner carries the gradient AI suggestion strip with "Use it". Rail: water (+250 / +500 / +750 / custom), sleep and steps tiles, measurements, deep-sky fasting (14-day strip, Plan a fast), favourites with + buttons.
4. **Train**: hero with the readiness pill and "Blank session". Today card (Planned · week plan chip, exercises with the +2.5 progression chip, coral Start session, Swap, "Generate with AI instead", muscle map panel); deep-sky week split (done gold-outlined, today white, planned dashed, fast coral) with "Generate the week"; templates 2-up with mini maps (today's has a gold ring and the gold "Today" chip); recent sessions with the PR chip and the weekly summary; four tool cards (AI workout uses the gradient).
5. **Session**: hero with ← Train, the Planned and In progress chips, and a glass stat strip (live mm:ss, sets, volume, readiness). The AI double-progression note (violet well). The current exercise card has a gold ring; done rows are teal wells with a teal check; the active row has a 2 px violet inset ring with the caret. Collapsed exercises show the "Trained yesterday" warning chip. Add exercise, coral Finish session, red text "Delete session". Rail: progress ring and per-exercise segments, deep-sky "Last time", coach notes, equipment. Floating rest timer per §4.
6. **Progress**: range segmented control and "Weekly report" in the hero. Four summary cards with status pills; the weight trend (smoothed line, weigh-in dots, the dashed gold plan line, dark tooltip); deep-sky "Camps on the way" (done check, current pulsing, upcoming rings, summit flag); weekly loss; calories vs target; stacked macros with the dashed protein minimum; water / steps / sleep counts; Training: the volume map with its 7-day slider, strength per exercise, weekly reviews.
7. **Ask AI**: hero eyebrow with the provider and model. Chats rail (the active chat has a gold ring; the rails card in the gradient); thread (dark user bubbles `#2B0F4F`, AI turns with a gold sparkle tile, tool chips with teal checks, food rows in warm wells, an inline deep-sky proposal strip, a thinking row); starter chips; composer (warm well, photo, mic, coral send); "Waiting for your tap" cards with Accept (dark) and Reject (soft violet), and recent Train changes with Undo.
8. **Settings**: section nav card (active link gold ring); cards for Rails (Confirm to edit warning chip), Daily targets, Training and scans (day tiles: on = deep ink, off = soft violet), App and AI (switch, the keys status chip, reminders), Profile and More (two-column rows that wrap), and a deep-sky "About this data". Values in Outfit with DM Sans units. Keep `EditDialog`, `ProfileDialog`, `TrainingDaysDialog` and the auto-apply confirm. The 2026 repo removed the "Breakfast slot" and "Weekly reports" items; they are not drawn here.
9. **Scans**: deep-sky next-scan card (date, "in 31 days", condition checks, masking note); latest scan (four stats with range/target notes in warning, second strip); fat vs lean grouped bars per scan with expected scans as dashed outlines and the dashed "fat at the summit" line (in the legend); segments table with fat-share bars and the fat muscle map; water and minerals; every-scan table with the guard chips (Lean held teal, Lean loss red, Water shift violet, Baseline, Upcoming dashed).

**Copy layer**: 1d uses a climbing vocabulary: base camp = start weight/date, summit = goal, camps = milestones, "the climb" = the plan. Put these in one copy module so they can be turned off.

## 6. Motion

Use the existing `Reveal` / `staggerDelay` / `useEntrance` contract (it already handles `prefers-reduced-motion`). Cards rise 26 px and fade in over 700–900 ms with `cubic-bezier(.16,1,.3,1)`, staggered 60–90 ms in reading order. The nav falls in; the hero h1 de-blurs; numbers count up over about 1.6–2.2 s; lines draw; bars grow from 0; rings draw. Ambient loops (twinkle, sun breathe and float, the route's marching dashes, ping on "today") stop under reduced motion. Confetti on click is optional; if you keep it, use it only for Accept and Finish session.

## 7. Done when

- All nine screens match the mocks at 1440 px and reflow per §4 at 1024, 768, 390 and 360 px, with no horizontal page scroll (only the tables and the week split scroll).
- The mobile nav works with VoiceOver/TalkBack labels, `aria-current` and safe-area insets; nothing hides under the tab bar or the rest timer.
- Lighthouse a11y ≥ the current score; text contrast ≥ 4.5 : 1 (muted `#7A6B8E` on white passes; `#B8ABC9` is for placeholders and decoration only).
- The existing unit and e2e tests pass unchanged, and the test ids are kept.
