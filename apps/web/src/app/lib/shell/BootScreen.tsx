// Owns: what shows while the first lazy page loads — the bare page background, so launch never flashes a spinner.
import Box from '@mui/material/Box'

export function BootScreen() {
  return <Box aria-busy="true" sx={{ minHeight: '100dvh', bgcolor: 'background.default' }} />
}
