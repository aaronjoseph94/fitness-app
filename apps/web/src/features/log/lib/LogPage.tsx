// Owns: the Log tab page (SPEC §6, §8 manual route) for one day (1d Summit) — the sky hero (the "Fuel log · Day N"
// eyebrow, the day as the h1, one line of what is left and logged, the date switcher pill with ?date= in the URL and the
// gold "+ Log" opening the quick-log sheet for that day), the day's three-part header (eaten, macros, weigh-in), then
// meals by slot beside the rail (water, sleep and steps, measurements, fasting, favourites) at 2 : 1, wrapping to one
// column when they no longer fit (README §4) — the same card order either way — and the logging sheet it opens.
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { endpoints } from '@fitness/shared/api'
import { daysBetween } from '@fitness/shared/engine'
import type { MealSlot } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useApiQuery } from '../../../api'
import { useLocalToday } from '../../../app/local-today'
import { useUiStore, type QuickLogKind } from '../../../app/ui-store'
import {
  dateToTime,
  formatShortDate,
  PageHeader,
  Reveal,
  staggerDelay,
  wrapCol,
  WrapRow,
} from '../../../components'
import { tokens } from '../../../theme'
import { useDay } from '../../quick-log'
import { LogSheet } from '../../quick-log/sheet'
import { logDate } from '../queries'
import { DateSwitcher } from './DateSwitcher'
import { DayHeader, daySummary } from './DayHeader'
import { FastingCard } from './FastingCard'
import { FavouritesManager } from './FavouritesManager'
import { MealsSection } from './MealsSection'
import { MeasurementsCard } from './MeasurementsCard'
import { useDayMeals } from './meals'
import { SleepStepsCard } from './SleepStepsCard'
import { WaterCard } from './WaterCard'

/** The day in the URL (?date=2026-10-04), never after today; today when absent. */
function useLogDate(): [string, string, (date: string) => void] {
  const [params, setParams] = useSearchParams()
  // Midnight passes while the app is open: "today" follows it.
  const today = useLocalToday()
  const date = logDate(params.get('date'), today)
  const setDate = (next: string) => {
    const clamped = next > today ? today : next
    setParams(clamped === today ? {} : { date: clamped }, { replace: true })
  }
  return [date, today, setDate]
}

const weekdayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })

/** 1d's entrance: the day header, then the meals, then the rail's cards 90 ms apart. */
const railDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.section, 300)

/** A single-column stack of cards (README §4: a bare grid must declare its one track as minmax(0, 1fr)). */
const stackSx = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: `${tokens.summit.space.gap.tile}px`,
  alignContent: 'start',
} as const

interface SheetState {
  open: boolean
  kind: QuickLogKind | null
  slot?: MealSlot
}

export function LogPage() {
  const [date, today, setDate] = useLogDate()
  const day = useDay(date)
  const settings = useApiQuery(endpoints.settings.get, {}, { staleTime: 5 * 60_000 })
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {})
  const favs = favourites.data ?? []
  const meals = useDayMeals(date, favs)
  const [sheet, setSheet] = useState<SheetState>({ open: false, kind: null })
  const openSheet = (kind: QuickLogKind, slot?: MealSlot) => setSheet({ open: true, kind, slot })
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const pendingMeals = meals.meals.filter((m) => m.pending === 'create').length

  const start = settings.data?.profile.start_date
  const planDay = start && start <= date ? daysBetween(start, date) + 1 : null

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '26px' }} data-testid="log-page">
      <PageHeader
        eyebrow={planDay !== null ? `Fuel log · Day ${planDay}` : 'Fuel log'}
        title={`${weekdayLong.format(dateToTime(date))}, ${formatShortDate(date)}`}
        pageName="Log"
        subtitle={day.data ? daySummary(day.data) : undefined}
        action={<DateSwitcher date={date} today={today} onChange={setDate} />}
        primaryAction={
          <Button
            variant="contained"
            color="gold"
            startIcon={<AddRounded />}
            aria-haspopup="dialog"
            onClick={() => openQuickLog(null, { date })}
          >
            Log
          </Button>
        }
      />
      <Reveal delay={100}>
        <DayHeader
          date={date}
          isToday={date === today}
          day={day.data}
          isLoading={day.isLoading}
          error={day.error}
          onRetry={() => void day.refetch()}
          pendingMeals={pendingMeals}
          floor={settings.data?.settings.calorie_floor ?? null}
          onWeighIn={() => openSheet('weigh-in')}
        />
      </Reveal>
      <WrapRow align="flex-start">
        <Box sx={wrapCol(2)}>
          <Reveal delay={200}>
            <MealsSection
              day={day.data}
              meals={meals}
              favourites={favs}
              onAdd={(slot) => openSheet('meal', slot)}
            />
          </Reveal>
        </Box>
        <Box sx={{ ...wrapCol(1), ...stackSx }}>
          <Reveal delay={railDelay(0)}>
            <WaterCard date={date} />
          </Reveal>
          <Reveal delay={railDelay(1)}>
            <SleepStepsCard date={date} day={day.data} loading={day.isLoading} />
          </Reveal>
          <Reveal delay={railDelay(2)}>
            <MeasurementsCard date={date} />
          </Reveal>
          <Reveal delay={railDelay(3)}>
            <FastingCard today={today} onPlan={() => openSheet('fast')} />
          </Reveal>
          <Reveal delay={railDelay(4)}>
            <FavouritesManager
              favourites={favs}
              isLoading={favourites.isLoading}
              error={favourites.error}
              onRetry={() => void favourites.refetch()}
            />
          </Reveal>
        </Box>
      </WrapRow>
      <LogSheet
        open={sheet.open}
        kind={sheet.kind}
        date={date}
        slot={sheet.slot}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </Box>
  )
}
