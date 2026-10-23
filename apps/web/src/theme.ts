// Owns: every visual token (SPEC §11) — ink, surfaces, borders, the accent and its tints, the dark surface, status
// palettes, the metric palette, its ramps and tints, the 1d "Summit" materials (skies, glass, gradients, the cream
// panel, the tab bar), the type scale, spacing, radii, shadows, motion, chart style, muscle-map steps, layout
// breakpoints — and the MUI theme built from them. Nothing else in the app hard-codes a colour. Charts read `tokens`
// directly so SVG output carries literal colours for print and the PDF archive.
//
// Visual language (2026-10-21, "1d Summit" — docs/design/design_handoff_fitness_1d/README.md): a dusk sky hero over
// every page (stars, a breathing sun, a two-layer ridge) with the navigation as glass on it, then a cream panel
// (#FFF8EE, radius 44 44 0 0) holding white cards (radius 30, a soft violet shadow, no border). Ink is a deep violet
// (#1F1033), the accent violet #7B3FE4; one coral CTA gradient, one gold CTA, one deep-sky card and one coach gradient
// per screen. Type: Outfit (display and numbers, 300–400) and DM Sans (UI, 500–600), both self-hosted
// (`@fontsource-variable/*`, OFL) — nothing goes above 600. Motion: cards rise 26 px and fade in over 800 ms on an
// expo-out curve, 60–90 ms apart; numbers count up over ~1.8 s; bars grow and rings draw; the sky's ambient loops
// (twinkle, sun breathe and float) stop under reduced motion, which keeps a 200 ms cross-fade instead.
//
// `tokens.summit` holds the 1d palette and materials as drawn; the older semantic names (ink.*, accent.*, dark, tone.*,
// metric.*, chart.*, radius.*, elevation.*, layout.*) are kept and re-pointed at it, so every screen restyles without
// edits. Names that predate 1d say what they now are: `ink.secondary` = `ink.muted` (#7A6B8E, captions), `ink.label` =
// 1d "body copy" (#4E4063, stat labels, row values, neutral chip text), `ink.fill` = 1d "soft violet" (#F3ECFA),
// `ink.panel` = the warm well (#FFF5EC).
//
// Accessibility decisions (WCAG 2.2 AA, relative luminance; text ≥4.5:1, large text and non-text ≥3:1; gradients
// sampled every 5 %; the script is in the session scratchpad, wave0/table.mjs):
//   • Ink on white / cream / warm well: #1F1033 17.8 / 16.9 / 16.5, deep #2B0F4F 16.4 / 15.5 / 15.2, body #4E4063
//     9.39 / 8.90 / 8.73, muted #7A6B8E 4.86 / 4.61 / 4.52 (4.75 on the dashed slot #FFFCF7). Muted on soft violet
//     #F3ECFA is 4.21, so text on soft violet (neutral chips, unselected segments, secondary buttons) is `ink.label`
//     (8.13) or deep ink (14.2). Faint #B8ABC9 is 2.16: glyphs, chevrons, dots, dashed target lines and decoration only
//     — never informational text. Chart axis labels and input placeholders stay muted (README says faint), as in 2a.
//   • Accent #7B3FE4: 5.72 on white, 5.42 cream, 5.31 well, 4.95 soft violet; white on it 5.72. Strong #6A33D6 is the
//     info text on its tint (5.95 on #F3ECFA, 5.69 on #EEE6FF).
//   • Link hover: README #FF5D5D is 3.01 on white, so it is darkened (OKLCH, hue kept) to #D4323A — 4.86 white, 4.61
//     cream, 4.52 well.
//   • Status text on its tint: success README #0E8797 is 3.79 on #DDF7F4 (4.26 on white) → #067A88 (4.51 tint, 5.06
//     white, 4.71 well); warning README #C26A00 is 3.55 on #FFF2DC (3.92 white) → #A65A00, the consent page's shade
//     (4.65 tint, 5.14 white, 4.78 well), banner body `warning.deep` #8A4B00 6.15; danger README #E8384F is 3.63 on
//     #FFEDE8 → #D52040 (4.51 tint, 5.11 white). The teal dot #17B8A6 (2.49) is a mark beside a label, not text.
//   • Coral CTA (Start session, Finish, Send): README #FF7569 → #9A3A8E puts white text at 2.62 on its coral end, so
//     the start is the same coral darkened to #CC463E (OKLCH, hue kept): white ≥ 4.65 everywhere along #CC463E →
//     #9A3A8E. Its glow keeps the README's light coral shadow. The coach gradient ends on the same #CC463E for the same
//     reason (README #FF7569: 2.62; now ≥ 4.65 for its white text). Gold CTA: deep ink on #FFD27A → #FF8A5B ≥ 7.04, and
//     the gold chip ("Today", "Current", "PR": StatusChip's `gold` tone) is the same pair.
//   • On the sky: the hero eyebrow (white .75) is ≥ 4.56 and the subtitle (white .85) ≥ 4.82 over the top 70–75 % of
//     the inner sky, where they sit; the h1 is large text (≥ 4.27 to 85 %). Hero controls sit lower (they wrap under
//     the title on a phone), so their glass is a dark tint, rgba(26,10,66,.28): white ≥ 5.77 to 90 % of the sky (the
//     README's light glass, white .12, drops to 3.55 there). The nav pill keeps the light glass (white .85 on it 9.02 at
//     the sky's top). The "since base camp" pill is teal rgba(6,122,136,.92) (white 5.35; README's .9 #17B8A6: 2.81).
//   • Today's sky (measured in a browser over the rendered sky with the text hidden: the 2nd-percentile pixel under
//     each line, 360–1,440 px): the eyebrow (white .75) ≥ 8.46; the line under the trend (white .85) ≥ 4.94, with the
//     near cloud moved up 90 px from the mock's 250 (its core behind that line left it at 3.25); the teal pill ≥ 5.22;
//     the "kg to the summit" pill on the dark glass `glass.card` ≥ 8.52 (the README's light glass falls to ~3.9 that
//     low); the Next-camp card's lines in full white (README's .75 drops under 4.5 from 1,180 px) ≥ 4.97 on its .38
//     glass, and ≥ 5.32 on `glass.cardStrong` (.55) under 600 px, where the card sits over the coral band (.38: 3.31).
//   • Deep-sky card: white 16.4, white .65 on its .08 wells 6.49, gold 11.5. Tab bar: white .78 labels 9.85, the active
//     cell's deep ink on white 16.4.
//   • Non-text (1.4.11): the focus ring #7B3FE4 ≥ 5.31 on every surface; a switch's off track and any outline that
//     must identify a control on its own are `ink.control` #8D7FA3 (3.69 white, 3.50 cream, 3.19 soft violet; README's
//     #E3D6F2 off track is 1.3); the selected segment is deep ink on soft violet (14.2). Metric marks clear 3:1 on
//     white, cream and the well: weight #9A3A8E 5.79+, calories #E8384F 3.82+, protein #C47200 3.39+ (README's
//     #FF9F2E ramp start is 2.05 — kept in the ramp, not as a line), carbs #9A6BFF 3.30+, fat and fat mass #FD4B6B
//     3.05+, water #129AAE 3.12+, steps #6A33D6 6.39+, sleep #3F3FC8 7.08+, lean #0B9C8C 3.18+, fasting #E65F55 3.18+,
//     the plan line #B2872A 3.05+ (README's gold #FFD27A is 1.42 on white; it stays the plan colour on dark).
//   • Focus: buttons and every ButtonBase get a 2 px violet ring 2 px out (MUI 9's `focusVisible`); inputs get the
//     violet border + a 3 px ring (WCAG 2.4.7).
//   • Touch: on a coarse pointer every button, icon button, chip, segment and menu row keeps a 44 px target and inputs
//     take 16 px text (iOS Safari zooms into anything smaller).
import { createTheme } from '@mui/material/styles'

/** The two ends of the ink scale, named so nothing below hard-codes a white or an ink twice. */
const WHITE = '#FFFFFF'
const INK = '#1F1033'
/** 1d deep ink: dark buttons, dark chips, the user's chat bubble, tooltips, the active nav item's text. */
const DEEP = '#2B0F4F'
/** The page cream the panel and every card sit on. */
const CREAM = '#FFF8EE'
/** The warm well: inputs, inner wells, tinted panels, a row's hover. */
const WELL = '#FFF5EC'

