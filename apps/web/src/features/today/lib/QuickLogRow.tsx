// Owns: Today's quick-log row (SPEC §6, 1d) — weigh-in, meal, water, fast start/stop and photo as five white tiles
// (five across from 440 px of room, else three over two — never four over a lone one), each a 42 px tinted glyph
// square in its metric's colour over its label, opening its quick-log form in one tap.
import MonitorWeightOutlined from '@mui/icons-material/MonitorWeightOutlined'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import RestaurantRounded from '@mui/icons-material/RestaurantRounded'
import TimerOffOutlined from '@mui/icons-material/TimerOffOutlined'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type SvgIcon from '@mui/material/SvgIcon'
import { useUiStore, type QuickLogKind } from '../../../app/ui-store'
import { staggerDelay, useEntrance } from '../../../components'
import { enterEasing, metricTint, reducedEntrance, tokens, transitionOf } from '../../../theme'

const { summit, font } = tokens

interface Item {
  kind: QuickLogKind
  label: string
  Icon: typeof SvgIcon
  /** The glyph square's tint and the glyph's colour (README: each tile in its metric's family). */
  tint: string
  color: string
}

/** The tiles pop in 60 ms apart after the coach note (README §6). */
const tileDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.card, 420)

export function QuickLogRow({ fasting }: { fasting: boolean }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const { entered, reduced } = useEntrance()
  const items: Item[] = [
    {
      kind: 'weigh-in',
      label: 'Weigh-in',
      Icon: MonitorWeightOutlined,
      tint: metricTint('steps'),
      color: tokens.metric.steps,
    },
    {
      kind: 'meal',
      label: 'Meal',
      Icon: RestaurantRounded,
      tint: metricTint('calories'),
      color: tokens.metric.calories,
    },
    {
      kind: 'water',
      label: 'Water',
      Icon: WaterDropRounded,
      tint: metricTint('water'),
      color: tokens.tone.success.text,
    },
    {
      kind: 'fast',
      label: fasting ? 'End fast' : 'Start fast',
      Icon: fasting ? TimerOffOutlined : TimerOutlined,
      tint: metricTint('protein'),
      color: tokens.tone.warning.text,
    },
    {
      kind: 'photo',
      label: 'Photo',
      Icon: PhotoCameraOutlined,
      tint: metricTint('sleep'),
      color: tokens.metric.sleep,
    },
  ]
  return (
    <Box
      component="nav"
      aria-label="Quick log"
      data-testid="today-quick-log"
      sx={{ containerType: 'inline-size', minWidth: 0 }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: '10px',
          // Six tracks: the first three tiles take two each, the last two three each (3 + 2).
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          '& > *': { gridColumn: 'span 2' },
          '& > :nth-of-type(n+4)': { gridColumn: 'span 3' },
          '@container (min-width: 440px)': {
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            '& > *, & > :nth-of-type(n+4)': { gridColumn: 'auto' },
          },
        }}
      >
        {items.map(({ kind, label, Icon, tint, color }, i) => (
          <ButtonBase
            key={kind}
            onClick={() => openQuickLog(kind)}
            data-testid={`quick-log-${kind}`}
            sx={{
              minWidth: 0,
              minHeight: tokens.tapTarget,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              px: '4px',
              py: '14px',
              borderRadius: `${summit.radius.small}px`,
              bgcolor: summit.surface.card,
              boxShadow: summit.shadow.tile,
              color: tokens.ink.text,
              fontFamily: font.family,
              fontSize: font.size.small,
              fontWeight: font.weight.label,
              lineHeight: 1.2,
              textAlign: 'center',
              opacity: entered ? 1 : 0,
              transform: entered ? 'none' : 'scale(0.85)',
              transition: reduced
                ? transitionOf('box-shadow')
                : `opacity 600ms ${enterEasing()} ${tileDelay(i)}ms, transform 600ms ${enterEasing()} ${tileDelay(i)}ms, box-shadow ${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard}`,
              animation: reducedEntrance(tileDelay(i), reduced),
              '&:hover': { boxShadow: summit.shadow.tileHover },
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 42,
                height: 42,
                borderRadius: `${summit.radius.wellSmall}px`,
                display: 'grid',
                placeItems: 'center',
                bgcolor: tint,
                color,
              }}
            >
              <Icon sx={{ fontSize: 24 }} />
            </Box>
            {label}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  )
}
