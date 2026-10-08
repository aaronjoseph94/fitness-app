// Owns: the Log tab page (SPEC §6, §8 manual route) for one day — the 2a title row (the h1, the date switcher with
// ?date= in the URL, and "+ Log" opening the quick-log sheet for that day from `md` up, where the phone's floating
// button is not shown), the day's three-part header (eaten, macros, weigh-in), meals by slot, water, sleep and steps,
// measurements, fasting and the favourites — and the logging sheet it opens for that day. On a phone it is one stack;
// from `lg` the meals take two thirds with the rail beside them (half and half at `md`), the same card order either way.
import AddRounded from '@mui/icons-material/AddRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { endpoints } from '@fitness/shared/api'
import type { MealSlot } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useApiQuery } from '../../../api'
import { useLocalToday } from '../../../app/local-today'
import { useUiStore, type QuickLogKind } from '../../../app/ui-store'
import { Column, Columns, PageHeader, Reveal, staggerDelay } from '../../../components'
import { tokens } from '../../../theme'
import { useDay } from '../../quick-log'
import { LogSheet } from '../../quick-log/sheet'
import { logDate } from '../queries'
import { DateSwitcher } from './DateSwitcher'
import { DayHeader } from './DayHeader'
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

/** 2a's entrance: the day header, then the meals, then the rail's cards 60 ms apart. */
const railDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.card, 250)

interface SheetState {
  open: boolean
  kind: QuickLogKind | null
  slot?: MealSlot
}

export function LogPage() {
  const [date, today, setDate] = useLogDate()
  const day = useDay(date)
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {})
  const favs = favourites.data ?? []
  const meals = useDayMeals(date, favs)
  const [sheet, setSheet] = useState<SheetState>({ open: false, kind: null })
  const openSheet = (kind: QuickLogKind, slot?: MealSlot) => setSheet({ open: true, kind, slot })
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const pendingMeals = meals.meals.filter((m) => m.pending === 'create').length

  return (
    <Box sx={{ display: 'grid', gap: 5 }} data-testid="log-page">
      <PageHeader
        title="Log"
        subtitle="Everything you ate, drank and measured on one day"
        action={
          <>
            <DateSwitcher date={date} today={today} onChange={setDate} />
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              endIcon={<ExpandMoreRounded />}
              aria-haspopup="dialog"
              onClick={() => openQuickLog(null, { date })}
              sx={{ display: { xs: 'none', md: 'inline-flex' } }}
            >
              Log
            </Button>
          </>
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
          onWeighIn={() => openSheet('weigh-in')}
        />
      </Reveal>
      <Columns md={2} lg={3}>
        <Column span={2} mdSpan={1}>
          <Reveal delay={200}>
            <MealsSection day={day.data} meals={meals} favourites={favs} onAdd={(slot) => openSheet('meal', slot)} />
          </Reveal>
        </Column>
        <Column span={1}>
          <Box sx={{ display: 'grid', gap: 4 }}>
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
              <FavouritesManager favourites={favs} isLoading={favourites.isLoading} error={favourites.error} onRetry={() => void favourites.refetch()} />
            </Reveal>
          </Box>
        </Column>
      </Columns>
      <LogSheet open={sheet.open} kind={sheet.kind} date={date} slot={sheet.slot} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Box>
  )
}