/** 1d ink and surface ramp, as it is used. */
const SUMMIT_INK = {
  text: INK,
  deep: DEEP,
  /** Body copy and labels on any surface (9.39 on white). */
  body: '#4E4063',
  /** Captions, descriptions, units (4.86 white, 4.52 well; never on soft violet). */
  muted: '#7A6B8E',
  /** Placeholder glyphs, chevrons, dots, decoration. 2.16:1 — never text. */
  faint: '#B8ABC9',
  /** Row rules inside a card, chart gridlines. */
  hairline: '#F1E9F7',
  /** An outline that identifies a control on its own (≥3:1 on white, cream and soft violet). */
  control: '#8D7FA3',
} as const

/** The accent violet and its tints. */
const VIOLET = {
  main: '#7B3FE4',
  strong: '#6A33D6',
  /** Soft violet: secondary buttons, neutral chips, tracks, a segmented control's track. */
  soft: '#F3ECFA',
  /** Soft violet's hover; the violet tint (info chip, the steps track). */
  tint: '#EEE6FF',
  /** The dashed slot's border and a control's lilac rule. */
  line: '#E3D6F2',
  /** Light violet marks (muscle-map step 2, a chart series). Never text. */
  light: '#C9B3FF',
  /** A bright violet mark on dark (the barcode scanner's line). Never text on white. */
  bright: '#B18CFF',
  /** Muscle-map step 3. */
  mid: '#9A6BFF',
} as const

const SKY_TOP = '#1A0A42'
const PLUM = '#9A3A8E'
/** 1d's darkest volume colour: the mountain's body, the coach gradient's start. */
const PLUM_DEEP = '#4A1C78'
/** README coral #FF7569, darkened (OKLCH, hue kept) so white text on it clears 4.5:1 (4.65). */
const CORAL_DEEP = '#CC463E'
const GOLD = '#FFD27A'
const GOLD_DEEP = '#FF8A5B'

/** 1d's entrance curve: cubic-bezier(.16, 1, .3, 1), an expo-out. */
const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** The entrance length, ms (README §6: "cards rise 26 px and fade in over 700–900 ms"). */
const ENTER_DURATION = 800

/** One mark colour per metric, each ≥3:1 on white, cream and the warm well (header). */
const METRIC = {
  weight: PLUM,
  calories: '#E8384F',
  protein: '#C47200',
  carbs: VIOLET.mid,
  fat: '#FD4B6B',
  water: '#129AAE',
  steps: VIOLET.strong,
  sleep: '#3F3FC8',
  fatMass: '#FD4B6B',
  lean: '#0B9C8C',
  fasting: '#E65F55',
} as const

export type MetricKey = keyof typeof METRIC

/** A metric's bar gradient, low → high, and its tint track (README §2 "Metric ramps"). */
interface Ramp {
  from: string
  to: string
  track: string
}

const RAMP = {
  calories: { from: '#FF4D6D', to: '#FF9A6B', track: '#FFEDE8' },
  protein: { from: '#FF9F2E', to: '#FFD36B', track: '#FFF2DC' },
  water: { from: METRIC.water, to: '#5EE7DF', track: '#DDF7F4' },
  steps: { from: VIOLET.strong, to: VIOLET.bright, track: VIOLET.tint },
  sleep: { from: METRIC.sleep, to: '#8FA2FF', track: '#E6E8FF' },
  // Not drawn as ramps in the README; each borrows the mock's choice (Log/Dashboard: carbs violet, fat coral) or its
  // own mark colour's family.
  weight: { from: PLUM, to: '#FF7569', track: VIOLET.soft },
  carbs: { from: VIOLET.strong, to: VIOLET.bright, track: VIOLET.tint },
  fat: { from: '#FF4D6D', to: '#FF9A6B', track: '#FFEDE8' },
  fatMass: { from: '#FF4D6D', to: '#FFB3A6', track: '#FFEDE8' },
  lean: { from: METRIC.lean, to: '#5EE7DF', track: '#DDF7F4' },
  fasting: { from: METRIC.fasting, to: '#FFB36B', track: '#FFEDE8' },
} as const satisfies Record<MetricKey, Ramp>

/** Status palettes — text on its own tint (`tokens.tone`; `tokens.status` reads its text colours). */
const TONE = {
  success: {
    text: '#067A88',
    bg: '#DDF7F4',
    soft: '#EEFBF9',
    border: '#BCEDE6',
    /** The teal dot / check (a mark beside a label). */
    solid: '#17B8A6',
    light: '#5EE7DF',
  },
  warning: { text: '#A65A00', bg: '#FFF2DC', deep: '#8A4B00', border: '#FFE1AE' },
  danger: { text: '#D52040', bg: '#FFEDE8', soft: '#FFF4F1', border: '#FFD3C9' },
  info: { text: VIOLET.strong, bg: VIOLET.soft, border: VIOLET.line, icon: VIOLET.main },
  neutral: { text: SUMMIT_INK.body, bg: VIOLET.soft },
} as const

/** The radial sun glow at its two strengths (inner pages and Today). */
const sunGlow = (core: number, mid: number) =>
  `radial-gradient(closest-side, rgba(255,236,190,${core}), rgba(255,170,110,${mid}) 45%, rgba(255,120,100,0))`

/**
 * The 1d "Summit" palette and materials as drawn (README §2–3). Semantic tokens below point at these; a new screen
 * reaches for a semantic name first and for `summit` when it draws one of 1d's own materials (the sky, glass, the
 * deep-sky card, the CTAs, the tab bar).
 */
