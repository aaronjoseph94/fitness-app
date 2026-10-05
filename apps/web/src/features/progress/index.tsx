// Owns: the Progress tab (SPEC §11 chart inventory). Placeholder until the progress work package replaces it; it already
// uses the wide route width, two columns from the md breakpoint (900 px).
import Grid from '@mui/material/Grid'
import { PhasePlaceholder } from '../../app/placeholder'

export function ProgressPage() {
  return (
    <Grid container spacing={4}>
      <Grid size={{ xs: 12, md: 6 }}>
        <PhasePlaceholder title="Weight and body" phase={1}>
          Weight trend with forecast, weekly loss vs expected, waist and body composition across scans.
        </PhasePlaceholder>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <PhasePlaceholder title="Habits" phase={1}>
          Calories and macros vs target, water, steps, sleep, fasting and adherence.
        </PhasePlaceholder>
      </Grid>
    </Grid>
  )
}
