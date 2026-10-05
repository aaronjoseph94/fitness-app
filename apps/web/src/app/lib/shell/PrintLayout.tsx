// Owns: the chrome-free print frame for report pages (SPEC §11 print) — a white page, Letter-width on screen with the
// app's 16 px gutter, Letter with 15 mm margins on paper (the @page margin only, so screens never carry it). The report
// page itself owns its sections, page breaks and header/footer.
import Box from '@mui/material/Box'
import GlobalStyles from '@mui/material/GlobalStyles'
import { Outlet, ScrollRestoration } from 'react-router'
import { tokens } from '../../../theme'

const PAGE_MARGIN = '15mm'
const LETTER_WIDTH = '8.5in'

export function PrintLayout() {
  return (
    <Box sx={{ bgcolor: 'background.paper', minHeight: '100dvh', '@media print': { minHeight: 'auto' } }}>
      <GlobalStyles
        styles={{
          '@page': { size: 'Letter', margin: PAGE_MARGIN },
          '@media print': { body: { backgroundColor: tokens.ink.card } },
        }}
      />
      <Box
        component="main"
        sx={{ maxWidth: LETTER_WIDTH, mx: 'auto', p: 4, '@media print': { maxWidth: 'none', p: 0 } }}
      >
        <Outlet />
      </Box>
      <ScrollRestoration />
    </Box>
  )
}