const SUMMIT = {
  surface: {
    page: CREAM,
    card: WHITE,
    well: WELL,
    dashed: { bg: '#FFFCF7', border: VIOLET.line },
    soft: VIOLET.soft,
    softHover: VIOLET.tint,
  },
  ink: SUMMIT_INK,
  accent: { main: VIOLET.main, strong: VIOLET.strong, linkHover: '#D4323A' },
  /** Gold: today, current, "you are here", the done check on dark; `deep` ends the gold CTA. */
  gold: { main: GOLD, deep: GOLD_DEEP },
  coral: { main: '#FF7569', deep: CORAL_DEEP },
  plum: PLUM,
  /** The darkest volume colour (#4A1C78): the mountain's body below its light top, the coach gradient's start. */
  plumDeep: PLUM_DEEP,
  /**
   * Today's mountain (Today-1d-Summit): its body (light plum at the peak → deep plum at .55 → night at the foot), the
   * peach lit face (0 → .35 left to right), the pale ridge behind it, the gullies, the ground strip at its foot, and the
   * dark glass under a camp's label. Decoration on the sky: no text sits on it but the white labels on their glass.
   */
  mountain: {
    top: '#7A3A9E',
    mid: PLUM_DEEP,
    foot: '#250C46',
    face: '#FFB38A',
    faceOpacity: 0.35,
    ridge: 'rgba(255,255,255,.09)',
    gully: 'rgba(255,255,255,.14)',
    ground: '#1A0A33',
    label: 'rgba(26,10,66,.55)',
  },
  status: TONE,
  ramp: RAMP,
  muscle: {
    body: SUMMIT_INK.hairline,
    stroke: WHITE,
    steps: [VIOLET.tint, VIOLET.light, VIOLET.mid, VIOLET.strong],
    fatSteps: ['#FFEDE8', '#FFB3A6', '#FF8A7A', '#FF4D6D'],
  },
  sky: {
    /** The sky's top stop: the browser's theme colour, so the status bar runs into the sky. */
    top: SKY_TOP,
    today: `linear-gradient(180deg, ${SKY_TOP} 0%, #3E1A73 26%, ${PLUM} 50%, #FF7569 70%, #FFBE86 86%, #FFE3B5 100%)`,
    inner: `linear-gradient(180deg, ${SKY_TOP} 0%, #3E1A73 38%, ${PLUM} 74%, #FF7569 100%)`,
  },
  star: { cool: WHITE, warm: '#FFE7B8' },
  sun: {
    glow: sunGlow(0.8, 0.4),
    glowToday: sunGlow(0.9, 0.45),
    disc: 'radial-gradient(circle at 40% 40%, #FFF6DA, #FFD08A 70%, #FFB36B)',
  },
  cloud: {
    near: 'radial-gradient(closest-side, rgba(255,230,240,.35), rgba(255,230,240,0))',
    far: 'radial-gradient(closest-side, rgba(255,220,235,.28), rgba(255,220,235,0))',
  },
  /** The two-layer ridge silhouette at the foot of the sky: back, then front. */
  ridge: { back: 'rgba(37,12,70,.55)', front: 'rgba(26,10,51,.6)' },
  /** Text on the sky. */
  onSky: {
    text: WHITE,
    eyebrow: 'rgba(255,255,255,.75)',
    subtitle: 'rgba(255,255,255,.85)',
    muted: 'rgba(255,255,255,.65)',
    disabled: 'rgba(255,255,255,.4)',
  },
  /** Glass on the sky: the nav pill and tiles (light), and the hero's controls (a dark tint — see the header). */
  glass: {
    fill: 'rgba(255,255,255,.12)',
    fillHover: 'rgba(255,255,255,.22)',
    border: 'rgba(255,255,255,.2)',
    tile: 'rgba(255,255,255,.14)',
    tileBorder: 'rgba(255,255,255,.25)',
    text: 'rgba(255,255,255,.85)',
    control: 'rgba(26,10,66,.28)',
    controlHover: 'rgba(26,10,66,.4)',
    controlBorder: 'rgba(255,255,255,.24)',
    /** A dark glass card on the sky (Today's "Next camp"). */
    card: 'rgba(26,10,66,.38)',
    /** The same card low on a phone's sky (under 600 px it sits over the coral band, where .38 leaves white 3.3:1). */
    cardStrong: 'rgba(26,10,66,.55)',
    cardBorder: 'rgba(255,255,255,.18)',
    /** backdrop-filter blur, px: pill, tile, card. */
    blur: 14,
    tileBlur: 12,
    cardBlur: 16,
  },
  /** One deep-sky card per screen, for the plan-level fact. */
  deepSky: {
    bg: 'linear-gradient(170deg, #2B0F4F, #1A0A33)',
    solid: '#1A0A33',
    well: 'rgba(255,255,255,.08)',
    hairline: 'rgba(255,255,255,.1)',
    text: WHITE,
    muted: 'rgba(255,255,255,.65)',
    shadow: '0 18px 50px rgba(43,15,79,.3)',
  },
  /** Coach / AI highlight (its coral end deepened for white text — header). */
  coach: {
    bg: `linear-gradient(135deg, ${PLUM_DEEP}, ${PLUM} 60%, ${CORAL_DEEP})`,
    text: WHITE,
    muted: 'rgba(255,255,255,.8)',
    shadow: '0 18px 50px rgba(154,58,142,.3)',
  },
  cta: {
    /** Start session, Finish, Send. */
    coral: {
      bg: `linear-gradient(135deg, ${CORAL_DEEP}, ${PLUM})`,
      text: WHITE,
      shadow: '0 10px 26px rgba(255,117,105,.35)',
      shadowHover: '0 14px 32px rgba(255,117,105,.45)',
    },
    /** Ask AI, + Log, Upload. */
    gold: {
      bg: `linear-gradient(135deg, ${GOLD}, ${GOLD_DEEP})`,
      text: DEEP,
      shadow: '0 8px 24px rgba(255,138,91,.4)',
      shadowHover: '0 12px 30px rgba(255,138,91,.5)',
    },
  },
  /** The "since base camp" pill on the sky (teal, deepened — header). */
  pill: { teal: 'rgba(6,122,136,.92)' },
  /** The highlight on a capsule gauge's fill. */
  gloss: 'rgba(255,255,255,.55)',
  avatar: { bg: WHITE, hover: '#FFE3B5', text: DEEP },
  /** The cream panel over the sky. */
  panel: { shadow: '0 -20px 50px rgba(43,15,79,.18)' },
  /** The phone's fixed bottom tab bar. */
  tabBar: {
    fill: 'rgba(31,16,51,.94)',
    shadow: '0 12px 40px rgba(26,10,51,.45)',
    text: 'rgba(255,255,255,.78)',
    active: WHITE,
    activeText: DEEP,
  },
  shadow: {
    card: '0 18px 50px rgba(74,28,120,.10)',
    cardHover: '0 22px 60px rgba(74,28,120,.2)',
    /** A small white tile on cream (quick-log buttons). */
    tile: '0 10px 26px rgba(74,28,120,.10)',
    tileHover: '0 14px 34px rgba(74,28,120,.2)',
    /** A white marker or label on the sky. */
    marker: '0 8px 24px rgba(26,10,66,.35)',
  },
  radius: {
    hero: 44,
    large: 30,
    tile: 26,
    small: 22,
    well: 16,
    wellSmall: 14,
    wellLarge: 18,
    button: 12,
    buttonLarge: 16,
    pill: 999,
    navTile: 15,
    navTileSmall: 14,
    tabBar: 24,
    tabCell: 18,
  },
  /** Card padding 22–28 px; gaps 26 (page rows) / 18 (tiles) / 8–14 (inside cards). */
  space: { cardPad: { y: 24, x: 26 }, gap: { row: 26, tile: 18, inner: 12 } },
} as const

const FONT_FALLBACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/** The page gutter (README §3): 16–56 px, widening so content is 1,328 px at most and centred. */
const GUTTER = 'max(clamp(16px, 4vw, 56px), calc((100vw - 1328px) / 2))'

