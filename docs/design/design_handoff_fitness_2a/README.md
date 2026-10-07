# Handoff: Fitness web app — "2a" desktop redesign

## Overview

A desktop-first redesign of Aaron's single-user fitness tracker (`aaronjoseph94/fitness-app`, `apps/web`). Direction **2a** is a clean, component-library dashboard in the shadcn/ui idiom: a labelled 240 px sidebar, a 56 px breadcrumb header, hairline-bordered white cards on white, the repo's accent blue `#166FE5`, and motion limited to one staggered entrance, number count-ups and chart draws.

Nine screens were designed: Today, Dashboard, Log, Train, Session logger, Progress, Ask AI, Settings, Scans. They all share one shell (sidebar + header) and show the same day of data (Wednesday Oct 7, 2026, day 12 of the plan) so they can be compared like for like. Screens that were **not** drawn but use the same kit: exercise library, equipment, workout builder, AI workout, plan history, photos, reminders, export/restore, the weekly report print page.

## About the design files

The files in this bundle are **design references created in HTML**. They are prototypes that show the intended look and behaviour; they are not production code to copy into the app. The task is to **recreate these designs inside the existing codebase** (React 19 + MUI + Recharts, `apps/web/src`, every visual token in `theme.ts`) using its established patterns: the `features/<module>` layout, `components/` kit (`MetricCard`, `StatCard`, `ChartCard`, `SectionHeader`, `PageHero`, `ProposalCard`, `Reveal`/`useEntrance`), the chart kit in `charts/`, the `muscle-map/` module, and the route table in `app/lib/routes.tsx`. Keep every data read, write, guard and test id where it is; this is a presentation change.

The prototypes are "Design Component" HTML files (`*.dc.html`). Each has a template section (plain HTML with inline styles) followed by a small logic class. The inline styles are the spec: colours, sizes, radii, spacing and type are all literal and can be read straight off the markup. To view them, serve this folder with any static server (for example `npx serve .`) and open `App-2a-Overview.dc.html`; the pages link to each other through the sidebar.

## Fidelity

