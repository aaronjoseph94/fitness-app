// Owns: the Log tab page (SPEC §6, §8 manual route) for one day — the date switcher (?date= in the URL), the day's
// totals against targets and its weigh-in, meals by slot, water, sleep and steps, measurements, fasting and the
// favourites manager — and the logging sheet it opens for that day.
import Box from '@mui/material/Box'
import { endpoints } from '@fitness/shared/api'
import type { MealSlot } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useApiQuery } from '../../../api'
import { useLocalToday } from '../../../app/local-today'
import type { QuickLogKind } from '../../../app/ui-store'
import { LogSheet, useDay, useLogSettings } from '../../quick-log'
import { DateSwitcher } from './DateSwitcher'
import { DayHeader } from './DayHeader'
import { FastingCard } from './FastingCard'
import { FavouritesManager } from './FavouritesManager'
import { MealsSection } from './MealsSection'
import { MeasurementsCard } from './MeasurementsCard'
import { useDayMeals } from './meals'
import { SleepStepsCard } from './SleepStepsCard'
import { WaterCard } from './WaterCard'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The day in the URL (?date=2026-10-04), never after today; today when absent. */
function useLogDate(): [string, string, (date: string) => void] {
  const [params, setParams] = useSearchParams()
  // Midnight passes while the app is open: "today" follows it.
  const today = useLocalToday()
  const raw = params.get('date')
  const date = raw && ISO_DATE.test(raw) && raw <= today ? raw : today
  const setDate = (next: string) => {
    const clamped = next > today ? today : next
    setParams(clamped === today ? {} : { date: clamped }, { replace: true })
  }
  return [date, today, setDate]
}

interface SheetState {
  open: boolean
  kind: QuickLogKind | null
  slot?: MealSlot
}

export function LogPage() {
  const [date, today, setDate] = useLogDate()
  const settings = useLogSettings()
  const day = useDay(date)
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {})
  const favs = favourites.data ?? []
  const meals = useDayMeals(date, favs)
  const [sheet, setSheet] = useState<SheetState>({ open: false, kind: null })
  const openSheet = (kind: QuickLogKind, slot?: MealSlot) => setSheet({ open: true, kind, slot })
  const pendingMeals = meals.meals.filter((m) => m.pending === 'create').length

  return (
    <Box sx={{ display: 'grid', gap: 3 }} data-testid="log-page">
      <DateSwitcher date={date} today={today} onChange={setDate} />
      <DayHeader
        date={date}
        day={day.data}
        isLoading={day.isLoading}
        error={day.error}
        onRetry={() => void day.refetch()}
        pendingMeals={pendingMeals}
        onWeighIn={() => openSheet('weigh-in')}
      />
      <MealsSection day={day.data} meals={meals} favourites={favs} breakfastEnabled={settings.breakfastEnabled} onAdd={(slot) => openSheet('meal', slot)} />
      <WaterCard date={date} />
      <SleepStepsCard date={date} day={day.data} />
      <MeasurementsCard date={date} />
      <FastingCard today={today} onPlan={() => openSheet('fast')} />
      <FavouritesManager favourites={favs} isLoading={favourites.isLoading} error={favourites.error} onRetry={() => void favourites.refetch()} />
      <LogSheet open={sheet.open} kind={sheet.kind} date={date} slot={sheet.slot} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Box>
  )
}