export const tokens = {
  font: {
    /** DM Sans (variable, self-hosted by `main.tsx`): every UI string. The platform's own face behind it. */
    family: `"DM Sans Variable", "DM Sans", ${FONT_FALLBACK}`,
    /** Outfit (variable, self-hosted): page titles, card titles, every number. */
    display: `"Outfit Variable", Outfit, ${FONT_FALLBACK}`,
    /** Weights. Nothing goes above 600 (README §2); `<b>`/`strong` = 600. */
    weight: {
      /** DM Sans body copy and captions. */
      body: 500,
      /** DM Sans labels and buttons. */
      label: 500,
      /** DM Sans emphasis: a bold label, a chip, a row's title. */
      heading: 600,
      /** Outfit stat values. */
      number: 400,
      /** Outfit card and section titles. */
      title: 400,
      /** Outfit page titles and the hero numbers. */
      display: 300,
      strong: 600,
    },
    /**
     * The 1d scale, in px. Legacy names re-valued to the role they play: largeTitle = a page title outside the hero (the
     * printed report), title1 = a primary card's h2 (Train's "Upper A"), sectionTitle = a section heading (24),
     * cardTitle = a card title (19), itemTitle = a proposal / exercise / template name, body = body copy, emphasis = a
     * running paragraph, small = dense body and tables, label = a stat's label, caption = captions, micro = tiny
     * labels; eyebrow = a card's uppercase eyebrow, eyebrowHero = the hero's; subtitle = the hero's one line.
     */
    size: {
      largeTitle: 32,
      title1: 26,
      sectionTitle: 24,
      cardTitle: 19,
      itemTitle: 16,
      body: 14,
      emphasis: 15,
      small: 13,
      label: 13,
      caption: 12,
      micro: 11,
      eyebrow: 13,
      eyebrowHero: 14,
      subtitle: 17,
      /** Today's hero line under the trend number ("Trend weight · weighed in at …"): the mock's 18. */
      subtitleToday: 18,
      /** The "kg" beside Today's trend number (Outfit 300). */
      trendUnit: 28,
      /** The phone tab bar's labels under their glyphs. */
      tabLabel: 10,
      /** Numbers (Outfit 400): a stat value (30), a small stat (22), a medium hero (40), a large hero (52). */
      bigNumber: 30,
      bigNumberSmall: 22,
      bigNumberMedium: 40,
      bigNumberLarge: 52,
    },
    /** Fluid sizes (README §2): the page h1, Ask AI / Settings' smaller h1, Today's trend, the Dashboard hero. */
    fluid: {
      h1: 'clamp(34px, 8.5vw, 56px)',
      h1Compact: 'clamp(32px, 7.5vw, 48px)',
      trend: 'clamp(84px, 22vw, 150px)',
      dashboardHero: 'clamp(52px, 14vw, 72px)',
    },
    /** Letter-spacing in px: the h2 (26 × −.01em). Everything else tracks in `em` below. */
    tracking: { title1: -0.26 },
    /** Letter-spacing as em: titles −.02em, card titles −.01em, numbers −.015em, heroes −.03em, eyebrows +.12/.16em. */
    em: {
      title: '-0.02em',
      card: '-0.01em',
      number: '-0.015em',
      hero: '-0.03em',
      micro: '0.04em',
      eyebrow: '0.12em',
      eyebrowHero: '0.16em',
    },
    leading: {
      largeTitle: 1.05,
      title1: 1.15,
      sectionTitle: 1.2,
      cardTitle: 1.25,
      itemTitle: 1.3,
      body: 1.5,
      emphasis: 1.5,
      small: 1.45,
      label: 1.35,
      caption: 1.4,
      micro: 1.3,
      number: 1,
      /** Today's trend number. */
      trend: 0.9,
    },
  },
  ink: {
    /** Primary text. */
    text: INK,
    /** Long-form copy (the coach note) and body copy. */
    body: SUMMIT_INK.body,
    /** Stat labels, row values, neutral chip text (1d body copy, 9.39 on white, 8.13 on soft violet). */
    label: SUMMIT_INK.body,
    /** 1d "muted" under its legacy name: every caption, description, unit and subtitle (4.86 on white). */
    secondary: SUMMIT_INK.muted,
    /** 1d "muted" (same value as `secondary`; new code uses this name). Never on soft violet. */
    muted: SUMMIT_INK.muted,
    /** Glyphs, chevrons, dots, dashed target lines. 2.16:1 — never informational text. */
    faint: SUMMIT_INK.faint,
    /** Disabled text and controls. */
    disabled: SUMMIT_INK.faint,
    /** Control borders (inputs, an outline chip), table head rules: the lilac line. */
    border: VIOLET.line,
    /** Row hairlines inside a card. */
    hairline: SUMMIT_INK.hairline,
    /** The dashed border of an empty slot (drawn 2 px). */
    dashed: VIOLET.line,
    /** An outline that must identify a control on its own: ≥3:1 on white, cream and soft violet (WCAG 1.4.11). */
    control: SUMMIT_INK.control,
    card: WHITE,
    /** The page: 1d cream, under the sky and inside the panel. */
    page: CREAM,
    /** Tinted panels, inner wells and a row's hover: the warm well. */
    panel: WELL,
    /** Muted fill: progress tracks, segmented-control track, hover, neutral chip — 1d soft violet. */
    fill: VIOLET.soft,
  },
  /** The action colour. `main` carries white text at 5.72; `deep` is its hover and the text colour on `soft`. */
  accent: {
    main: VIOLET.main,
    /** Hover of `main`; also violet text on a tint (5.69 on `soft`). */
    deep: VIOLET.strong,
    /** Tint: highlighted rows, info chip, the AI tile. */
    soft: VIOLET.tint,
    /** The 3 px input focus ring and a light violet fill. */
    ring: VIOLET.line,
    /** Info banner border. */
    border: VIOLET.line,
    /** A light violet mark (chart series, muscle-map step 2). Never text. */
    light: VIOLET.light,
    /** A bright violet mark on dark (the barcode scanner's scan line). Never text on white. */
    bright: VIOLET.bright,
  },
  /** The dark surface: the Accept button, the user's chat bubble, tooltips, the dark segment. */
  dark: { bg: DEEP, hover: '#3D1A66', border: '#4A2A70', text: WHITE },
  /** Status palettes — text on its own tint. Never a metric colour. */
  tone: TONE,
  /** One mark colour per metric, used identically in rings, charts, the report and legends (each ≥3:1 on white, cream
   * and the well). Bars and gauges draw its ramp (`metricRamp()`); its tint is the ramp's track (`metricTint()`). */
  metric: METRIC,
  /** Status text colours under their legacy names (good = success text, warning, flag = danger text). */
  status: { good: TONE.success.text, warning: TONE.warning.text, flag: TONE.danger.text },
  /** The printed report (SPEC §11 print: black text on white): body text, secondary text, the running header. */
  print: { text: '#000000', secondary: '#333333', header: '#444444', page: WHITE },
  chart: {
    /** Horizontal gridlines. */
    grid: SUMMIT_INK.hairline,
    /** The x-axis baseline. */
    baseline: VIOLET.line,
    lineWidth: 3,
    /** The top of an area fill's fade (to 0 at the baseline). */
    areaOpacity: 0.22,
    /** The forecast band. */
    bandOpacity: 0.08,
    barRadius: 4,
    /** Dashed target lines and the weigh-in dots' ring. */
    target: SUMMIT_INK.faint,
    targetDash: '4 4',
    forecastDash: '5 5',
    /** The plan / expected line on white (README's gold, deepened to 3:1); `planOnDark` on the deep sky. */
    plan: '#B2872A',
    planOnDark: GOLD,
    planDash: '6 8',
    /** Axis labels: 1d draws them faint (2.16:1) — muted keeps them readable (4.86). */
    axis: SUMMIT_INK.muted,
    axisFontSize: 11,
    dotRing: SUMMIT_INK.faint,
    /** The goal line (the fat-mass colour). */
    goal: METRIC.fatMass,
    tooltip: { bg: DEEP, text: WHITE, muted: 'rgba(255,255,255,.65)' },
  },
  /** Muscle map: a lilac body, white strokes, four violet volume steps; the scan's fat segments use four coral steps. */
  muscleMap: {
    body: SUMMIT.muscle.body,
    bodyAlt: '#F8F3FB',
    stroke: SUMMIT.muscle.stroke,
    steps: SUMMIT.muscle.steps,
    fatSteps: SUMMIT.muscle.fatSteps,
  },
  /**
   * Radii, px. `card` is 1d's large card (30); `chip`, `pill`, `badge` and the segmented control are fully round (1d
   * draws chips as pills). Write radii as `${n}px` in an `sx`: MUI multiplies a bare number by `shape.borderRadius`.
   */
  radius: {
    card: SUMMIT.radius.large,
    /** Buttons, icon buttons, menus' rows. */
    control: SUMMIT.radius.button,
    inner: 10,
    chip: 999,
    pill: 999,
    badge: 999,
    /** A small (11 px) badge. */
    badgeSmall: 999,
    segment: 999,
    segmentTrack: 999,
    /** A banner, a well, a popover. */
    panel: SUMMIT.radius.wellLarge,
    bar: 4,
    /** A keyboard key. */
    kbd: 6,
    /** The focus ring's corners on a plain text link or a text-only button. */
    link: 4,
    /** An input (a warm well). */
    input: SUMMIT.radius.wellSmall,
    /** The hero's and the cream panel's top corners. */
    hero: SUMMIT.radius.hero,
    tile: SUMMIT.radius.tile,
    small: SUMMIT.radius.small,
    well: SUMMIT.radius.well,
  },
  /** Translucent materials. */
  material: {
    /** Behind a modal task. */
    scrim: 'rgba(31,16,51,.45)',
    /** A row's press highlight. */
    press: 'rgba(43,15,79,.05)',
  },
  /** Shadows (1d): cards float on a soft violet shadow; the deep-sky card, CTAs and the tab bar have their own. */
  elevation: {
    card: SUMMIT.shadow.card,
    cardHover: SUMMIT.shadow.cardHover,
    /** Menus, popovers, dialogs. */
    overlay: '0 24px 60px rgba(43,15,79,.22), 0 4px 12px rgba(43,15,79,.08)',
    button: 'none',
    /** The selected segment of a segmented control. */
    segment: '0 2px 8px rgba(43,15,79,.16)',
    tooltip: SUMMIT.shadow.marker,
    /** A switch's knob. */
    knob: '0 1px 3px rgba(43,15,79,.3)',
    /** The highlighted card's ring (today's template, the current exercise, the active chat): gold, 2 px. */
    highlight: `0 0 0 2px ${GOLD}, ${SUMMIT.shadow.card}`,
  },
  /**
   * Motion. Only `opacity`, `transform` and `filter` animate on entrance, so nothing shifts layout (no CLS). Under
   * `prefers-reduced-motion` the helpers below keep a 200 ms cross-fade and drop the movement.
   */
  motion: {
    duration: {
      instant: 100,
      fast: 200,
      base: 320,
      /** Bars growing and rings drawing. */
      grow: 1600,
      /** Chart lines drawing. */
      draw: 1600,
      /** Headline numbers counting up (README: 1.6–2.2 s). */
      count: 1800,
      /** The nav falling in; the hero h1 de-blurring. */
      nav: 900,
      deblur: 1100,
    },
    easing: {
      /** A value changing in place. */
      standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      /** The entrance curve. */
      out: EXPO_OUT,
    },
    /** Entrance stagger, ms: cards in a row, sections down a page. */
    stagger: { card: 60, section: 90 },
    /** How far an entering card rises, px. */
    rise: 26,
    /** The hero h1's entrance blur, px. */
    blur: 16,
    /** The sky's ambient loops, ms. */
    loop: { twinkle: 3200, breathe: 6000, float: 9000, drift: 48000 },
  },
  /** 4 px base spacing scale. */
  space: (n: number) => n * 4,
  /** Gaps (1d), px: 26 between a page's rows of cards. Card padding is `pad`. */
  rhythm: { section: SUMMIT.space.gap.row },
  /** Card padding (1d): standard `24px 26px`, dense `20px 22px`; header row `22px 26px 14px`. */
  pad: { card: { y: 24, x: 26 }, dense: { y: 20, x: 22 }, header: { top: 22, x: 26, bottom: 14 } },
  tapTarget: 44,
  /** Keyboard focus: a 2 px accent ring 2 px out on buttons; inputs get a violet border + a 3 px `accent.ring`. */
  focusRing: { width: 2, offset: 2, color: VIOLET.main, inputRing: 3 },
  layout: {
    phoneWidth: 390,
    /** 1d's content column: 1,328 px at most, centred by `gutter`. */
    maxContent: 1328,
    /** A reading column (a narrow page's cards). */
    readingMax: 820,
    /** The page gutter (nav, hero row, panel): `max(clamp(16px, 4vw, 56px), calc((100vw - 1328px) / 2))`. */
    gutter: GUTTER,
    /**
     * The space the phone's bottom tab bar takes above the safe area: the 64 px bar and its 10 px gap. Fixed layers
     * (a bottom snackbar, a sticky composer, the builder's save bar) sit above it.
     */
    bottomNavHeight: 74,
    /** The sticky chrome above a page: none in 1d (the nav scrolls away with the sky). */
    headerHeight: 0,
    /** The cream panel's padding (README: 40 top, 60 bottom; the sides are the gutter). */
    mainPadding: { top: 40, x: 0, bottom: 60 },
    /** Scroll padding so a focused control never lands under the phone's tab bar (WCAG 2.4.11). */
    scrollPadding: { top: 16, bottom: 156 },
    /** Breakpoints (px, as `@media (min-width: …)`; the page column is the viewport now there is no sidebar). */
    navWide: 960,
    /** Under this the desktop nav drops its search circle so the tabs and the worded Ask AI pill fit (⌘K remains). */
    navSearch: 1020,
    aiRail: 900,
    settingsNav: 760,
    todayMountain: 1180,
    /** The nav's height over the sky: desktop (22 + 46 + 22) and phone (14 + 44 + 14), plus the safe area. */
    navHeight: { wide: 90, narrow: 72 },
    /** The sky hero's minimum height per variant, and its bottom padding (the panel overlaps 44 of it). */
    hero: { today: 660, inner: 340, compact: 280, padBottom: 64, padTop: 30 },
    /** How far the cream panel rides up over the sky. */
    panelOverlap: 44,
    /** The phone's bottom tab bar: offset from the edges, height, cell height; pages leave `clearance` under it. */
    tabBar: { inset: 10, height: 64, cell: 52, clearance: 84 },
    /** A table's minimum width inside its sideways-scrolling wrapper (README §4). */
    tableMin: 520,
    /** The default flex basis of a fraction column in a wrapping row, and of a 4–5-up tile (README §4 "X"). */
    wrapBasis: { column: 280, tile: 150 },
  },
  /** The 1d palette and materials as drawn (see `SUMMIT`). */
  summit: SUMMIT,
} as const

