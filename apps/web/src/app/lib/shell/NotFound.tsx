// Owns: the in-shell page for an unknown path.
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'

export function NotFound() {
  return (
    <Card component="section">
      <CardContent>
        <Typography variant="sectionTitle" component="h2">
          Page not found
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, mb: 4 }}>
          This link does not match anything in the app.
        </Typography>
        <Button variant="outlined" component={Link} to="/">
          Go to Today
        </Button>
      </CardContent>
    </Card>
  )
}
