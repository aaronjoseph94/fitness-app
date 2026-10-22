// Owns: `SkyHero`, the 1d dusk sky every page opens on (README §3) — the sky gradient (Today's full sky or an inner
// page's), twinkling stars, a breathing sun glow and a floating sun disc placed in % (`left: calc(58% − half its
// width)`, so they show at every width), Today's drifting clouds, and the two-layer ridge silhouette at its foot. It is
// a full-bleed band: `minHeight` per variant (Today 660, inner 340, compact 280), 64 px of padding under its content
// (the cream panel rides 44 px up over it), and `topInset` kept clear for a nav drawn over it. The decoration is
// `aria-hidden` and ignores the pointer; its ambient loops stop under `prefers-reduced-motion`, and every ambient loop
// (`skyLoop`: the stars, the sun, the clouds, Today's mountain route) pauses while the sky is scrolled off screen. A
// one-shot entrance is never paused, so a page restored below its sky still finishes drawing its title and flags.
import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { useEffect, useState, type ReactNode } from 'react'
import { minWidth, theme, tokens, type HeroVariant } from '../../theme'

const { summit, layout, motion } = tokens

// README §6 / anim.js: twinkle 0.15 → 1 → 0.15 with a scale; breathe 0.4 → 1 → 0.4; float up 10 px and back; drift a
// slow wander of the clouds.
const twinkle = keyframes`
  0%, 100% { opacity: 0.15; transform: scale(0.6); }
  50% { opacity: 1; transform: scale(1); }
`
const breathe = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`
const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
`
const drift = keyframes`
  0%, 100% { transform: translate(0%, 0%) scale(1); }
  33% { transform: translate(9%, -11%) scale(1.15); }
  66% { transform: translate(-8%, 7%) scale(0.92); }
`

/** A star: position in % of the sky, size in px, warm or cool, and its loop's length and offset (ms). */
interface Star {
  left: number
  top: number
  size: number
  warm?: boolean
  duration: number
  offset: number
}

/** The mocks' stars: eight across Today's taller sky, four on an inner page's. */
const STARS: Record<HeroVariant, readonly Star[]> = {
  today: [
    { left: 8, top: 14, size: 3, duration: 3000, offset: 0 },
    { left: 22, top: 8, size: 2, duration: 3800, offset: -1000 },
    { left: 36, top: 18, size: 3, warm: true, duration: 2600, offset: -600 },
    { left: 47, top: 6, size: 2, duration: 4200, offset: -2000 },
    { left: 58, top: 15, size: 3, duration: 3300, offset: -1500 },
    { left: 71, top: 9, size: 2, warm: true, duration: 2900, offset: -400 },
    { left: 84, top: 13, size: 3, duration: 3600, offset: -2600 },
    { left: 93, top: 22, size: 2, duration: 4000, offset: -3000 },
  ],
  inner: [
    { left: 14, top: 16, size: 3, duration: 3000, offset: 0 },
    { left: 38, top: 8, size: 2, duration: 3800, offset: -1000 },
    { left: 57, top: 20, size: 3, warm: true, duration: 2600, offset: -600 },
    { left: 86, top: 14, size: 3, duration: 3600, offset: -2600 },
  ],
  compact: [
    { left: 13, top: 18, size: 3, duration: 3000, offset: 0 },
    { left: 36, top: 10, size: 2, duration: 3800, offset: -1000 },
    { left: 58, top: 24, size: 3, warm: true, duration: 2600, offset: -600 },
    { left: 86, top: 16, size: 3, duration: 3600, offset: -2600 },
  ],
}

/**
 * The sun per variant, in px from the sky's top (the mocks): an inner page's glow (420) is centred at 58 % and the disc
 * (90) sits a little right of it; Today's (440 / 140) sit at 87 %, behind the mountain. Today's disc shows only from
 * `layout.todayMountain` (1,180 px) up, where the mountain stands beside the headline and covers it as in the mock;
 * narrower, the mountain moves under the headline and the disc would sit behind the copy (white on it is ~1.4:1), so
 * only the glow stays — the mock's fixed-px disc falls off a narrow canvas the same way. Under 600 px an inner sky's
 * title, subtitle and actions run the full width and can wrap down to the ridge, so its sun sets: only a smaller glow
 * stays, low on the right, and the disc goes (no spot on a phone's short sky is clear of the copy on every page).
 */
const SUN = {
  today: { glow: 440, glowLeft: '87%', glowTop: 250, disc: 140, discLeft: '87%', discTop: 400 },
  inner: {
    glow: 420,
    glowLeft: '58%',
    glowTop: -70,
    disc: 90,
    discLeft: 'calc(58% + min(80px, 8vw))',
    discTop: 108,
  },
  compact: {
    glow: 420,
    glowLeft: '58%',
    glowTop: -70,
    disc: 90,
    discLeft: 'calc(58% + min(80px, 8vw))',
    discTop: 84,
  },
} as const

/**
 * Today's near cloud, px from the sky's top: 90 px above the mock's 250, behind the trend number (large text, 3:1)
 * rather than the line under it — its pale core there left that 18 px line at 3.3:1 (theme.ts header).
 */
const NEAR_CLOUD_TOP = 160

