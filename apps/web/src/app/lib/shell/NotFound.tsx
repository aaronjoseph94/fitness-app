// Owns: the in-shell page for an unknown path.
import Button from '@mui/material/Button'
import { Link } from 'react-router'
import { Panel } from '../../../components'

export function NotFound() {
  return (
    <Panel title="Page not found" description="This link does not match anything in the app.">
      <Button variant="outlined" component={Link} to="/">
        Go to Today
      </Button>
    </Panel>
  )
}
