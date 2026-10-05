// Owns: "today" for screens that stay open across midnight — the America/Edmonton local date, re-read every minute and
// whenever the app comes back into view (it may be a new day by then). Shared by Today, Log and Progress.
import { today } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'

export function useLocalToday(): LocalDate {
  const [date, setDate] = useState(() => today(Date.now()))
  useEffect(() => {
    const check = () => setDate(today(Date.now()))
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return date
}
