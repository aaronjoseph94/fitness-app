// Owns: the logging bottom sheet — handle, title, back to the kinds list, close — around the form for one kind
// (weigh-in, meal, water, fast; photo arrives in phase 5), and the snackbar that confirms a log after the sheet closes
// ("saved on this phone" when it was queued offline). Controlled by its caller: the shell's quick-log or the Log tab.
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
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import type SvgIcon from '@mui/material/SvgIcon'
import Typography from '@mui/material/Typography'
import type { MealSlot } from '@fitness/shared/schemas'
import { useState } from 'react'
import type { QuickLogKind } from '../../../app/ui-store'
import { EmptyState, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { relativeDay, todayLocal } from './dates'
import { FastForm } from './FastForm'
import { MealForm } from './MealForm'
import type { LogNotice } from './ui'
import { WaterForm } from './WaterForm'
import { WeighInForm } from './WeighInForm'

interface KindOption {
  kind: QuickLogKind
  label: string
  Icon: typeof SvgIcon
  /** Literal metric colour of what this kind logs. */
  color: string
}

const KINDS: readonly KindOption[] = [
  { kind: 'weigh-in', label: 'Weigh-in', Icon: MonitorWeightOutlined, color: tokens.metric.weight },
  { kind: 'meal', label: 'Meal', Icon: RestaurantOutlined, color: tokens.metric.calories },
  { kind: 'water', label: 'Water', Icon: WaterDropOutlined, color: tokens.metric.water },
  { kind: 'fast', label: 'Fast', Icon: TimerOutlined, color: tokens.metric.fasting },
  { kind: 'photo', label: 'Progress photo', Icon: PhotoCameraOutlined, color: tokens.ink.secondary },
]

export interface LogSheetProps {
  open: boolean
  /** null shows the list of kinds. */
  kind: QuickLogKind | null
  /** The local date logs go to (default today). */
  date?: string
  /** Preselected meal slot. */
  slot?: MealSlot
  onClose: () => void
  /** Pick a kind from the list (or null to go back to it). Without it the sheet shows only `kind`. */
  onPickKind?: (kind: QuickLogKind | null) => void
}

export function LogSheet({ open, kind, date, slot, onClose, onPickKind }: LogSheetProps) {
  const [notice, setNotice] = useState<LogNotice | null>(null)
  const day = date ?? todayLocal()
  const selected = KINDS.find((option) => option.kind === kind)
  const isToday = day === todayLocal()

  const logged = (n: LogNotice) => {
    setNotice(n)
    onClose()
  }

  return (
    <>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        slotProps={{
          paper: {
            'aria-label': selected ? `Log ${selected.label.toLowerCase()}` : 'Quick log',
            sx: {
              maxWidth: (theme) => theme.breakpoints.values.sm,
              mx: 'auto',
              maxHeight: '92dvh',
              borderTopLeftRadius: tokens.radius.card,
              borderTopRightRadius: tokens.radius.card,
              pb: `calc(${tokens.space(4)}px + env(safe-area-inset-bottom, 0px))`,
            },
          },
        }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: tokens.radius.chip, bgcolor: 'divider', mx: 'auto', mt: 2, flex: 'none' }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: selected && onPickKind ? 2 : 5, pr: 2, pt: 1, flex: 'none' }}>
          {selected && onPickKind && (
            <IconButton aria-label="All kinds" onClick={() => onPickKind(null)}>
              <ArrowBackIosNew fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="sectionTitle" component="h2" noWrap>
              {selected?.label ?? 'Quick log'}
            </Typography>
            {selected && selected.kind !== 'fast' && selected.kind !== 'photo' && !isToday && (
              <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
                For {relativeDay(day)} {day}
              </Box>
            )}
          </Box>
          <IconButton aria-label="Close" onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
        <Box sx={{ overflowY: 'auto', px: 5, pt: 3, pb: 2 }}>
          {!selected ? (
            <List data-testid="quick-log-kinds" sx={{ mx: -5 }}>
              {KINDS.map(({ kind: option, label, Icon, color }) => (
                <ListItemButton key={option} onClick={() => onPickKind?.(option)} sx={{ minHeight: tokens.tapTarget + 8, px: 5 }}>
                  <ListItemIcon sx={{ color, minWidth: tokens.space(10) }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={label} secondary={option === 'photo' ? 'Arrives in phase 5' : undefined} />
                </ListItemButton>
              ))}
            </List>
          ) : selected.kind === 'weigh-in' ? (
            <WeighInForm date={day} onLogged={logged} />
          ) : selected.kind === 'meal' ? (
            <MealForm date={day} slot={slot} onLogged={logged} />
          ) : selected.kind === 'water' ? (
            <WaterForm date={day} onLogged={(n) => n.queued && setNotice(n)} />
          ) : selected.kind === 'fast' ? (
            <FastForm date={day} onLogged={logged} />
          ) : (
            <EmptyState
              compact
              illustration="progress"
              title="Progress photos arrive in phase 5"
              body="Front, side and back, with a faint pose overlay. They stay private and never go to any AI."
            />
          )}
        </Box>
      </Drawer>
      <Snackbar
        open={notice !== null}
        autoHideDuration={notice?.queued ? 6000 : 3500}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        message={
          notice && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {notice.queued && <PendingBadge />}
              {notice.message}
            </Box>
          )
        }
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: { xs: `calc(${tokens.tapTarget + tokens.space(4)}px + env(safe-area-inset-top, 0px))` } }}
        data-testid="log-notice"
      />
    </>
  )
}
