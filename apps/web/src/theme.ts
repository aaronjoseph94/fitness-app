// Owns: every visual token (SPEC §11) — ink, metric palette, semantic status colours, type scale, spacing,
// radius hierarchy, elevation, motion, chart style, muscle-map steps — and the MUI theme built from them.
// Nothing else in the app hard-codes a colour. Charts read `tokens` directly so SVG output carries literal hex
// colours for print and the PDF archive.
//
// Visual direction (2026-10-06, see docs/PROGRESS.md): the canvas moved from near-white to a light grey and cards
// became shadow-separated white surfaces, so a page reads as layered surfaces rather than a stack of outlined boxes.
// The metric cards carry a solid gradient — the one place a gradient is allowed, because there it encodes which
// metric the card is — and everything else stays flat. Every pair below was measured, not eyeballed: white on a
// metric gradient passes WCAG AA 4.5:1 at BOTH stops (the reference image's pastels measured 1.87:1–3.33:1 and were
// therefore rejected), and the secondary grey is darker than it was because the new canvas pushed the old one to
// 4.39:1, just under the threshold.
import { createTheme } from '@mui/material/styles'

export const tokens = {
  font: {
    family: "'Outfit Variable', 'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
    weight: { body: 400, label: 500, heading: 600, number: 700 },
    /** The type scale in px. caption: axis text, small print; label: card labels; small: secondary text (body2);
     * emphasis: lead text, buttons; body; cardTitle: card headings (h4); sectionTitle; the big numbers. */
    size: {
      caption: 12,
      label: 13,
      small: 14,
      emphasis: 15,
      body: 16,
      cardTitle: 18,
      sectionTitle: 20,
      bigNumber: 36,
      bigNumberSmall: 32,
      bigNumberLarge: 40,
      /** The one number on a gradient metric card. */
      statNumber: 40,
    },
  },
  ink: {
    text: '#111827',
    secondary: '#5F6B7C',
    border: '#E7EAF0',
    /** Outline of a form control a value is typed into: ≥3:1 on card, page and chart grid (WCAG 1.4.11). */
    control: '#7C8698',
    card: '#FFFFFF',
    page: '#F2F4F8',
    /** A slightly raised surface inside a card — list rows, wells, the month cells. */
    sunken: '#F7F8FB',
  },
  /** The action colour: coral. `main` is deep enough for white text (5.18:1); `bright` is for icons and accents
   * where nothing sits on top of it, and must never carry text. */
  accent: {
    main: '#C2410C',
    bright: '#EA580C',
    /** Tinted chip/background that carries `main` text at 4.67:1. */
    soft: '#FDF1EA',
    /** Hover/active of `main`. */
    deep: '#9A3412',
  },
  /** One colour per metric, used identically in rings, charts, the report and legends. */
  metric: {
    weight: '#4338CA',
    calories: '#C2410C',
    protein: '#BE123C',
    carbs: '#A16207',
    fat: '#0F766E',
    water: '#0369A1',
    steps: '#15803D',
    sleep: '#6D28D9',
    fatMass: '#9D174D',
    lean: '#047857',
    fasting: '#475569',
  },
  /** The gradient a metric card is filled with, [from, to] left to right. White text passes 4.5:1 at both stops. */
  gradient: {
    weight: ['#312E81', '#4338CA'],
    calories: ['#9A3412', '#C2410C'],
    protein: ['#881337', '#BE123C'],
    carbs: ['#713F12', '#A16207'],
    fat: ['#134E4A', '#0F766E'],
    water: ['#0C4A6E', '#0369A1'],
    steps: ['#14532D', '#15803D'],
    sleep: ['#4C1D95', '#6D28D9'],
    fatMass: ['#831843', '#9D174D'],
    lean: ['#064E3B', '#047857'],
    fasting: ['#1E293B', '#475569'],
  },
  /** Status only — never used for a metric. Each is ≥4.5:1 on white both ways (as text, and white text on it). */
  status: { good: '#15803D', warning: '#B45309', flag: '#DC2626' },
  /** The printed report (SPEC §11 print: black text on white): body text, secondary text, the running header. */
  print: { text: '#000000', secondary: '#333333', header: '#444444', page: '#FFFFFF' },
  chart: {
    grid: '#EDF0F5',
    lineWidth: 2,
    areaOpacity: 0.12,
    bandOpacity: 0.12,
    barRadius: 6,
    target: '#9CA3AF',
    targetDash: '4 4',
    axis: '#5F6B7C',
    axisFontSize: 12,
  },
  /** Muscle map: light grey body and four solid indigo steps (12/40/70/100 % of #4338CA over the grey). */
  muscleMap: {
    body: '#E5E7EB',
    stroke: '#FFFFFF',
    steps: ['#D3D4EA', '#A9A7E9', '#7C76E7', '#4338CA'] as const,
  },
  /** A defined radius hierarchy, not one value everywhere: a card is the largest, a control inside it steps down,
   * and a chip or a pill is fully round. */
  radius: { card: 20, control: 14, inner: 12, chip: 999 },
  /** Soft, low-alpha shadows in two layers (a tight contact shadow plus a wide diffuse one). The image's surfaces
   * are separated by depth rather than outline; kept subtle because heavy shadows compete with content. */
  elevation: {
    card: '0 1px 2px rgba(16,24,40,0.04), 0 10px 28px -14px rgba(16,24,40,0.12)',
    raised: '0 2px 4px rgba(16,24,40,0.05), 0 18px 44px -18px rgba(16,24,40,0.18)',
    overlay: '0 24px 64px -24px rgba(16,24,40,0.30)',
    /** Under the coral action button, so it lifts off the page. */
    accent: '0 8px 20px -8px rgba(194,65,12,0.45)',
  },
  /** The motion system: one place that decides how the app moves, so it feels of a piece. Nothing animates a
   * layout property (only opacity and transform), so an entrance can never shift content and cost CLS, and every
   * helper below is bypassed entirely under `prefers-reduced-motion`. */
  motion: {
    duration: { instant: 90, fast: 160, base: 240, slow: 380, slower: 620 },
    easing: {
      /** Decelerating: something entering or settling. */
      enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
      /** Accelerating: something leaving. */
      exit: 'cubic-bezier(0.4, 0, 1, 1)',
      /** A value changing in place. */
      standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    /** How far an entering element rises, in px. Small on purpose: a large travel reads as a slideshow. */
    rise: 10,
  },
  /** 4 px base spacing scale. */
  space: (n: number) => n * 4,
  tapTarget: 44,
  /** Keyboard focus ring (WCAG 2.4.7): ink, never a data colour. */
  focusRing: { width: 2, offset: 2 },
  layout: {
    phoneWidth: 390,
    maxContent: 1120,
    bottomNavHeight: 64,
    /** The desktop navigation rail's width (mobile keeps the bottom bar). */
    railWidth: 76,
    /** Scroll padding so a focused control never lands under the sticky top bar or the bottom nav + log button (WCAG 2.4.11). */
    scrollPadding: { top: 72, bottom: 152 },
  },
} as const

export type MetricKey = keyof typeof tokens.metric

/** Media query for the reduced-motion preference (WCAG 2.3.3): no transitions, ripples or smooth scrolling. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** True when the viewer asked for reduced motion. Safe outside a browser (false). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
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

/** The CSS gradient for a metric card, left to right. */
export function metricGradient(metric: MetricKey): string {
  const [from, to] = tokens.gradient[metric]
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
}

/**
 * A transition string for the given properties, or `none` when the viewer prefers reduced motion (WCAG 2.3.3).
 * Every hand-written transition in the app goes through this, so the preference cannot be forgotten in one place.
 */
export function transitionOf(properties: string | readonly string[], duration: number = tokens.motion.duration.base, easing: string = tokens.motion.easing.standard): string {
  if (prefersReducedMotion()) return 'none'
  const list = typeof properties === 'string' ? [properties] : properties
  return list.map((p) => `${p} ${duration}ms ${easing}`).join(', ')
}

/** The number of milliseconds an animation should take: 0 under reduced motion, so timers line up with the CSS. */
export function motionDuration(duration: number = tokens.motion.duration.base): number {
  return prefersReducedMotion() ? 0 : duration
}

declare module '@mui/material/styles' {
  interface Palette {
    metric: typeof tokens.metric
    ink: typeof tokens.ink
    accent: typeof tokens.accent
  }
  interface PaletteOptions {
    metric?: typeof tokens.metric
    ink?: typeof tokens.ink
    accent?: typeof tokens.accent
  }
  interface TypographyVariants {
    bigNumber: React.CSSProperties
    label: React.CSSProperties
    sectionTitle: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    bigNumber?: React.CSSProperties
    label?: React.CSSProperties
    sectionTitle?: React.CSSProperties
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    bigNumber: true
    label: true
    sectionTitle: true
  }
}

const { ink, font, radius, accent, elevation } = tokens

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: accent.main, dark: accent.deep, light: accent.bright, contrastText: '#FFFFFF' },
    secondary: { main: tokens.metric.water },
    success: { main: tokens.status.good },
    warning: { main: tokens.status.warning },
    error: { main: tokens.status.flag },
    text: { primary: ink.text, secondary: ink.secondary },
    divider: ink.border,
    background: { default: ink.page, paper: ink.card },
    // MUI's own defaults here are pure-black alphas — the only colours in the app that would not come from `ink`. They
    // are derived from the ink token instead, and lifted enough that an unavailable control is still legible (≈3.2:1 on
    // white) rather than a ghost. WCAG 1.4.3 exempts inactive controls from the contrast requirement; this is a choice
    // about which greys the app is made of, not a rule being satisfied.
    action: { disabled: withAlpha(ink.text, 0.5), disabledBackground: withAlpha(ink.text, 0.12) },
    metric: tokens.metric,
    ink,
    accent,
  },
  shape: { borderRadius: radius.control },
  spacing: 4,
  typography: {
    fontFamily: font.family,
    fontSize: 14,
    htmlFontSize: 16,
    body1: { fontSize: font.size.body, fontWeight: font.weight.body },
    body2: { fontSize: font.size.small, fontWeight: font.weight.body, color: ink.secondary },
    button: { fontWeight: font.weight.label, textTransform: 'none', fontSize: font.size.emphasis },
    h1: { fontSize: 28, fontWeight: font.weight.heading, letterSpacing: -0.3 },
    h2: { fontSize: 24, fontWeight: font.weight.heading, letterSpacing: -0.2 },
    h3: { fontSize: font.size.sectionTitle, fontWeight: font.weight.heading },
    h4: { fontSize: font.size.cardTitle, fontWeight: font.weight.heading },
    sectionTitle: { fontSize: font.size.sectionTitle, fontWeight: font.weight.heading, lineHeight: 1.3 },
    label: { fontSize: font.size.label, fontWeight: font.weight.label, color: ink.secondary, letterSpacing: 0.1 },
    bigNumber: {
      fontSize: font.size.bigNumber,
      fontWeight: font.weight.number,
      lineHeight: 1.1,
      fontVariantNumeric: 'tabular-nums',
      fontFeatureSettings: '"tnum"',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: ink.page,
          color: ink.text,
          WebkitFontSmoothing: 'antialiased',
          // The canvas is a soft tint, so the document itself should not paint a white gutter behind it (overscroll).
          backgroundAttachment: 'fixed',
        },
      },
    },
    // Every custom button (ButtonBase in an sx) gets the same visible keyboard focus ring; MUI's own buttons keep their
    // focus tint underneath it.
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': { outline: `${tokens.focusRing.width}px solid ${ink.text}`, outlineOffset: tokens.focusRing.offset },
        },
      },
    },
    MuiPaper: { defaultProps: { elevation: 0 } },
    // Surfaces are separated by depth, not by an outline: the grey canvas behind a white card is the separation.
    // A hairline is kept only for the printed report and for a card sitting on a card (`& &`), where a shadow would
    // read as a stack of floating panels.
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.card,
          border: 'none',
          backgroundColor: ink.card,
          boxShadow: elevation.card,
          '& &': { boxShadow: 'none', border: `1px solid ${ink.border}` },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: tokens.tapTarget, borderRadius: radius.control, fontWeight: font.weight.label },
        // MUI derives the hover shade for a contained button from `palette.primary.dark`, so the coral deepens on
        // hover without a colour-specific override here.
        contained: { boxShadow: elevation.accent, '&:hover': { boxShadow: elevation.accent } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { minWidth: tokens.tapTarget, minHeight: tokens.tapTarget, borderRadius: radius.control } } },
    // A tappable chip or menu row is a tap target too (SPEC §11: 44 px), whatever size an sx asks for.
    MuiChip: { styleOverrides: { root: { fontWeight: font.weight.label }, clickable: { minHeight: tokens.tapTarget } } },
    // Full-width rows sit flush with a scrolling (clipping) parent, so their focus ring is drawn inside the row.
    MuiMenuItem: { styleOverrides: { root: { minHeight: tokens.tapTarget, '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } } },
    MuiListItemButton: { styleOverrides: { root: { '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } } },
    MuiCardActionArea: { styleOverrides: { root: { '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: radius.control, backgroundColor: ink.card } } },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: radius.card, boxShadow: elevation.overlay } },
    },
    MuiDrawer: { styleOverrides: { paper: { borderRadius: `${radius.card}px ${radius.card}px 0 0` } } },
    MuiPopover: { styleOverrides: { paper: { borderRadius: radius.inner, boxShadow: elevation.overlay } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: radius.inner, boxShadow: elevation.overlay } } },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: radius.inner, backgroundColor: ink.text } } },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'medium' } },
    // A switch's touch target (its input fills the thumb's button) is 44 px tall, not MUI's 38: the button gets 12 px
    // around the 20 px thumb, the track (34 × 14) keeps its place centred under it, so it looks the same.
    MuiSwitch: {
      styleOverrides: {
        root: {
          '&.MuiSwitch-sizeMedium': {
            width: 34 + 2 * 15,
            height: tokens.tapTarget,
            padding: 15,
            '& .MuiSwitch-switchBase': { padding: (tokens.tapTarget - 20) / 2 },
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: { root: { height: tokens.layout.bottomNavHeight, borderTop: `1px solid ${ink.border}`, backgroundColor: ink.card } },
    },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 0, paddingTop: 6, '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: radius.chip, height: 6 }, bar: { borderRadius: radius.chip } },
    },
    // A bottom snackbar sits above the bottom nav and the home indicator, never over the tabs (at every width: MUI's
    // own wider-screen offset is replaced too).
    MuiSnackbar: {
      styleOverrides: {
        root: ({ ownerState, theme }) => {
          if (ownerState.anchorOrigin?.vertical === 'top') return {}
          const bottom = `calc(${tokens.layout.bottomNavHeight + tokens.space(2)}px + env(safe-area-inset-bottom, 0px))`
          return { bottom, [theme.breakpoints.up('sm')]: { bottom } }
        },
      },
    },
  },
})
