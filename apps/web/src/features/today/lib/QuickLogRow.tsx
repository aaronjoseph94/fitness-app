// Owns: Today's quick-log row (SPEC §6) — weigh-in, meal, water, fast start/stop and photo as five equal one-tap
// buttons (icon in the metric colour, label under it, ≥ 64 px tall), each opening its quick-log form.
import MonitorWeightOutlined from '@mui/icons-material/MonitorWeightOutlined'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import TimerOffOutlined from '@mui/icons-material/TimerOffOutlined'
import WaterDropOutlined from '@mui/icons-material/WaterDropOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type SvgIcon from '@mui/material/SvgIcon'
import { useUiStore, type QuickLogKind } from '../../../app/ui-store'
import { tokens } from '../../../theme'

interface Item {
  kind: QuickLogKind
  label: string
  Icon: typeof SvgIcon
  color: string
}

export function QuickLogRow({ fasting }: { fasting: boolean }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const items: Item[] = [
    { kind: 'weigh-in', label: 'Weigh-in', Icon: MonitorWeightOutlined, color: tokens.metric.weight },
    { kind: 'meal', label: 'Meal', Icon: RestaurantOutlined, color: tokens.metric.calories },
    { kind: 'water', label: 'Water', Icon: WaterDropOutlined, color: tokens.metric.water },
    fasting
      ? { kind: 'fast', label: 'End fast', Icon: TimerOffOutlined, color: tokens.metric.fasting }
      : { kind: 'fast', label: 'Start fast', Icon: TimerOutlined, color: tokens.metric.fasting },
    { kind: 'photo', label: 'Photo', Icon: PhotoCameraOutlined, color: tokens.ink.secondary },
  ]
  return (
    <Box
      component="nav"
      aria-label="Quick log"
      data-testid="today-quick-log"
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 2 }}
    >
      {items.map(({ kind, label, Icon, color }) => (
        <ButtonBase
          key={kind}
          onClick={() => openQuickLog(kind)}
          data-testid={`quick-log-${kind}`}
          sx={{
            minHeight: 64,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderRadius: `${tokens.radius.control}px`,
            border: `1px solid ${tokens.ink.border}`,
            bgcolor: tokens.ink.card,
            color: tokens.ink.text,
            fontFamily: tokens.font.family,
            '&:focus-visible': { outline: `2px solid ${tokens.metric.weight}`, outlineOffset: 2 },
          }}
        >
          <Icon aria-hidden sx={{ color, fontSize: 24 }} />
          <Box component="span" sx={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.label, lineHeight: 1.2, textAlign: 'center' }}>
            {label}
          </Box>
        </ButtonBase>
      ))}
    </Box>
  )
}
