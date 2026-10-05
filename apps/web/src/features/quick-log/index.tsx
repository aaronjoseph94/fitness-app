// Owns: the quick-log bottom sheet (SPEC §6 quick-log row), opened by the shell's button and by features through
// `useUiStore().openQuickLog(kind)`. Placeholder: lists the kinds; each kind's form arrives with its work package.
import ArrowBackIosNew from '@mui/icons-material/ArrowBackIosNew'
import Close from '@mui/icons-material/Close'
import MonitorWeightOutlined from '@mui/icons-material/MonitorWeightOutlined'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import WaterDropOutlined from '@mui/icons-material/WaterDropOutlined'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import type SvgIcon from '@mui/material/SvgIcon'
import Typography from '@mui/material/Typography'
import { useUiStore, type QuickLogKind } from '../../app/ui-store'
import { tokens } from '../../theme'

interface KindOption {
  kind: QuickLogKind
  label: string
  Icon: typeof SvgIcon
  /** Palette path of the metric this kind logs. */
  color: string
  phase: number
}

const KINDS: readonly KindOption[] = [
  { kind: 'weigh-in', label: 'Weigh-in', Icon: MonitorWeightOutlined, color: 'metric.weight', phase: 1 },
  { kind: 'meal', label: 'Meal', Icon: RestaurantOutlined, color: 'metric.calories', phase: 1 },
  { kind: 'water', label: 'Water', Icon: WaterDropOutlined, color: 'metric.water', phase: 1 },
  { kind: 'fast', label: 'Start or stop a fast', Icon: TimerOutlined, color: 'metric.fasting', phase: 1 },
  { kind: 'photo', label: 'Progress photo', Icon: PhotoCameraOutlined, color: 'text.secondary', phase: 5 },
]

export function QuickLogSheet() {
  const { open, kind } = useUiStore((s) => s.quickLog)
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const close = useUiStore((s) => s.closeQuickLog)
  const selected = KINDS.find((option) => option.kind === kind)

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={close}
      slotProps={{
        paper: {
          'aria-label': 'Quick log',
          sx: {
            maxWidth: (theme) => theme.breakpoints.values.sm,
            mx: 'auto',
            borderTopLeftRadius: tokens.radius.card,
            borderTopRightRadius: tokens.radius.card,
            pb: `calc(${tokens.space(4)}px + env(safe-area-inset-bottom, 0px))`,
          },
        },
      }}
    >
      <Box sx={{ width: 36, height: 4, borderRadius: tokens.radius.chip, bgcolor: 'divider', mx: 'auto', mt: 2 }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: selected ? 2 : 5, pr: 2, pt: 1 }}>
        {selected && (
          <IconButton aria-label="All kinds" onClick={() => openQuickLog()}>
            <ArrowBackIosNew fontSize="small" />
          </IconButton>
        )}
        <Typography variant="sectionTitle" component="h2" sx={{ flex: 1 }}>
          {selected?.label ?? 'Quick log'}
        </Typography>
        <IconButton aria-label="Close" onClick={close}>
          <Close />
        </IconButton>
      </Stack>
      {selected ? (
        <Typography variant="body2" sx={{ px: 5, pt: 2, pb: 4 }}>
          This form arrives in phase {selected.phase}.
        </Typography>
      ) : (
        <List data-testid="quick-log-kinds">
          {KINDS.map(({ kind: option, label, Icon, color }) => (
            <ListItemButton key={option} onClick={() => openQuickLog(option)} sx={{ minHeight: tokens.tapTarget, px: 5 }}>
              <ListItemIcon sx={{ color, minWidth: tokens.space(10) }}>
                <Icon />
              </ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      )}
    </Drawer>
  )
}