/** The status tones a chip, badge or banner can take. */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/** The sky hero's variants: Today's full sky, an inner page's, and the shorter one for Ask AI and Settings. */
export type HeroVariant = 'today' | 'inner' | 'compact'

/** Media query for the reduced-motion preference (WCAG 2.3.3): no travel, short cross-fades instead. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** A touch screen: 44 px targets and 16 px input text apply here. */
export const COARSE_POINTER_QUERY = '@media (pointer: coarse)'

/** `@media (min-width: Npx)` for a layout breakpoint token, e.g. `minWidth(tokens.layout.navWide)`. */
export function minWidth(px: number): string {
  return `@media (min-width: ${px}px)`
}

/** True when the viewer asked for reduced motion. Safe outside a browser (false). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
}

/** Scroll behaviour that honours the reduced-motion preference. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

/** Hex colour with alpha (0–1), e.g. the 12 % forecast band. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

/** A metric's track tint (its ramp's track): mini-bar days off target, a meal stack's lighter segment, a ring's track. */
export function metricTint(metric: MetricKey): string {
  return RAMP[metric].track
}

/** A metric's ramp: the bar gradient's low and high ends and its tint track. */
export function metricRamp(metric: MetricKey): Ramp {
  return RAMP[metric]
}

/**
 * A metric's bar fill as a CSS gradient, low → high along `direction` (`90deg` for a horizontal bar filling to the
 * right, `0deg` for a capsule filling upward).
 */
export function metricGradient(metric: MetricKey, direction = '90deg'): string {
  const r = RAMP[metric]
  return `linear-gradient(${direction}, ${r.from}, ${r.to})`
}

/** The easing an entrance settles with: 1d's expo-out. Pair it with `enterDuration()`. */
export function enterEasing(): string {
  return EXPO_OUT
}

/** How long an entrance takes, ms (800). */
export function enterDuration(): number {
  return ENTER_DURATION
}

/**
 * The entrance to play when the viewer prefers reduced motion: a 200 ms cross-fade and no travel. Returns
 * `animation`'s shorthand value, `'none'` when motion is not reduced. Takes `reduced` rather than reading the media
 * query itself so a caller's `useMediaQuery` drives a re-render when the preference changes. The caller's own resting
 * opacity is 1 under reduced motion, so the fade fills only backwards (hidden through its delay): once it ends it no
 * longer holds the element, which would otherwise stay a backdrop root and stop the glass inside it from blurring.
 */
export function reducedEntrance(delay: number, reduced: boolean): string {
  if (!reduced) return 'none'
  return `${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard} ${delay}ms backwards crossFadeIn`
}

/** Properties that still aid comprehension under reduced motion (colour, opacity, elevation) keep a short transition. */
const REDUCED_MOTION_SURVIVORS =
  /^(opacity|color|background-color|border-color|outline-color|box-shadow|fill|stroke)$/

/**
 * A transition string for the given properties. Every hand-written transition goes through this, so the reduced-motion
 * preference cannot be forgotten in one place (WCAG 2.3.3): under it the colour/opacity/shadow changes stay (at the
 * instant step) and travel and scale are dropped.
 */
export function transitionOf(
  properties: string | readonly string[],
  duration: number = tokens.motion.duration.base,
  easing: string = tokens.motion.easing.standard,
): string {
  const list = typeof properties === 'string' ? [properties] : properties
  if (prefersReducedMotion()) {
    const kept = list
      .map((p) => p.trim())
      .filter((p) => REDUCED_MOTION_SURVIVORS.test(p))
      .map((p) => `${p} ${tokens.motion.duration.instant}ms ${tokens.motion.easing.standard}`)
    return kept.join(', ') || 'none'
  }
  return list.map((p) => `${p} ${duration}ms ${easing}`).join(', ')
}

declare module '@mui/material/styles' {
  interface Palette {
    metric: typeof tokens.metric
    ink: typeof tokens.ink
    accent: typeof tokens.accent
    /** The dark button colour (`<Button variant="contained" color="dark">` — Accept). */
    dark: Palette['primary']
    /** The gold CTA (`<Button variant="contained" color="gold">` — Ask AI, + Log, Upload). */
    gold: Palette['primary']
  }
  interface PaletteOptions {
    metric?: typeof tokens.metric
    ink?: typeof tokens.ink
    accent?: typeof tokens.accent
    dark?: PaletteOptions['primary']
    gold?: PaletteOptions['primary']
  }
  interface TypographyVariants {
    sectionTitle: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    sectionTitle?: React.CSSProperties
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    sectionTitle: true
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    dark: true
    gold: true
  }
  interface ButtonPropsSizeOverrides {
    /** 38 px, 13/500 — a card's own actions (a proposal's Accept / Reject). */
    dense: true
    /** 30 px, 12/500 — a row's action. */
    tiny: true
  }
}

declare module '@mui/material/IconButton' {
  interface IconButtonPropsSizeOverrides {
    /** 28 × 28 — a table row's action. */
    tiny: true
  }
}

const { ink, font, radius, accent, elevation, motion, material, tone, summit } = tokens

/** On a touch screen, a target never drops under 44 px whatever its desktop size. */
const touchTarget = (extra: object = {}) => ({
  [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget, ...extra },
})

/** A press state: instant, on pointer-down, never a ripple — and no scale under reduced motion. */
const press = (scale: number) => ({
  '&:active': { transform: `scale(${scale})` },
  '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
})

/**
 * A badge's colours per tone: tint, text, weight. MUI's filled `<Chip>` and the kit's `StatusChip` both read it. `gold`
 * is the highlight chip ("Today", "Current", "PR"): deep ink on gold (11.5; StatusChip lays the gold CTA gradient over
 * it, ≥ 7.04).
 */