**High-fidelity.** Colours, type sizes, weights, spacing, radii, borders and copy are final and should be matched. Chart data is illustrative (it is the real plan's numbers for the 12 logged days, hand-placed); wire real data through the existing hooks (`useTodayData`, `useDashboardData`, `useProgressData`, `useTrainData`, `useDayMeals`, `useScans`, `useChat`, `useSettings`) and keep the engine's numbers.

## Shell (every screen)

Layout: `display:grid; grid-template-columns: 240px minmax(0,1fr)` on a 1440 px design width. The content column is `display:flex; flex-direction:column` with the header then `<main>`.

### Sidebar — `Shell2a-Sidebar.dc.html`
Replaces `app/lib/shell/NavRail.tsx` from `md` up (the phone keeps `BottomTabs`).
- Column: width 240, background `#FAFAFA`, `border-right: 1px solid #E4E4E7`, padding `14px 12px`, full page height.
- Brand row: 32 px blue tile (`#166FE5`, radius 8) with the app mark; "Fitness" 14/600 and "Aaron's tracker" 12 `#71717A`; `unfold_more` glyph 18 px `#71717A`.
- Group labels: 11 px, 600, uppercase, letter-spacing .04em, `#A1A1AA`, padding `0 8px 6px`. Groups: **Overview** (Today, Dashboard, Log, Train, Progress, Ask AI), **Body** (Scans, Photos, Plan history, Weekly reports), then a 1 px divider and Settings.
- Item: height 36, padding `0 10px`, radius 8, gap 10, icon 18 px, label 14 px. Inactive `#3F3F46` / 500; hover background `#F4F4F5` and text `#09090B`. Active: background `#F4F4F5`, `box-shadow: inset 0 0 0 1px #E4E4E7`, text `#09090B` 600, filled icon variant, `aria-current="page"`.
- Ask AI carries a count badge: pill `#166FE5` white, 11/600, padding `1px 7px`, `margin-left:auto`.
- Account block at the bottom of the nav: white card, radius 10, border `#E4E4E7`, padding 8; 32 px avatar tile `#E4E4E7`, name 13/600, status "Synced" 12 `#71717A` with a 6 px `#16A34A` dot (use the existing `SyncStatus` states: Synced / Offline / N pending).
- Icons: Material Symbols Rounded, optical size 20. In the app, keep MUI's rounded icon set (`TodayRounded`, `SpaceDashboardRounded`, `RestaurantRounded`, `FitnessCenterRounded`, `InsightsRounded`, `AutoAwesomeRounded`), outlined when inactive — the same pair rule `tabs.tsx` already has.

### Header — `Shell2a-Header.dc.html`
Replaces `TopBar.tsx` on desktop.
- Height 56, `border-bottom: 1px solid #E4E4E7`, padding `0 28px`, gap 12, white.
- Left: `dock_to_right` toggle glyph 18 px `#71717A`, 1 × 18 px divider, breadcrumb 14 px: "Fitness" (`#71717A`) › current page (500). The page title no longer lives in the bar; each page has its own 26 px `<h1>`.
- Right: search field 260 × 36, radius 8, border `#E4E4E7`, placeholder "Search…" `#71717A`, `⌘K` kbd (11/500, border `#E4E4E7`, background `#FAFAFA`, radius 5) — this opens the existing `CommandPalette`; "Ask AI" outline button (36 px, border `#E4E4E7`, blue filled `auto_awesome` icon) — opens `AskAiHost`; notifications icon button 36 × 36 outline; 32 px avatar `#166FE5` white "A" linking to Settings.

## Design tokens

Colours
- Ink: text `#09090B`; secondary `#52525B`; muted `#71717A`; faint `#A1A1AA`; disabled `#D4D4D8`
- Surfaces: page `#FFFFFF`; sidebar / tinted panels `#FAFAFA`; muted fill `#F4F4F5`
- Borders: card `#E4E4E7`; row hairline `#F4F4F5`; dashed empty-slot `#D4D4D8`
- Accent: `#166FE5` (hover `#1263CC`); tint `#EFF6FF`; light `#DBEAFE` / `#BFDBFE` / `#93C5FD` / `#60A5FA`; dark button `#09090B` (hover `#27272A`)
- Metrics: calories `#F0612B` (track tint `#FDD9CC`, meal stack `#F59E6B`); protein `#D97706` (`#FCE4C2`); water `#0EA5E9` (`#CFEFFC`); steps `#16A34A` (`#D1FAE0`); sleep `#7C3AED` (`#E4D9FB`); fat mass / goal line `#F43F5E` (`#FDA4AF`, `#FECDD3`); carbs `#93C5FD`; fat `#C4B5FD`
- Status: success text `#15803D` on `#DCFCE7`; warning text `#B45309` on `#FEF3C7` (deep `#92400E`); danger text `#B91C1C` on `#FEE2E2` / `#FEF2F2`; info text `#1E3A8A` on `#EFF6FF` with border `#BFDBFE`
- These sit alongside the existing `tokens.metric.*` palette; where the app already has a measured colour for a metric, keep it and map the tints as 12 % / 16 % alphas of it, as `MetricCard`'s plain surface already does.

Typography — one family, **Geist** (fallback `system-ui`). The repo currently uses the platform system stack; adding Geist is a one-line change in `theme.ts` (`@fontsource-variable/geist`) and is optional: the layout holds with the system face.
- Page title 26/600, letter-spacing −.02em, line-height 1.2; page subtitle 14 `#71717A`
- Section title 16/600; section description 13 `#71717A`
- Card title 14/600; card description 12 `#71717A`
- Stat value 28/600, letter-spacing −.02em, `font-variant-numeric: tabular-nums`; hero value 34–40/600 (−.03em); unit 13 `#71717A`
- Body 14; dense body and tables 13; captions 12; micro labels 11/500 uppercase letter-spacing .04em
- Buttons 14/500 (small 13/500, tiny 12/500)

Spacing: 4 px base. Card padding `18px 20px` (dense `16px 18px`); main padding `24px 28px 36px`; grid gap 16 between cards, 20–24 between sections; row padding `8px`–`12px`; label-to-value 10 px; bar-to-caption 8 px.

Radii: cards 12; controls, buttons, inputs, table cells 8; small chips/badges 5–6; pills 999.

Shadows: card `0 1px 2px rgba(0,0,0,.04)`; primary button `0 1px 2px rgba(0,0,0,.08)`; selected segment `0 1px 2px rgba(0,0,0,.08)`; tooltip `0 4px 12px rgba(0,0,0,.15)`; floating rest timer `0 12px 32px rgba(9,9,11,.28)`; highlighted card `0 0 0 3px #EFF6FF` with a `#166FE5` border.

Borders: 1 px everywhere; focus ring on inputs `border #166FE5` + `box-shadow 0 0 0 3px #DBEAFE`.

## Components (the kit)

- **Card**: white, `border 1px #E4E4E7`, radius 12, card shadow. Header row `padding 16px 20px 12px` with title 16/600 + description 13 muted + right-side actions. Body uses either a table or 13 px rows separated by `#F4F4F5` hairlines.
- **Stat card** (five across): `padding 18px 20px 16px`; label 13/500 `#52525B` with a 16 px `#A1A1AA` glyph right-aligned; value 28/600 with unit "/ 1,400 kcal" 13 muted; 6 px progress track `#F4F4F5` radius 999 with the metric colour fill; caption 12 muted with the key figure 500 `#09090B`.
- **Mini bar sparkline** (dashboard tiles): 12 bars, `display:flex; align-items:flex-end; gap:3px; height:40px`, bars radius 2 in the tint, days that hit the target in the full metric colour; target as a 1 px dashed `#A1A1AA` line positioned by percentage.
- **Segmented control**: container `padding 3px; radius 9; background #F4F4F5`; item `padding 6px 12px; radius 7; 13/500`; selected white with the segment shadow; others `#71717A`. Dark variant (Log date switcher) selected `#09090B` white.
- **Buttons**: primary 36 px `#166FE5` white 14/500 radius 8; dark primary `#09090B` white (Accept actions); outline white with `#E4E4E7` border, hover `#F4F4F5`; ghost (text only) hover `#F4F4F5`; destructive text `#B91C1C`, hover `#FEF2F2`. Sizes 36 / 34 / 32 / 30. Icon-only 36 × 36 (small 30 × 30, 26 × 26 for row actions).
- **Badge / chip**: `padding 1–3px 6–8px`, radius 5–6, 11–12/600: success, warning, info-blue (`#EFF6FF`/`#166FE5`), neutral (`#F4F4F5`/`#52525B`), outline (`#E4E4E7` border, `#52525B`).
- **Table**: `border-collapse: collapse; font-size 13`; thead 12 `#71717A` 500 with `#E4E4E7` top and bottom borders; cells `padding 8–9px`, numeric columns right-aligned with tabular figures; row borders `#F4F4F5`; first/last cells padded to the card's 18–20 px gutter.
- **Row (settings / list)**: full-width button, `padding 12px 20px`, `#F4F4F5` top border, label 14/500 + help 12 muted, value right in `#52525B`, `chevron_right` 18 px `#A1A1AA`, hover `#FAFAFA`.
- **Switch**: 40 × 22 pill, off `#E4E4E7`, on `#166FE5`, 18 px white knob with `0 1px 2px rgba(0,0,0,.2)`.
- **Input (set row)**: height 34, radius 7, border `#E4E4E7`, `padding 0 10px`, 13 px tabular; placeholder `#A1A1AA`; focused state as above.
- **Tooltip** (chart): `#09090B` white, 12 px, radius 8, padding `6px 10px`, legend squares 8 × 8 radius 2.
- **Chart frames**: SVG with `viewBox="0 0 1000 300"` and `preserveAspectRatio="none"`; gridlines `#F4F4F5`; baseline `#E4E4E7`; axis labels 11 `#A1A1AA`; trend line `#166FE5` 2–2.5 px with an area fill fading from 16–18 % to 0; weigh-in dots 8 px white with `#A1A1AA` 1.5 px ring; the current point 10 px `#166FE5`; forecast dashed `#166FE5` `5 5` over a `#EFF6FF` band; goal line `#F43F5E`; targets as 1–1.5 px dashed lines. Map to Recharts: `Line` + `Area` + `ReferenceLine` + `Scatter`, `CartesianGrid` horizontal only.
- **Muscle map**: the existing `MuscleMap` with four steps `#DBEAFE`, `#93C5FD`, `#60A5FA`, `#166FE5` on body `#E4E4E7`/`#F4F4F5`, white strokes. Sizes 92 (template card), 128–200 (today card, volume map), 64 (scan segments, front view only, red steps `#FECDD3` → `#F43F5E`).
- **Food icons**: the repo's `/food-icons/*.svg` (Fluent Emoji Flat) at 20–22 px beside meal items.

## Screens

### 1. Today — `Today-2a-Shadcn.dc.html` (route `/`)
Purpose: the one page opened every day; log, see today's numbers and what the AI said.
Layout: `main` grid, gap 20. Title row → five stat cards → 2 : 1 grid (chart card | session card + week card) → 1 : 1 : 1.3 grid (coach note | proposal | recent activity table).
- Title row: "Good afternoon, Aaron" 26/600; subtitle "Wednesday, October 7 · Day 12 of the plan · Upper B — Pull at 4:30 PM"; segmented "Today / 7 days / 30 days"; primary split button "+ Log ▾" (opens the quick-log sheet).
- Stat cards: Calories 860 / 1,400 kcal, 61 % bar `#F0612B`, "540 left · 2 meals logged"; Protein 82 / 130 g, "48 g to go · protein first"; Water 1.75 / 3.0 L, "1.25 L to go · last at 1:50 PM"; Steps 6,240 / 9,000, "2,760 to go · Watch, 2:02 PM"; Sleep 6.9 / 7.5 h, "11:22 PM – 6:31 AM".
- Weight trend card: title + description; segmented "12 days / 8 weeks / Journey"; value row 93.6 kg trend, success pill "↘ 1.5 kg", "Weigh-in 93.2 kg at 7:04 AM"; chart 220 px with area, line, 12 weigh-in dots, hover tooltip at the last point; footer of four stats separated by `#E4E4E7`: Since Sep 26 −1.5 kg from 95.1 · 7-day change −1.0 kg on pace (green) · To go 28.6 kg to 65 · Projected finish Jul 20, 2027 at 0.70 kg/wk. Empty state: the existing `ChartCard` empty prop ("The trend starts with a weigh-in").
- Today's session card: "Upper B — Pull · 6 exercises · 18 sets", chips "4:30 PM" (outline) and "Readiness 74" (success), six exercise rows "name — 3 × 10–12 · 45 kg", primary "▶ Start session" + outline "Edit".
- This week card: 7 cells 34 px high: done = `#DCFCE7` with a `#15803D` check; today = `#166FE5` white dumbbell; planned = dashed `#D4D4D8`; rest = `#FAFAFA`; fast = `#FEF3C7` timer `#B45309`; legend line below.
- Coach note: `push_pin` 18 px; "Coach note" 14/600 with "Claude · until Oct 11" 12 muted; body 13/1.55 `#3F3F46`.
- Proposal card: "Proposal" + "Pending" neutral chip; title 15/600; two before→after rows on `#FAFAFA` (struck-through old value in `#A1A1AA` → bold new value); "Accept" dark, "Reject" outline, "Why?" link right-aligned. Wire to `useProposalDecision`.
- Recent activity: table Time / Event / Value, event names carry an outline chip (Watch, Water, Lunch, Breakfast, Weigh-in) or a blue AI chip; "View log" link.

### 2. Dashboard — `Dashboard-2a.dc.html` (`/dashboard`)
Purpose: the overview of a window of history.
Layout: title row (h1 "Welcome back, Aaron", subtitle with the window's dates and days logged, segmented "30 / 90 / 180 days", outline "Export"), then sections with a 16/600 title + 13 muted description.
- **Now** band: 12-column grid, gap 16. Hero card spans 8 (two-column inside: facts | 120 px sparkline): "Trend weight", 40 px value 93.6 kg, success pill "trending_down 1.5 kg this window", goal progress bar 6 px `#166FE5` at 5 % with "Start 95.1 kg · Sep 26 / 5 % of the way / Goal 65.0 kg" labels, footnote with goal date, rate and next milestone. Goals rail spans 4 columns × 2 rows on `#FAFAFA` ("Against the plan", 84 px ring at 5 %, then rows Weekly rate −0.78 / −0.70 kg "ahead", Sessions 6 / 8 "2 left", Fasts 0 / 2 "Sat", Days logged 12 / 12 "100 %", Next milestone 90 kg · Nov 12, Next Evolt scan Nov 7, Expenditure estimate 2,551 kcal; link "Plan history and rails →"). Five tiles span 4 each (Average intake 1,319 kcal −81 vs target; Protein 120 g −10 in warning colour; Steps 7,638; Sleep 6.9 h; Water 2,783 ml), each with the 12-bar sparkline and target line. This maps onto `KpiBand` (`span` 8 / 4) and `GoalRail`.
- **Body**: 1.6 : 1 : 1 grid. Weight trend and forecast (journey chart with milestone dots at 90/85/80/75/70 and the goal dot, y labels 90/80/70/65, x Sep 26 / Jan / Apr / Jul 20 2027); Weekly loss vs expected (two bars −0.8 / −0.7 against a dashed −0.70 line); Body composition (37.3 % body fat vs goal ≤ 18 %, visceral 16 vs ≤ 9, fat/lean split bar 35.5 | 59.6 kg).
- **Nutrition**: Calories per day by meal (12 stacked bars breakfast `#F0612B` / lunch `#F59E6B` / dinner `#FDD9CC`, dashed red 1,400 target, y 1.6k/800/0); Macros daily average (four 6 px bars: protein 120/130, carbs 108/119, fat 44/45 min, fibre 24/30); Meals logged by input method (text 19, photo 8, favourites 6, barcode 2, voice 1; "36 meals · 3 estimated by the AI").
- **Recovery and habits**: four equal cards — Steps (12 bars, target line), Sleep (12 bars), Fasting (14 day cells: past `#F4F4F5`, today `#166FE5`, planned dashed `#B45309`), Logging (12 cells `#16A34A`/`#86EFAC`/`#BBF7D0` for full/partial/in-progress).
- **Training**: Weekly volume (two stacked bars legs `#166FE5` / back `#60A5FA` / chest `#93C5FD` / arms `#DBEAFE`, y 16 t / 8 t / 0, captions with session counts and kg); Volume map (200 px muscle map, four-step legend); Strength (e1RM rows Leg press 142 → 150 kg +5.6 %, Chest press 62 → 66, Lat pulldown 58 → 60, Seated cable row flat; footnote about double progression).

### 3. Log — `Log-2a.dc.html` (`/log`)
Layout: title row with the date switcher (outline segmented: ‹ · Tue 6 · **Today · Wed, Oct 7** dark · Thu 8 disabled · ›) and "+ Log ▾"; a three-part day header card (Eaten today 860 / 1,400 with bar and "540 kcal left · 2 of 4 slots logged · dinner planned 450" | Macros four bars protein 82/130 "48 g to go" warning, carbs 71/119, fat 29/45 min, fibre 17/30 | Weigh-in 93.2 kg · 7:04 AM, trend 93.6, −1.0 kg over 7 days, "Edit weigh-in"); then 2 : 1 grid.
- Meals column: one card per slot. Confirmed meals (Breakfast 7:40 AM planned 350, 320 kcal; Lunch 12:30 PM planned 540, 540 kcal, "from a photo") have a header with a success "Confirmed" chip, kcal 14/600, a `more_horiz` menu, and an item table Item (icon + name, "Estimated" warning chip when the AI guessed) / Grams / kcal / Protein / Source chip (Favourite, CNF, AI). Empty slots (Dinner planned 450, Snack planned 60) are dashed `#D4D4D8` cards on `#FAFAFA` with an "+ Add dinner" outline button; Dinner also shows the AI suggestion strip (blue sparkle, copy, two food icons, dark "Use it"). Statuses analysing / review map to the existing `MealCard` states; keep the `MealReviewDialog`.
- Rail: Water (1.75 / 3.0 L bar, +250 / +500 / +750 ml outline buttons + custom pencil, entries list); Sleep and steps (Apple Watch chip, two `#FAFAFA` tiles 6.9 h and 6,240, "Enter by hand"); Measurements (4-column grid of tape values, waist −1.5 green delta, waist-to-hip 0.99 vs goal < 0.90, "Measure now · due Mon"); Fasting (0 of 2 this month, warning strip "Next: Saturday, Oct 10 · 24 h from 8:00 PM Fri · water target 3.5 L", 14-cell strip, "Plan a fast"); Favourites (icon, name · grams, kcal, 26 px "+" button; "Recipe" outline chip; "Manage" link).

### 4. Train — `Train-2a.dc.html` (`/train`)
Layout: title "Wednesday, Oct 7" with "Training day 3 of 4 this week · 2 sessions done"; readiness chip (outline, green dot, "Readiness 74 · full volume", info glyph); "+ Blank session". Today card spans full width: left — "Planned · week plan" blue chip, "4:30 PM · Anytime Fitness", h2 22/600 "Upper B — Pull", meta line, two-column exercise list with numbers in `#A1A1AA` and the progression "+2.5" in green, primary "Start session" (links to the session logger), outline "Swap an exercise", right-aligned link "Generate with AI instead"; right — 260 px `#FAFAFA` panel with a 200 px muscle map and caption. Then 2 : 1 grid: Templates (2 × 2 cards: 92 px muscle map, name 15/600, weekday chip, "6 exercises · 18 sets · muscles", last-done line, "▶ Start" outline + edit icon; today's template has the `#166FE5` border and `0 0 0 3px #EFF6FF` ring and a blue "Today" chip; "+ New template" link in the section header) | Recent (card of rows: day/date stack 36 px wide, name 600, "16 of 16 sets · 4,320 kg · 48 min", optional "PR" success chip, chevron; "All sessions" link; a `#FAFAFA` "This week" summary: Sessions 2 / 4, Volume 8,180 kg, Deload in 4 wks). Bottom: four tool cards in a row (36 px `#F4F4F5` icon tile in blue, title 14/600, 12 px meta, chevron): Exercise library "542 allowed of 876", Equipment "Anytime Fitness · 47 machines", Workout builder, AI workout (tile `#EFF6FF`).

### 5. Session logger — `Session-2a.dc.html` (`/train/session/:id`)
Layout: `main` grid `minmax(0,1fr) 320px`, bottom padding 110 for the floating timer.
- Header: "← Train" link, "Planned session" blue chip, "In progress" success chip with a breathing green dot; h1 "Upper B — Pull"; right — a `#FAFAFA` stat strip (Time mm:ss live, Sets 7/18 with the total in `#A1A1AA`, Volume 1,560 kg, Readiness 74), 20/600 values.
- Start notes: info banner `#EFF6FF`, border `#BFDBFE`, text `#1E3A8A` 13 px — the double-progression note and the recovery conflict. Source: `SessionLogger`'s `notes[]`.
- Exercise card: header row (44 px thumb tile `#F4F4F5` — use `ExerciseThumb`; "1 · Lat pulldown" 15/600; state chip Done / Current / "Trained yesterday" warning; meta 13 muted "Lats, biceps · cable · 3 × 10–12 · rest 90 s · last time 3 × 12 at 45 kg"; "About" outline + `more_horiz`). Column header strip on `#FAFAFA`, 11 px uppercase: Set · Previous · kg · Reps · RPE · Done, grid `48px 110px 1fr 1fr 90px 56px`. Set rows: done rows tinted `#F0FDF4` with a 22 px `#16A34A` check tile; the active input has the focus ring and caret; untouched sets show `#A1A1AA` placeholders and an empty 22 px checkbox (`#D4D4D8` border, hover `#16A34A`). Footer: "+ Add set", "Copy previous", progression hint right-aligned. The current exercise gets the blue border + ring. Collapsed exercises (3–6) show header only with "0 of 3 sets" and `expand_more`.
- Actions: "+ Add exercise" outline, "Finish session" primary (opens the existing confirm dialog), "Delete session" destructive text right-aligned.
- Rail: Progress (56 px ring 39 %, "7 of 18 sets ticked", six 6 px segment bars), Last time (17/18 · 3,540 · 49 m tiles, "Beat it today" copy), Coach notes (two `#FAFAFA` paragraphs), Equipment at this gym (`#FAFAFA` card).
- Rest timer: fixed to the bottom, inset `left 268px; right 28px; bottom 24px`; `#09090B` bar, radius 12, floating shadow; timer glyph `#60A5FA`, "Rest · then Seated cable row, set 2" 12 `#A1A1AA`, mm:ss 22/600, 6 px progress `#60A5FA` on `#27272A` shrinking with `transition: width 1s linear`, "+30 s" outline (border `#3F3F46`), "Skip rest" white. Replaces `RestTimerBar`'s visual; keep its notifier hook.

### 6. Progress — `Progress-2a.dc.html` (`/progress`)
Layout: title "Progress" + "Sep 10 – Oct 7 · 28 days · 12 with data since the plan started"; segmented "4 weeks / 12 weeks / All"; outline "Weekly report". Four summary stat cards (Trend change −1.5 kg with success pill "−0.78 kg/wk"; Average intake 1,361 kcal neutral pill "−39 vs 1,400"; Average protein 123 g warning pill "−7 vs 130"; Adherence 100 % success pill "12 of 12 days"). Two columns, each with a 16/600 heading:
- Weight and body: Weight trend (same chart as Today with tooltip; footer Finish Jul 20 2027 · Band ±20 % Jun 2 – Sep 30 · Next milestone 90 kg · Nov 12); Weekly loss vs expected (four week slots, two with bars); Milestones list (done check `#16A34A`, next = blue ring, later = grey rings; "scan" / "tape · now 0.99" captions).
- Food, water and recovery: Calories vs target (12 bars `#F0612B`, today in the tint, dashed black target); Macros (12 stacked bars protein `#D97706` / carbs `#93C5FD` / fat `#C4B5FD`, dashed protein line at 130); three small cards Water / Steps / Sleep (56 px bar strips with counts of days on target); Fasting strip (28 cells, grey before the plan start, `#E4E4E7` since, today black, planned dashed).
- Training section (1.5 : 1 : 1.2): Weekly volume (four week slots), Volume map (180 px map with a 7-day range slider: 4 px track, blue filled portion, 14 px white knob with blue ring), Strength per exercise (exercise picker "Leg press ▾", 5-point line with dots, label "150 kg", "+14 kg in four sessions").
- Bottom 1 : 1: Week plan table (Day / Session / kcal · protein / Last week; today's row `#EFF6FF`; Sat in warning colour) with an "Active" chip; Weekly reviews (rows with a document tile, "Week of Sep 28" + "Claude" blue chip or "AI draft" neutral chip, summary line, time, chevron; footer note about Sunday drafts).

### 7. Ask AI — `AskAI-2a.dc.html` (`/ai`)
Layout: `main` grid `260px 1fr 340px`, full height (the page is 960 px tall in the mock; in the app, `100dvh − 56px` with the thread scrolling).
- Chats rail (`#FAFAFA`, right border): "Chats" 13/600 + "+ New" small outline; list items (title 13, time 12 muted; active item `#F4F4F5` with inset ring); provider card at the bottom (green dot, "Groq · llama-3.3-70b", 12 px copy about rails).
- Thread: header row (title 15/600, "4 messages · reads Today, favourites, plan", menu); messages bottom-aligned, gap 18. User turn: right-aligned bubble `#09090B` white, 14/1.5, padding `10px 14px`, radius `14 14 4 14`, max-width 520. AI turn: 28 px `#EFF6FF` sparkle tile, then tool chips (outline pills 11 px with a green check — `ToolChips`), reply text 14/1.6, optional structured block (food rows with icons, grams, "46 g · 248 kcal"), action buttons ("Log this as dinner" dark, "Save as a favourite" outline), timestamp "2:15 PM · 1.8 s" in `#A1A1AA`. Proposals inside a reply render as a `#FAFAFA` strip (icon, title 600, before → after, Accept dark / Reject outline). A "thinking" row shows three breathing dots and "Checking Friday's dinner target…".
- Composer: starter chips (30 px outline pills) above a 12 px-radius bordered box: placeholder 14 `#A1A1AA` with caret, photo + mic ghost icon buttons, 36 px blue send; helper line "Enter to send · Shift + Enter for a new line · the AI never sees your progress photos". Map to `Composer.tsx` (dictation where supported).
- Right rail: "Waiting for your tap" with a blue count badge; one card per pending proposal (source line with icon + time, title 14/600, before → after rows on `#FAFAFA`, "Why:" 12 px, Accept / Reject, "Plan history" link). Bottom: `#FAFAFA` "Rails the AI works inside" card listing the rails.

### 8. Settings — `Settings-2a.dc.html` (`/settings`)
Layout: `main` grid `200px 1fr`, gap 28; left — sticky section nav (14 px, active `#F4F4F5` 600); right — max-width 820 stack, gap 24, h1 "Settings" + subtitle about saving and confirmation.
Groups as cards (title 16/600, optional description 13 muted, rows as described in the kit): **Rails** ("Confirm to edit" lock chip; Calorie floor 1,400 kcal; Calorie ceiling for proposals 1,700 kcal; Protein minimum 130 g; Fat minimum 45 g; Fasting pattern 2 × 24 h a month) · **Daily targets** (Fibre 30 g; Water 3,000 ml with help "Fast days go up to 3,500 ml automatically") · **Training and scans** (Training days as seven 28 × 24 day tiles, Mon–Thu in `#09090B`, others `#F4F4F5`/`#A1A1AA`; Scan interval 42 days "Next Evolt scan due Nov 7") · **App and AI** (switches: Apply safe AI changes off, Breakfast slot on; links: Model keys and the Claude connector with "3 keys set" green status; Reminders with a summary) · **Profile** two-column rows (Goal weight 65.0 kg, Goal date 2027-07-20, Start weight 95.1 kg, Start date 2026-09-26, Height 165 cm, Sex Male, Birth date "Not set · age 31 at baseline" in `#A1A1AA`, Time zone America/Edmonton) · **More** two-column link rows with 18 px icons (Plan history "v7 active", Scans "next Nov 7", Apple Watch import, Progress photos "6 photos", Export and restore "backup Oct 1", Weekly reports) · **About this data** (`#FAFAFA` card, three 13 px columns: Kept on Cloudflare / Kept on this device / Never sent to an LLM; footer with time zone, build and "Export everything" link). Keep every existing dialog (`EditDialog`, `ProfileDialog`, `TrainingDaysDialog`, the auto-apply confirm) and the snackbar.

### 9. Scans — `Scans-2a.dc.html` (`/scans`)
Layout: title "Evolt 360 scans" + conditions subtitle; "Enter by hand" outline, "Upload sheet" primary (opens `UploadSheet`). Row 1 (1 : 2): Next scan card on `#FAFAFA` ("Sat, Nov 7", "in 31 days" outline pill, explanation, three condition checks with green `check_circle`, masking note) | Latest scan card ("Latest scan · Sep 26, 2026", "Baseline" chip, "Open scan" link; four stat cells Weight 95.1 kg / Body fat 37.3 % "range 15–20 %" warning / Lean mass 59.6 kg "32.5 kg skeletal muscle" / Visceral level 16 "target 9 or lower" warning; second strip Visceral fat 6.9 kg · 188 cm², Subcutaneous 28.6 kg, BMR · TEE 1,657 · 2,551 kcal, Waist-to-hip · bio age 1.02 · 38). Row 2 (1.3 : 1): Fat and lean mass chart (grouped bars per scan: baseline solid `#F43F5E` 35.5 / `#166FE5` 59.6 with value labels; expected future scans and "At goal" as dashed outlines fading; dashed red "fat at goal 11.7" line; y 70 kg / 35 / 0) | Segments table (Segment / Lean / Fat / Fat share with a 70 px inline bar; torso 27.7 / 20.5 / 43 %, legs, arms; 64 px front-view muscle map in red steps) and Water and minerals (TBW 42.9 kg, ICF · ECF 29.0 · 13.9, Protein · mineral 11.3 · 5.4 kg; hydration note). Row 3: Every scan table (Date / Conditions / Weight / Body fat / Fat Δ / Lean Δ / Guard) with an upcoming Nov 7 row on `#FAFAFA` and the Sep 26 baseline; legend for the "Lean loss" (danger) and "Water shift" (outline) guard chips.

## Interactions and behaviour

- **Entrance** (every page, once per mount): cards rise 26 px and fade in over 700 ms, `cubic-bezier(.16,1,.3,1)`, staggered 60–90 ms per card in reading order; headline numbers count up over ~1.6 s with an exponential ease-out; chart lines draw (stroke-dasharray) over 1.4–1.8 s; bars grow from 0 width/height over 1.4 s; rings draw over 1.4 s. Under `prefers-reduced-motion` everything appears in place with a 200 ms cross-fade (the app's existing `useEntrance` / `Reveal` already implement this contract; retune `tokens.motion` durations to 700 ms rise, 1,600 ms count).
- **Hover**: outline buttons and rows → `#F4F4F5` / `#FAFAFA`; sidebar items → `#F4F4F5`; primary button → `#1263CC`; card borders do not change.
- **Press**: keep the app's instant 100 ms scale 0.98 on buttons (no ripple).
- **Focus**: inputs get the blue border + 3 px `#DBEAFE` ring; buttons the browser focus ring in `#166FE5`.
- **Confetti**: in the prototypes, Accept / Start / Log buttons burst 26 confetti particles (900–1,500 ms) on click. Optional in the app; if kept, only on Accept and Finish session.
- **Live values**: the session clock ticks every second from `started_at`; the rest timer counts down from the exercise's rest (90 s / 60 s), "+30 s" extends, "Skip rest" ends it; the Today/Dashboard "Synced 2:02 PM" chip follows `SyncStatus`.
- **Navigation**: sidebar and header links are plain route links; the Train "Start session" primary navigates to `/train/session/:id`; "← Train" returns. Segmented controls write `?window=`, `?range=`, `?date=` exactly as the pages do today.
- **Loading**: keep each page's skeleton shapes (`Skeleton variant="rounded"` at the card radius); the stat card grid shows five 172 px skeletons.
- **Errors / offline**: keep `QueryStateCard`, `LoadProblem` and the offline `Alert`s, restyled as the info banner (`#EFF6FF` / `#BFDBFE` / `#1E3A8A`) and the warning banner (`#FEF3C7` / `#B45309`).
- **Empty states**: dashed `#D4D4D8` card on `#FAFAFA` with a title 16/600, one line 13 muted and one outline action (the Log's empty meal slots are the pattern; replace the unDraw illustrations in `EmptyState` with this).

## State management

No new state. Each page keeps its hooks and query keys; the redesign changes only JSX and `theme.ts`. New UI-only state: the Settings page's sticky section nav (active section from scroll), the Ask AI chats rail (already `thread-store`), the Progress volume-map slider (already in `TrainingSection`), and the collapsed/expanded exercise cards in the logger (local `useState`, current exercise expanded by default).

## Assets

- App mark: `assets/icon.svg` from the repo (polyline + dot), drawn white on the blue tile.
- Icons: Material Symbols Rounded in the prototypes → MUI `*Rounded` / `*Outlined` icons in the app (`today`, `space_dashboard`, `restaurant`, `fitness_center`, `insights`, `auto_awesome`, `body_fat`, `photo_library`, `history`, `description`, `settings`, `search`, `notifications`, `monitor_weight`, `water_drop`, `directions_walk`, `bedtime`, `local_fire_department`, `egg_alt`, `timer`, `push_pin`, `check`, `check_circle`, `chevron_right`, `expand_more`, `more_horiz`, `add`, `edit`, `play_arrow`, `flag`, `info`, `lock`, `upload_file`, `download`, `watch`, `straighten`, `event`, `speed`, `task_alt`, `mic`, `photo_camera`, `arrow_upward`, `arrow_back`, `trending_down`, `arrow_downward`).
- Food icons: `assets/food/*.svg` (the repo's `/food-icons`, Fluent Emoji Flat, MIT) — chicken, yogurt, rice, broccoli, blueberries, egg, salad, sweet-potato, protein-shake, bento, meal.
- Muscle map geometry: `muscle-map.js` here is a static render of the repo's `muscle-map/lib/geometry.ts`; use the real `MuscleMap` component.
- Font: Geist (Vercel, OFL) via Google Fonts in the prototypes; `@fontsource-variable/geist` in the app, or keep the system stack.

## Files

- `App-2a-Overview.dc.html` — canvas with all nine screens side by side (start here)
- `Shell2a-Sidebar.dc.html`, `Shell2a-Header.dc.html` — the shared shell (sidebar takes an `active` prop)
- `Today-2a-Shadcn.dc.html`, `Dashboard-2a.dc.html`, `Log-2a.dc.html`, `Train-2a.dc.html`, `Session-2a.dc.html`, `Progress-2a.dc.html`, `AskAI-2a.dc.html`, `Settings-2a.dc.html`, `Scans-2a.dc.html` — one file per screen
- `anim.js` — the entrance / count-up / draw / confetti behaviours the prototypes use (data-attribute driven; a reference for timings, not for porting)
- `muscle-map.js` — muscle-map renderer used by the prototypes
- `support.js` — the prototype runtime (needed only to open the `.dc.html` files; not part of the design)
- `assets/food/` — the food icons used
- `Today-Mockups.dc.html` plus `Today-1a…1j` and `Today-2b/2c` — the earlier explorations the direction was picked from, for context only
