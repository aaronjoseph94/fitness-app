// Owns: the controls section of the styleguide — buttons, chips (incl. the water quick-add chips), inputs
// (native date/time fields per CLAUDE.md), a switch and a segmented range toggle, all in the MUI theme.
import AddRounded from '@mui/icons-material/AddRounded'
import MonitorWeightOutlined from '@mui/icons-material/MonitorWeightOutlined'
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import WaterDropOutlined from '@mui/icons-material/WaterDropOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { Grid, Panel, Section } from './layout'

export function ControlsSection() {
  const [range, setRange] = useState('28d')
  const [water, setWater] = useState<number | null>(500)
  const [breakfast, setBreakfast] = useState(false)
  return (
    <Section id="controls" title="Controls" subtitle="Every control is at least 44 px tall.">
      <Grid min={320}>
        <Panel title="Buttons">
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Button variant="contained" startIcon={<MonitorWeightOutlined />}>
              Log weigh-in
            </Button>
            <Button variant="outlined" startIcon={<AddRounded />}>
              Add meal
            </Button>
            <Button variant="text">Cancel</Button>
            <Button variant="contained" disabled>
              Saving…
            </Button>
            <IconButton aria-label="More">
              <MoreHorizRounded />
            </IconButton>
          </Box>
          <Box sx={{ mt: 3 }}>
            <Button variant="contained" fullWidth size="large">
              Confirm meal · 642 kcal
            </Button>
          </Box>
        </Panel>

        <Panel title="Chips">
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {[250, 500, 750].map((ml) => (
              <Chip
                key={ml}
                icon={<WaterDropOutlined sx={{ fontSize: tokens.font.size.cardTitle }} />}
                label={`${ml} ml`}
                variant={water === ml ? 'filled' : 'outlined'}
                color={water === ml ? 'secondary' : 'default'}
                onClick={() => setWater(water === ml ? null : ml)}
                sx={{ height: tokens.tapTarget, borderRadius: tokens.radius.chip, px: 1 }}
              />
            ))}
            <Chip
              label="Custom"
              variant="outlined"
              onClick={() => setWater(null)}
              sx={{ height: tokens.tapTarget, px: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 3 }}>
            <Chip label="Machines" size="small" />
            <Chip label="Free weights" size="small" />
            <Chip label="Estimated" size="small" variant="outlined" />
            <Chip
              label="Fast day"
              size="small"
              sx={{ bgcolor: tokens.metric.fasting, color: tokens.ink.card }}
            />
          </Box>
        </Panel>

        <Panel title="Inputs">
          <Box sx={{ display: 'grid', gap: 3 }}>
            <TextField
              label="Weight"
              type="number"
              defaultValue="91.4"
              slotProps={{
                htmlInput: { inputMode: 'decimal', step: 0.1 },
                input: { endAdornment: <InputAdornment position="end">kg</InputAdornment> },
              }}
            />
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: '1fr 1fr' }}>
              <TextField
                label="Date"
                type="date"
                defaultValue="2026-10-04"
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Time"
                type="time"
                defaultValue="07:00"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <TextField
              label="What did you eat?"
              placeholder="2 eggs, toast with butter, black coffee"
              multiline
              minRows={2}
            />
          </Box>
        </Panel>

        <Panel title="Toggles">
          <ToggleButtonGroup
            value={range}
            exclusive
            onChange={(_, v: string | null) => v && setRange(v)}
            aria-label="Range"
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                minHeight: tokens.tapTarget,
                textTransform: 'none',
                fontWeight: tokens.font.weight.label,
              },
            }}
          >
            {['7d', '28d', '90d', 'All'].map((r) => (
              <ToggleButton key={r} value={r}>
                {r}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormControlLabel
            sx={{ mt: 3, minHeight: tokens.tapTarget }}
            control={<Switch checked={breakfast} onChange={(e) => setBreakfast(e.target.checked)} />}
            label="Show breakfast slot"
          />
        </Panel>
      </Grid>
    </Section>
  )
}