export const CHIP_TONES = {
  neutral: { bg: tone.neutral.bg, text: tone.neutral.text, weight: font.weight.label },
  info: { bg: accent.soft, text: accent.deep, weight: font.weight.heading },
  success: { bg: tone.success.bg, text: tone.success.text, weight: font.weight.heading },
  warning: { bg: tone.warning.bg, text: tone.warning.text, weight: font.weight.heading },
  danger: { bg: tone.danger.bg, text: tone.danger.text, weight: font.weight.heading },
  gold: { bg: summit.gold.main, text: summit.cta.gold.text, weight: font.weight.heading },
} as const satisfies Record<Tone | 'gold', { bg: string; text: string; weight: number }>

/** The tone each MUI colour name takes on a filled `<Chip>`. */
const CHIP_COLOUR_TONES = {
  default: 'neutral',
  primary: 'info',
  info: 'info',
  secondary: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger',
} as const satisfies Record<string, Tone>

/** A banner's look per tone: tint, border, text, icon. MUI's `<Alert>` and the kit's `Banner` both read it. */
export const BANNER_TONES = {
  info: { bg: tone.info.bg, border: tone.info.border, text: tone.info.text, icon: tone.info.icon },
  warning: {
    bg: tone.warning.bg,
    border: tone.warning.border,
    text: tone.warning.deep,
    icon: tone.warning.text,
  },
  danger: {
    bg: tone.danger.soft,
    border: tone.danger.border,
    text: tone.danger.text,
    icon: tone.danger.text,
  },
  success: {
    bg: tone.success.soft,
    border: tone.success.border,
    text: tone.success.text,
    icon: tone.success.solid,
  },
} as const

const inputRing = `0 0 0 ${tokens.focusRing.inputRing}px ${accent.ring}`

/** A CTA's gradient look (coral or gold), its glow, and the soft violet it falls back to while disabled. */
const ctaStyle = (cta: { bg: string; text: string; shadow: string; shadowHover: string }) => ({
  backgroundColor: 'transparent',
  backgroundImage: cta.bg,
  color: cta.text,
  boxShadow: cta.shadow,
  '&:hover': { backgroundImage: cta.bg, boxShadow: cta.shadowHover, filter: 'saturate(1.08)' },
  '&.Mui-disabled': {
    backgroundImage: 'none',
    backgroundColor: ink.fill,
    color: ink.disabled,
    boxShadow: 'none',
  },
})

const fast = (property: string) => `${property} ${motion.duration.fast}ms ${motion.easing.standard}`

