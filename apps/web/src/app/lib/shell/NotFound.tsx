// Owns: the in-shell page for an unknown path — a sky header ("Error 404" eyebrow, the climb's "Off the trail") and one
// card naming what happened ("Page not found") with the way back to Today.
import Button from '@mui/material/Button'
import { Link } from 'react-router'
import { PageHeader, Panel } from '../../../components'
import { copy } from '../../../copy'

export function NotFound() {
  return (
    <>
      <PageHeader eyebrow="Error 404" title={copy.lostTitle} pageName="Page not found" />
      <Panel title="Page not found" description="This link does not match anything in the app.">
        <Button variant="outlined" component={Link} to="/">
          Go to Today
        </Button>
      </Panel>
    </>
  )
}
