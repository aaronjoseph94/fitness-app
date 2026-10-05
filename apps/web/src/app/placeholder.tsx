// Owns: the temporary body of a page whose feature arrives in a later phase. Delete it once every feature has landed.
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

interface PhasePlaceholderProps {
  title: string
  /** SPEC §12 build phase that delivers this page. */
  phase: number
  /** One line on what the page will hold. */
  children: ReactNode
}

export function PhasePlaceholder({ title, phase, children }: PhasePlaceholderProps) {
  return (
    <Card component="section" data-testid="phase-placeholder">
      <CardContent>
        <Typography variant="sectionTitle" component="h2">
          {title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {children}
        </Typography>
        <Chip size="small" variant="outlined" label={`Arrives in phase ${phase}`} sx={{ mt: 4, color: 'text.secondary', borderColor: 'divider' }} />
      </CardContent>
    </Card>
  )
}
