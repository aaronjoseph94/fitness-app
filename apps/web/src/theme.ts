// Owns: every visual token (SPEC §11) — ink, metric palette, semantic status colours, type scale, spacing,
// chart style, muscle-map steps — and the MUI theme built from them. Nothing else in the app hard-codes a colour.
// Charts read `tokens` directly so SVG output carries literal hex colours for print and the PDF archive.
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
    },
  },
  ink: {
    text: '#1A1A2E',
    secondary: '#6B7280',
    border: '#E5E7EB',
    /** Outline of a form control a value is typed into: ≥3:1 on card, page and chart grid (WCAG 1.4.11). */
    control: '#868B94',
    card: '#FFFFFF',
    page: '#FAFAFC',
  },
  /** One colour per metric, used identically in rings, charts, the report and legends. */
  metric: {
    weight: '#4F46E5',
    calories: '#F97316',
    protein: '#E8505B',
    carbs: '#F5B700',
    fat: '#14B8A6',
    water: '#0EA5E9',
    steps: '#22C55E',
    sleep: '#8B5CF6',
    fatMass: '#EC4899',
    lean: '#059669',
    fasting: '#64748B',
  },
  /** Status only — never used for a metric. Each is ≥4.5:1 on white both ways (as text, and white text on it). */
  status: { good: '#15803D', warning: '#B45309', flag: '#DC2626' },
  /** The printed report (SPEC §11 print: black text on white): body text, secondary text, the running header. */
  print: { text: '#000000', secondary: '#333333', header: '#444444', page: '#FFFFFF' },
  chart: {
    grid: '#F1F5F9',
    lineWidth: 2,
    areaOpacity: 0.12,
    bandOpacity: 0.12,
    barRadius: 4,
    target: '#9CA3AF',
    targetDash: '4 4',
    axis: '#6B7280',
    axisFontSize: 12,
  },
  /** Muscle map: light grey body and four solid indigo steps (12/40/70/100 % of #4F46E5 over the grey). */
  muscleMap: {
    body: '#E5E7EB',
    stroke: '#FFFFFF',
    steps: ['#D3D4EA', '#A9A7E9', '#7C76E7', '#4F46E5'] as const,
  },
  radius: { card: 16, control: 12, chip: 999 },
  /** 4 px base spacing scale. */
  space: (n: number) => n * 4,
  tapTarget: 44,
  /** Keyboard focus ring (WCAG 2.4.7): ink, never a data colour. */
  focusRing: { width: 2, offset: 2 },
  layout: {
    phoneWidth: 390,
    maxContent: 1120,
    bottomNavHeight: 64,
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

declare module '@mui/material/styles' {
  interface Palette {
    metric: typeof tokens.metric
    ink: typeof tokens.ink
  }
  interface PaletteOptions {
    metric?: typeof tokens.metric
    ink?: typeof tokens.ink
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

const { ink, font, radius } = tokens

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: tokens.metric.weight },
    secondary: { main: tokens.metric.water },
    success: { main: tokens.status.good },
    warning: { main: tokens.status.warning },
    error: { main: tokens.status.flag },
    text: { primary: ink.text, secondary: ink.secondary },
    divider: ink.border,
    background: { default: ink.page, paper: ink.card },
    metric: tokens.metric,
    ink,
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
    h1: { fontSize: 28, fontWeight: font.weight.heading },
    h2: { fontSize: 24, fontWeight: font.weight.heading },
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
        body: { backgroundColor: ink.page, color: ink.text, WebkitFontSmoothing: 'antialiased' },
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
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: radius.card, border: `1px solid ${ink.border}`, backgroundColor: ink.card, boxShadow: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: tokens.tapTarget, borderRadius: radius.control } },
    },
    MuiIconButton: { styleOverrides: { root: { minWidth: tokens.tapTarget, minHeight: tokens.tapTarget } } },
    // A tappable chip or menu row is a tap target too (SPEC §11: 44 px), whatever size an sx asks for.
    MuiChip: { styleOverrides: { root: { fontWeight: font.weight.label }, clickable: { minHeight: tokens.tapTarget } } },
    // Full-width rows sit flush with a scrolling (clipping) parent, so their focus ring is drawn inside the row.
    MuiMenuItem: { styleOverrides: { root: { minHeight: tokens.tapTarget, '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } } },
    MuiListItemButton: { styleOverrides: { root: { '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } } },
    MuiCardActionArea: { styleOverrides: { root: { '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } } },
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
      styleOverrides: { root: { height: tokens.layout.bottomNavHeight, borderTop: `1px solid ${ink.border}` } },
    },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 0, paddingTop: 6, '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width } } },
    },
  },
})