/** The ridge's two layers in a 1440 × 140 box, stretched to the sky's width (README §3). */
const RIDGE = {
  back: 'M0,140 L0,96 C180,70 300,24 470,46 C640,68 730,8 900,30 C1070,52 1190,98 1440,78 L1440,140 Z',
  front: 'M0,140 L0,120 C240,104 420,128 640,112 C860,96 1080,132 1440,110 L1440,140 Z',
} as const

/** Where an inner sky's sun sets on a phone: the glow only. */
const SETTING_SUN = {
  glow: { width: 240, height: 240, left: 'calc(84% - 120px)', top: 'auto', bottom: -80 },
  disc: { display: 'none' },
} as const
const PHONE = theme.breakpoints.down('sm')
/** Today's disc: off until the mountain stands beside the headline. */
const TODAY_DISC = { display: 'none', [minWidth(layout.todayMountain)]: { display: 'block' } } as const

/**
 * An ambient loop in the sky: it stops under reduced motion (the element keeps its resting look) and pauses while its
 * sky is off screen (`data-paused` on the sky). Only loops pause: a one-shot entrance must always finish.
 */
export const skyLoop = (
  name: ReturnType<typeof keyframes>,
  duration: number,
  offset = 0,
  timing = 'ease-in-out',
) => ({
  animation: `${name} ${duration}ms ${timing} ${offset}ms infinite`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  '[data-sky-hero][data-paused] &': { animationPlayState: 'paused' },
})
const loop = skyLoop

export interface SkyHeroProps {
  /** `today` (660, the full sky with clouds), `inner` (340, the default) or `compact` (280: Ask AI, Settings). */
  variant?: HeroVariant
  /** Space kept clear at the top for a nav drawn over the sky (a CSS length). Default none. */
  topInset?: string
  children?: ReactNode
  /** Root element. Default `div`. */
  component?: 'div' | 'section' | 'header'
  testId?: string
}

/** The sky's decoration: stars, the sun's glow and disc, Today's clouds, the ridge. Decorative only. */
function SkyDecor({ variant }: { variant: HeroVariant }) {
  const sun = SUN[variant]
  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {STARS[variant].map((star) => (
        <Box
          key={`${star.left}-${star.top}`}
          sx={{
            position: 'absolute',
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            borderRadius: '50%',
            bgcolor: star.warm ? summit.star.warm : summit.star.cool,
            ...loop(twinkle, star.duration, star.offset),
          }}
        />
      ))}
      <Box
        sx={{
          position: 'absolute',
          left: `calc(${sun.glowLeft} - ${sun.glow / 2}px)`,
          top: sun.glowTop,
          width: sun.glow,
          height: sun.glow,
          borderRadius: '50%',
          background: variant === 'today' ? summit.sun.glowToday : summit.sun.glow,
          ...loop(breathe, motion.loop.breathe),
          ...(variant !== 'today' && { [PHONE]: SETTING_SUN.glow }),
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: `calc(${sun.discLeft} - ${sun.disc / 2}px)`,
          top: sun.discTop,
          width: sun.disc,
          height: sun.disc,
          borderRadius: '50%',
          background: summit.sun.disc,
          ...loop(float, motion.loop.float),
          ...(variant === 'today' ? TODAY_DISC : { [PHONE]: SETTING_SUN.disc }),
        }}
      />
      {variant === 'today' && (
        <>
          <Box
            sx={{
              position: 'absolute',
              left: '8%',
              top: NEAR_CLOUD_TOP,
              width: 420,
              height: 90,
              borderRadius: '50%',
              background: summit.cloud.near,
              ...loop(drift, motion.loop.drift),
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: '54%',
              top: 170,
              width: 520,
              height: 110,
              borderRadius: '50%',
              background: summit.cloud.far,
              ...loop(drift, motion.loop.drift * 1.25, -20000),
            }}
          />
        </>
      )}
      {variant !== 'today' && (
        <svg
          viewBox="0 0 1440 140"
          preserveAspectRatio="none"
          focusable="false"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: variant === 'compact' ? 120 : 140,
          }}
        >
          <path d={RIDGE.back} fill={summit.ridge.back} />
          <path d={RIDGE.front} fill={summit.ridge.front} />
        </svg>
      )}
    </Box>
  )
}

/** True while `el` is scrolled out of the viewport (never before the first observation). */
function useOffscreen(el: HTMLElement | null): boolean {
  const [offscreen, setOffscreen] = useState(false)
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) =>
      setOffscreen(entry ? !entry.isIntersecting : false),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return offscreen
}

export function SkyHero({ variant = 'inner', topInset, children, component = 'div', testId }: SkyHeroProps) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const paused = useOffscreen(el)
  return (
    <Box
      ref={setEl}
      component={component}
      data-testid={testId}
      data-sky-hero={variant}
      data-paused={paused ? '' : undefined}
      sx={{
        position: 'relative',
        isolation: 'isolate',
        minHeight: layout.hero[variant],
        boxSizing: 'border-box',
        pt: topInset,
        pb: `${layout.hero.padBottom}px`,
        overflow: 'hidden',
        background: variant === 'today' ? summit.sky.today : summit.sky.inner,
        color: summit.onSky.text,
        displayPrint: 'none',
      }}
    >
      <SkyDecor variant={variant} />
      <Box sx={{ position: 'relative', zIndex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
