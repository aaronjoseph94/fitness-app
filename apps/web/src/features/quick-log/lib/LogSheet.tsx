// Owns: the logging bottom sheet — handle, title, back to the kinds list, close — around the form for one kind
// (weigh-in, meal, water, fast; photo hands over to the /photos/new capture screen), the review stage a
// text/voice/photo meal moves to once it reaches the server (analysis, items to confirm, then the day adjustment),
// and the snackbar that confirms a log ("saved on this phone" when it was queued offline). Controlled by its
// caller: the shell's quick-log or the Log tab.
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
import { PendingBadge, useSheetDrag } from '../../../components'
import { sheetSurface, tokens, withAlpha } from '../../../theme'
import { relativeDay, todayLocal } from './dates'
import { FastForm } from './FastForm'
import { MealForm, type CapturedMeal } from './MealForm'
import { MealReview } from './review/MealReview'
import { PhotoKind } from './PhotoKind'
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
  const [notice, setNoticeState] = useState<(LogNotice & { seq: number }) | null>(null)
  /** Each notice gets its own sequence number, used as the snackbar's key: MUI only restarts the auto-hide timer when
   * `open` changes, so without a remount a notice shown while the previous one is still up would close on the old timer. */
  const setNotice = (n: LogNotice | null) => setNoticeState((prev) => (n ? { ...n, seq: (prev?.seq ?? 0) + 1 } : null))
  /** A captured meal under review; the sheet shows it instead of the form until closed. */
  const [review, setReview] = useState<CapturedMeal | null>(null)
  const day = date ?? todayLocal()
  const selected = KINDS.find((option) => option.kind === kind)
  const isToday = day === todayLocal()
  // Drag the header down to throw the sheet away: 1:1 with the finger, and the release hands its own velocity to the
  // spring that settles it. Reduced motion opts out, leaving the Close button as the way out.
  const drag = useSheetDrag({ onDismiss: onClose })

  /** Once the sheet has slid away: drop the review (and its thumbnails) so the next open starts at the form. */
  const onExited = () => {
    if (!review) return
    review.previews.forEach((url) => URL.revokeObjectURL(url))
    setReview(null)
  }

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
          transition: { onExited },
          paper: {
            'aria-label': review ? 'Review meal' : selected ? `Log ${selected.label.toLowerCase()}` : 'Quick log',
            sx: {
              ...sheetSurface,
              maxWidth: (theme) => theme.breakpoints.values.sm,
              mx: 'auto',
              maxHeight: '92dvh',
              borderTopLeftRadius: tokens.radius.card,
              borderTopRightRadius: tokens.radius.card,
              pb: `calc(${tokens.space(4)}px + env(safe-area-inset-bottom, 0px))`,
              // While the finger owns the sheet, nothing may smooth its moves: `!important` because MUI's own slide
              // writes a transition inline on this element, and a 225 ms curve under a 1:1 drag is lag.
              transition: drag.dragging ? 'none !important' : undefined,
              willChange: drag.dragging ? 'transform' : undefined,
            },
          },
        }}
      >
        {/* The grabber is the drag region, and it is deliberately the *only* part of the sheet that is: the gesture
            captures the pointer on pointer-down, which retargets the click away from anything inside the region — so
            the Back and Close buttons below it must stay outside. The strip is a full-width 28 px target with the
            36 × 5 pill centred in it, the proportion iOS uses, in ink rather than the divider grey so it reads as a
            handle on the material instead of as a faint hairline. */}
        <Box
          data-testid="log-sheet-handle"
          {...drag.handleProps}
          sx={{ height: 28, pt: 0.5, display: 'grid', placeItems: 'center', flex: 'none', ...drag.handleSx }}
        >
          <Box aria-hidden sx={{ width: 36, height: 5, borderRadius: tokens.radius.chip, bgcolor: withAlpha(tokens.ink.text, 0.2) }} />
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: selected && onPickKind && !review ? 2 : 5, pr: 2, flex: 'none' }}>
          {selected && onPickKind && !review && (
            <IconButton aria-label="All kinds" onClick={() => onPickKind(null)}>
              <ArrowBackIosNew fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="sectionTitle" component="h2" noWrap>
              {review ? 'Review meal' : (selected?.label ?? 'Quick log')}
            </Typography>
            {selected && selected.kind !== 'fast' && selected.kind !== 'photo' && !isToday && (
              <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary' }}>
                For {relativeDay(day)} {day}
              </Box>
            )}
          </Box>
          <IconButton aria-label="Close" onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
        <Box sx={{ overflowY: 'auto', px: 5, pt: 3, pb: 2 }}>
          {review ? (
            <MealReview
              key={review.mealId}
              date={review.date}
              mealId={review.mealId}
              localPreviews={review.previews}
              onClose={onClose}
              onLogged={setNotice}
            />
          ) : !selected ? (
            <List component="div" data-testid="quick-log-kinds" sx={{ mx: -5 }}>
              {KINDS.map(({ kind: option, label, Icon, color }) => (
                <ListItemButton key={option} onClick={() => onPickKind?.(option)} sx={{ minHeight: tokens.tapTarget + 8, px: 5 }}>
                  <ListItemIcon sx={{ color, minWidth: tokens.space(10) }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={label} secondary={option === 'photo' ? 'Opens the camera' : undefined} />
                </ListItemButton>
              ))}
            </List>
          ) : selected.kind === 'weigh-in' ? (
            <WeighInForm date={day} onLogged={logged} />
          ) : selected.kind === 'meal' ? (
            <MealForm date={day} slot={slot} onLogged={logged} onCaptured={setReview} />
          ) : selected.kind === 'water' ? (
            <WaterForm date={day} onLogged={(n) => n.queued && setNotice(n)} />
          ) : selected.kind === 'fast' ? (
            <FastForm date={day} onLogged={logged} />
          ) : (
            <PhotoKind onLeave={onClose} />
          )}
        </Box>
      </Drawer>
      <Snackbar
        key={notice?.seq ?? 0}
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