export const theme = createTheme({
  cssVariables: true,
  // `md` is the nav's breakpoint (960): below it the phone nav and layouts, from it the desktop ones, so a page's
  // `md` rules and the shell always switch together.
  breakpoints: { values: { xs: 0, sm: 600, md: tokens.layout.navWide, lg: 1200, xl: 1536 } },
  // MUI 9's own keyboard ring, applied to every ButtonBase (and inset on clip-prone rows): 2 px accent, 2 px out.
  focusVisible: {
    outlineColor: tokens.focusRing.color,
    outlineWidth: tokens.focusRing.width,
    outlineOffset: tokens.focusRing.offset,
  },
  palette: {
    mode: 'light',
    primary: { main: accent.main, dark: accent.deep, light: accent.bright, contrastText: WHITE },
    secondary: { main: ink.fill, dark: accent.soft, contrastText: summit.ink.deep },
    dark: {
      main: tokens.dark.bg,
      dark: tokens.dark.hover,
      light: tokens.dark.border,
      contrastText: tokens.dark.text,
    },
    gold: {
      main: summit.gold.main,
      dark: summit.gold.deep,
      light: summit.gold.main,
      contrastText: summit.cta.gold.text,
    },
    success: { main: tone.success.text, contrastText: WHITE },
    warning: { main: tone.warning.text, contrastText: WHITE },
    error: { main: tone.danger.text, contrastText: WHITE },
    info: { main: accent.main, contrastText: WHITE },
    text: { primary: ink.text, secondary: ink.secondary, disabled: ink.faint },
    divider: ink.hairline,
    background: { default: ink.page, paper: ink.card },
    action: {
      hover: ink.fill,
      selected: ink.fill,
      disabled: ink.faint,
      disabledBackground: ink.fill,
    },
    metric: tokens.metric,
    ink,
    accent,
  },
  shape: { borderRadius: radius.control },
  spacing: 4,
  typography: {
    fontFamily: font.family,
    fontSize: font.size.body,
    htmlFontSize: 16,
    fontWeightLight: font.weight.display,
    fontWeightRegular: font.weight.body,
    fontWeightMedium: font.weight.label,
    fontWeightBold: font.weight.heading,
    // Page title (the hero's h1): Outfit 300, fluid 34–56 px.
    h1: {
      fontFamily: font.display,
      fontSize: font.fluid.h1,
      fontWeight: font.weight.display,
      lineHeight: font.leading.largeTitle,
      letterSpacing: font.em.title,
    },
    h2: {
      fontFamily: font.display,
      fontSize: font.size.title1,
      fontWeight: font.weight.title,
      lineHeight: font.leading.title1,
      letterSpacing: font.tracking.title1,
    },
    h3: {
      fontFamily: font.display,
      fontSize: font.size.sectionTitle,
      fontWeight: font.weight.title,
      lineHeight: font.leading.sectionTitle,
      letterSpacing: font.em.card,
    },
    h4: {
      fontFamily: font.display,
      fontSize: font.size.cardTitle,
      fontWeight: font.weight.title,
      lineHeight: font.leading.cardTitle,
      letterSpacing: font.em.card,
    },
    h5: { fontSize: font.size.body, fontWeight: font.weight.heading, lineHeight: font.leading.body },
    h6: { fontSize: font.size.body, fontWeight: font.weight.heading, lineHeight: font.leading.body },
    subtitle1: { fontSize: font.size.body, fontWeight: font.weight.label, lineHeight: font.leading.body },
    subtitle2: { fontSize: font.size.small, fontWeight: font.weight.label, lineHeight: font.leading.small },
    body1: { fontSize: font.size.body, fontWeight: font.weight.body, lineHeight: font.leading.body },
    body2: {
      fontSize: font.size.small,
      fontWeight: font.weight.body,
      lineHeight: font.leading.small,
      color: ink.secondary,
    },
    button: {
      fontSize: font.size.body,
      fontWeight: font.weight.label,
      textTransform: 'none',
      letterSpacing: 0,
      lineHeight: 1.4,
    },
    caption: { fontSize: font.size.caption, fontWeight: font.weight.body, lineHeight: font.leading.caption },
    // The eyebrow: DM Sans 600, uppercase, +.12em.
    overline: {
      fontSize: font.size.eyebrow,
      fontWeight: font.weight.heading,
      lineHeight: font.leading.micro,
      letterSpacing: font.em.eyebrow,
      textTransform: 'uppercase',
    },
    sectionTitle: {
      fontFamily: font.display,
      fontSize: font.size.sectionTitle,
      fontWeight: font.weight.title,
      lineHeight: font.leading.sectionTitle,
      letterSpacing: font.em.card,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { WebkitTapHighlightColor: 'transparent' },
        body: {
          backgroundColor: ink.page,
          color: ink.text,
          fontFamily: font.family,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textSizeAdjust: '100%',
        },
        'b, strong': { fontWeight: font.weight.strong },
        // A Recharts chart is a tab stop (its accessibility layer): no black square on click, the violet ring for the
        // keyboard (UX #35; `chartFocus` in the kit does the same for any other focusable SVG).
        '.recharts-wrapper:focus, .recharts-surface:focus': { outline: 'none' },
        '.recharts-wrapper:focus-visible, .recharts-surface:focus-visible': {
          outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
          outlineOffset: tokens.focusRing.offset,
          borderRadius: `${tokens.radius.well}px`,
        },
        '::selection': { backgroundColor: accent.ring },
        // A long press must not open a callout over a control (iOS Safari), the way it does over text.
        'button, a': { WebkitTouchCallout: 'none', textDecoration: 'none' },
        // The reduced-motion entrance (see `reducedEntrance`): a keyframe animation, so the cross-fade plays from the
        // element's first paint on the browser's own clock rather than waiting on a JavaScript frame.
        '@keyframes crossFadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
        // MUI's baseline squashes every animation to 0.01 ms under reduced motion; this gives the cross-fade above its
        // 200 ms back. The `html` prefix outranks MUI's `*` rule, which is emitted after this block.
        '@media (prefers-reduced-motion: reduce)': {
          'html *, html *::before, html *::after': {
            animationDuration: `${tokens.motion.duration.fast}ms !important`,
          },
        },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      // `fontFamily: 'inherit'`: a bare ButtonBase (an accordion summary, a nav link) otherwise keeps the browser's
      // button font; Button, Tab, MenuItem and ToggleButton set their own type after this.
      styleOverrides: { root: { WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit' } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: ink.hairline, borderRadius: radius.card } },
    },
    // 1d card: white, radius 30, the soft violet shadow, no border. A card inside a card drops its shadow for a hairline.
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.card,
          border: 0,
          backgroundColor: ink.card,
          boxShadow: elevation.card,
          '& &': { boxShadow: 'none', border: `1px solid ${ink.hairline}` },
        },
      },
    },
    // Buttons (1d): primary = the coral CTA gradient, `gold` = the gold CTA (deep ink text), `dark` = deep ink,
    // outline = soft violet with deep ink text (1d's "secondary"), text = violet. Sizes 40 / 36 (small) / 50 (large) /
    // 38 (dense) / 30 (tiny); 44 on a touch screen. 100 ms press to 0.98, no ripple.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 40,
          minWidth: 0,
          padding: '6px 16px',
          gap: 0,
          borderRadius: radius.control,
          fontSize: font.size.body,
          fontWeight: font.weight.label,
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
          transition: [
            fast('background-color'),
            fast('border-color'),
            fast('color'),
            fast('box-shadow'),
            `transform ${motion.duration.instant}ms ${motion.easing.standard}`,
          ].join(', '),
          ...press(0.98),
          ...touchTarget(),
        },
        startIcon: { marginLeft: -2, marginRight: 6, '& > *:nth-of-type(1)': { fontSize: 20 } },
        endIcon: { marginLeft: 4, marginRight: -4, '& > *:nth-of-type(1)': { fontSize: 20 } },
        contained: { boxShadow: elevation.button, '&:hover': { boxShadow: elevation.button } },
        outlined: {
          padding: '6px 16px',
          border: 0,
          backgroundColor: summit.surface.soft,
          color: summit.ink.deep,
          '&:hover': { border: 0, backgroundColor: summit.surface.softHover },
          '&.Mui-disabled': { border: 0, backgroundColor: summit.surface.soft, color: ink.disabled },
        },
        text: {
          padding: '6px 12px',
          '&:hover': { backgroundColor: ink.fill },
        },
        sizeSmall: {
          minHeight: 36,
          padding: '4px 14px',
          fontSize: font.size.small,
          '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': {
            fontSize: 18,
          },
        },
        sizeLarge: {
          minHeight: 50,
          padding: '8px 22px',
          borderRadius: summit.radius.buttonLarge,
          fontSize: 16,
        },
      },
      variants: [
        { props: { variant: 'contained', color: 'primary' }, style: ctaStyle(summit.cta.coral) },
        { props: { variant: 'contained', color: 'gold' }, style: ctaStyle(summit.cta.gold) },
        {
          props: { variant: 'contained', color: 'dark' },
          style: { '&:hover': { backgroundColor: tokens.dark.hover } },
        },
        {
          props: { size: 'dense' },
          style: { minHeight: 38, padding: '4px 14px', fontSize: font.size.small },
        },
        {
          props: { size: 'tiny' },
          style: {
            minHeight: 30,
            padding: '2px 10px',
            borderRadius: radius.inner,
            fontSize: font.size.caption,
            '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': {
              fontSize: 16,
            },
          },
        },
        // The secondary (outline) button stays soft violet whatever its colour, except destructive, which turns red.
        {
          props: { variant: 'outlined', color: 'error' },
          style: {
            backgroundColor: tone.danger.bg,
            color: tone.danger.text,
            '&:hover': { backgroundColor: tone.danger.border },
          },
        },
        {
          props: { variant: 'text', color: 'error' },
          style: { color: tone.danger.text, '&:hover': { backgroundColor: tone.danger.bg } },
        },
        { props: { variant: 'text', color: 'inherit' }, style: { '&:hover': { backgroundColor: ink.fill } } },
        // Violet text on the soft violet hover fill is 4.95; the strong violet is 5.95.
        { props: { variant: 'text', color: 'primary' }, style: { '&:hover': { color: accent.deep } } },
      ],
    },
    // Icon buttons: radius 12, ghost by default — 40 / 34 (small) / 28 (tiny) / 46 (large).
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          padding: 0,
          borderRadius: radius.control,
          color: ink.secondary,
          transition: [
            fast('background-color'),
            fast('color'),
            `transform ${motion.duration.instant}ms ${motion.easing.standard}`,
          ].join(', '),
          '&:hover': { backgroundColor: ink.fill, color: summit.ink.deep },
          ...press(0.96),
          [COARSE_POINTER_QUERY]: { minWidth: tokens.tapTarget, minHeight: tokens.tapTarget },
        },
        sizeSmall: { width: 34, height: 34 },
        sizeLarge: { width: 46, height: 46 },
        colorPrimary: { color: accent.main, '&:hover': { color: accent.deep } },
      },
      variants: [{ props: { size: 'tiny' }, style: { width: 28, height: 28, borderRadius: radius.inner } }],
    },
    // Chips are 1d pills: fully round, 12/500 (11 small); coloured ones take their status tint and 600.
    MuiChip: {
      styleOverrides: {
        root: {
          height: 'auto',
          minHeight: 26,
          padding: '4px 10px',
          borderRadius: radius.chip,
          fontSize: font.size.caption,
          fontWeight: font.weight.label,
          lineHeight: '18px',
          letterSpacing: 0,
          transition: fast('background-color'),
        },
        label: { padding: 0, overflow: 'visible' },
        sizeSmall: {
          minHeight: 20,
          padding: '1px 8px',
          fontSize: font.size.micro,
          '& .MuiChip-icon': { fontSize: 12, marginLeft: -1, marginRight: 3 },
        },
        icon: { fontSize: 15, marginLeft: -2, marginRight: 4, color: 'inherit' },
        deleteIcon: {
          fontSize: 16,
          marginLeft: 4,
          marginRight: -4,
          color: 'inherit',
          opacity: 0.7,
          '&:hover': { color: 'inherit', opacity: 1 },
        },
        outlined: { border: `1px solid ${ink.border}`, backgroundColor: ink.card, color: ink.label },
        clickable: { ...touchTarget(), '&:active': { boxShadow: 'none' } },
      },
      variants: [
        ...(Object.entries(CHIP_COLOUR_TONES) as [keyof typeof CHIP_COLOUR_TONES, Tone][]).map(
          ([color, chipTone]) => {
            const t = CHIP_TONES[chipTone]
            return {
              props: { variant: 'filled' as const, color },
              style: {
                backgroundColor: t.bg,
                color: t.text,
                fontWeight: t.weight,
                '&.MuiChip-clickable:hover, &.MuiChip-clickable.Mui-focusVisible': {
                  backgroundColor: t.bg,
                  filter: 'brightness(0.96)',
                },
              },
            }
          },
        ),
        {
          props: { variant: 'outlined' as const },
          style: { '&.MuiChip-clickable:hover': { backgroundColor: ink.fill } },
        },
      ],
    },
    // Menu rows: 36 px, radius 10 inside a 6 px list padding; 44 px on touch.
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 36,
          margin: '0 6px',
          padding: '7px 10px',
          borderRadius: radius.inner,
          fontSize: font.size.body,
          '&:hover': { backgroundColor: ink.fill },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: accent.soft },
          ...touchTarget(),
        },
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 28, color: ink.secondary } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: ink.panel },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: ink.fill },
          '&:active': { backgroundColor: material.press },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: font.size.body },
        secondary: { fontSize: font.size.caption, color: ink.secondary },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: ink.hairline } } },
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: {
        root: {
          color: accent.main,
          fontWeight: font.weight.label,
          '&:hover': { color: summit.accent.linkHover },
        },
      },
    },
    // Alerts are 1d banners: tint + 1 px border + text, radius 18, 13 px; the icon carries the colour.
    MuiAlert: {
      styleOverrides: {
        root: ({ ownerState }) => {
          const b = BANNER_TONES[ownerState.severity === 'error' ? 'danger' : (ownerState.severity ?? 'info')]
          if (ownerState.variant === 'filled') return { borderRadius: radius.panel }
          return {
            alignItems: 'flex-start',
            padding: '12px 16px',
            borderRadius: radius.panel,
            border: `1px solid ${b.border}`,
            backgroundColor: b.bg,
            color: b.text,
            fontSize: font.size.small,
            lineHeight: font.leading.small,
            '& .MuiAlert-icon': {
              color: b.icon,
              opacity: 1,
              padding: '1px 0',
              marginRight: 10,
              fontSize: 18,
            },
            '& .MuiAlert-message': { padding: '1px 0', minWidth: 0 },
            '& .MuiAlert-action': { padding: 0, marginRight: -6, alignSelf: 'center' },
            '& .MuiAlertTitle-root': {
              fontSize: font.size.small,
              fontWeight: font.weight.heading,
              margin: 0,
            },
          }
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontSize: font.size.body, [COARSE_POINTER_QUERY]: { fontSize: 16 } },
        input: { '&::placeholder': { color: ink.muted, opacity: 1 } },
      },
    },
    // Inputs (1d): a warm well, radius 14, a 1 px lilac edge; focus = violet border + a 3 px lilac ring.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.input,
          backgroundColor: ink.panel,
          transition: fast('box-shadow'),
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: ink.border,
            transition: fast('border-color'),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ink.control },
          '&.Mui-focused': { boxShadow: inputRing },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: accent.main, borderWidth: 1 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: tone.danger.text },
          '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 ${tokens.focusRing.inputRing}px ${tone.danger.bg}` },
          '&.Mui-disabled': { backgroundColor: summit.surface.dashed.bg },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: ink.hairline },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: ink.secondary,
          '&.Mui-focused': { color: accent.main },
          '&.Mui-error': { color: tone.danger.text },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: font.size.caption, marginLeft: 2, marginRight: 2 } },
    },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'medium' } },
    // A segmented control (1d): a soft violet pill track 4 px in; segments 13/500 pills, the selected one deep ink with
    // white text (14.2:1 against the track, so the state never rests on a hairline). The hero draws its own glass look.
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          gap: 2,
          padding: 4,
          borderRadius: radius.segmentTrack,
          backgroundColor: ink.fill,
          '& .MuiToggleButtonGroup-grouped, & .MuiToggleButtonGroup-firstButton, & .MuiToggleButtonGroup-middleButton, & .MuiToggleButtonGroup-lastButton':
            { margin: 0, border: 0, borderRadius: radius.segment },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 0,
          padding: '6px 14px',
          borderRadius: radius.segment,
          fontSize: font.size.small,
          fontWeight: font.weight.label,
          lineHeight: 1.4,
          textTransform: 'none',
          color: ink.label,
          backgroundColor: 'transparent',
          transition: [fast('background-color'), fast('color'), fast('box-shadow')].join(', '),
          '&:hover': { backgroundColor: 'transparent', color: summit.ink.deep },
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: tokens.dark.bg,
            color: tokens.dark.text,
            boxShadow: elevation.segment,
          },
          '&.Mui-disabled': { border: 0, color: ink.disabled },
          ...touchTarget(),
        },
        sizeSmall: { padding: '4px 12px', fontSize: font.size.caption },
        sizeLarge: { padding: '9px 18px', fontSize: font.size.body },
      },
    },
    // Switch (1d): a 46 × 26 pill, off `ink.control` (README's #E3D6F2 is 1.3:1 — WCAG 1.4.11), on violet, a 20 px
    // white knob. On touch the hidden input grows to 44 px.
    MuiSwitch: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          width: 46,
          height: 26,
          padding: 0,
          overflow: 'visible',
          flex: 'none',
          [COARSE_POINTER_QUERY]: { '& .MuiSwitch-input': { top: -9, height: 44 } },
        },
        switchBase: {
          padding: 3,
          '&.Mui-checked': { transform: 'translateX(20px)', color: WHITE },
          '&.Mui-checked + .MuiSwitch-track': { backgroundColor: accent.main, opacity: 1 },
          '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.5 },
          '&:hover': { backgroundColor: 'transparent' },
        },
        thumb: { width: 20, height: 20, color: WHITE, boxShadow: elevation.knob },
        track: { borderRadius: 13, backgroundColor: ink.control, opacity: 1 },
      },
    },
    MuiCheckbox: {
      styleOverrides: { root: { color: ink.control, '&.Mui-checked': { color: accent.main } } },
    },
    MuiRadio: { styleOverrides: { root: { color: ink.control, '&.Mui-checked': { color: accent.main } } } },
    // Tables (1d): 13 px; the head 12/600 muted over a lilac rule; hairline rows; the outer cells padded to the card's
    // 26 px gutter; numbers right-aligned in tabular figures.
    MuiTable: { styleOverrides: { root: { borderCollapse: 'collapse' } } },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: font.size.small,
          lineHeight: font.leading.small,
          padding: '10px 12px',
          borderBottom: `1px solid ${ink.hairline}`,
          '&:first-of-type': { paddingLeft: tokens.pad.card.x },
          '&:last-of-type': { paddingRight: tokens.pad.card.x },
        },
        head: {
          fontSize: font.size.caption,
          fontWeight: font.weight.heading,
          color: ink.secondary,
          padding: '8px 12px',
          borderBottom: `1px solid ${ink.border}`,
        },
        alignRight: { fontVariantNumeric: 'tabular-nums' },
      },
    },
    // A table sits flush in its card, so its last row draws no hairline.
    MuiTableBody: { styleOverrides: { root: { '& tr:last-of-type td': { borderBottom: 0 } } } },
    MuiTableRow: {
      styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: ink.panel } } },
    },
    // A dialog (1d): radius 30, no border, the overlay shadow; title Outfit 400 22 px; actions right with a 10 px gap.
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: radius.card,
          border: 0,
          boxShadow: elevation.overlay,
          backgroundImage: 'none',
          // A full-screen dialog (a phone) starts below the status bar: the installed app draws under it
          // (black-translucent), so its title and Close would sit under the clock.
          '&.MuiDialog-paperFullScreen': { paddingTop: 'env(safe-area-inset-top, 0px)', borderRadius: 0 },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: font.display,
          fontSize: 22,
          fontWeight: font.weight.title,
          letterSpacing: font.em.card,
          lineHeight: font.leading.cardTitle,
          padding: '24px 28px 8px',
        },
      },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 28px', fontSize: font.size.body } } },
    MuiDialogContentText: { styleOverrides: { root: { fontSize: font.size.body, color: ink.secondary } } },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: '14px 28px 24px', gap: 10, '& > :not(style) ~ :not(style)': { marginLeft: 0 } },
      },
    },
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: material.scrim } } },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ ownerState }) => ({
          borderColor: ink.hairline,
          ...(ownerState.anchor === 'bottom' && {
            borderRadius: `${radius.card}px ${radius.card}px 0 0`,
            boxShadow: elevation.overlay,
          }),
        }),
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: radius.panel,
          border: `1px solid ${ink.hairline}`,
          boxShadow: elevation.overlay,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          marginTop: 6,
          borderRadius: radius.panel,
          border: `1px solid ${ink.hairline}`,
          boxShadow: elevation.overlay,
        },
        list: { padding: '6px 0' },
      },
    },
    // Tooltip (1d): deep ink, white 12 px, radius 10, 6 × 10 padding.
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: radius.inner,
          backgroundColor: tokens.dark.bg,
          color: tokens.dark.text,
          fontSize: font.size.caption,
          fontWeight: font.weight.body,
          lineHeight: font.leading.caption,
          padding: '6px 10px',
          boxShadow: elevation.tooltip,
        },
        arrow: { color: tokens.dark.bg },
      },
    },
    // Loading shapes sit on the soft violet fill; a rounded skeleton takes the card radius.
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: ink.fill },
        rounded: { borderRadius: radius.card },
        text: { borderRadius: 6 },
      },
    },
    // Progress tracks (1d): 8 px, fully round, soft violet under the accent.
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 8, borderRadius: radius.pill, backgroundColor: ink.fill },
        bar: { borderRadius: radius.pill },
      },
    },
    // Every snackbar sits at the bottom (UX #33): on a phone above the tab bar and the home indicator, from `md` 24 px
    // off the bottom — never over the nav at the top, where a dark notice also vanished into the dark sky. A screen
    // that asked for `vertical: 'top'` (or set its own `top`) is moved down too, hence the `!important` on `top`.
    // Every snackbar sits at the bottom centre, above the phone's tab bar and the home indicator (UX #33); a notice
    // shown over an open sheet lifts itself above the sheet's action row (quick-log `useNoticeClearance`).
    MuiSnackbar: {
      defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'center' } },
      styleOverrides: {
        root: ({ theme }) => {
          const bottom = `calc(${tokens.layout.bottomNavHeight + tokens.space(2)}px + env(safe-area-inset-bottom, 0px))`
          return {
            bottom,
            [theme.breakpoints.up('sm')]: { bottom },
            [theme.breakpoints.up('md')]: { bottom: `calc(24px + env(safe-area-inset-bottom, 0px))` },
          }
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          borderRadius: summit.radius.well,
          backgroundColor: tokens.dark.bg,
          color: tokens.dark.text,
          fontSize: font.size.body,
          boxShadow: elevation.tooltip,
        },
      },
    },
  },
})
