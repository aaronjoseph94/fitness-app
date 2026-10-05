// Owns: every visual token (SPEC §11) — ink, metric palette, semantic status colours, type scale, spacing,
// chart style, muscle-map steps — and the MUI theme built from them. Nothing else in the app hard-codes a colour.
// Charts read `tokens` directly so SVG output carries literal hex colours for print and the PDF archive.
import { createTheme } from '@mui/material/styles'

export const tokens = {
  font: {
    family: "'Outfit Variable', 'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif",
    weight: { body: 400, label: 500, heading: 600, number: 700 },
    size: { body: 16, label: 13, sectionTitle: 20, bigNumber: 36, bigNumberSmall: 32, bigNumberLarge: 40 },
  },
  ink: {
    text: '#1A1A2E',
    secondary: '#6B7280',
    border: '#E5E7EB',
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
  /** Status only — never used for a metric. */
  status: { good: '#16A34A', warning: '#D97706', flag: '#DC2626' },
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
  layout: { phoneWidth: 390, maxContent: 1120, bottomNavHeight: 64 },
} as const

export type MetricKey = keyof typeof tokens.metric

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
    body2: { fontSize: 14, fontWeight: font.weight.body, color: ink.secondary },
    button: { fontWeight: font.weight.label, textTransform: 'none', fontSize: 15 },
    h1: { fontSize: 28, fontWeight: font.weight.heading },
    h2: { fontSize: 24, fontWeight: font.weight.heading },
    h3: { fontSize: font.size.sectionTitle, fontWeight: font.weight.heading },
    h4: { fontSize: 18, fontWeight: font.weight.heading },
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
    MuiChip: { styleOverrides: { root: { fontWeight: font.weight.label } } },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'medium' } },
    MuiBottomNavigation: {
      styleOverrides: { root: { height: tokens.layout.bottomNavHeight, borderTop: `1px solid ${ink.border}` } },
    },
    MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0, paddingTop: 6 } } },
  },
})
