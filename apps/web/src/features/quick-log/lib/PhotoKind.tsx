// Owns: the quick-log sheet's "Progress photo" kind — it hands over to the capture screen (/photos/new, the photos
// feature) and closes the sheet, so the camera gets the whole screen.
import Box from '@mui/material/Box'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { tokens } from '../../../theme'

export function PhotoKind({ onLeave }: { onLeave: () => void }) {
  const navigate = useNavigate()
  const left = useRef(false)
  useEffect(() => {
    // Once per mount (StrictMode replays effects; the ref survives the replay).
    if (left.current) return
    left.current = true
    onLeave()
    void navigate('/photos/new')
  }, [navigate, onLeave])
  return <Box sx={{ py: 4, textAlign: 'center', fontSize: tokens.font.size.small, color: 'text.secondary' }}>Opening the camera…</Box>
}
