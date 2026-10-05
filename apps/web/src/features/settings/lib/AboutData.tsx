// Owns: the "About this data" section — where each kind of data is kept (D1, R2, this phone's queue and cache), who
// can read it (Access, the AI, the Coach) and what never leaves (photos to any AI), in plain words.
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { SectionHeader } from '../../../components'
import { useOnline, usePendingWrites } from '../../../offline'
import { tokens } from '../../../theme'

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="li" sx={{ py: 3, '&:not(:last-child)': { borderBottom: `1px solid ${tokens.ink.border}` } }}>
      <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.heading }}>{title}</Box>
      <Box sx={{ mt: 0.5, fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.55 }}>{children}</Box>
    </Box>
  )
}

export function AboutData({ timezone }: { timezone: string }) {
  const pending = usePendingWrites().length
  const online = useOnline()
  return (
    <Box component="section" aria-labelledby="about-title" data-testid="settings-about">
      <SectionHeader id="about" title="About this data" subtitle="Yours alone: one person, one app." />
      <Card sx={{ px: 4, py: 1 }}>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          <Item title="Your logs">
            Weigh-ins, meals, water, fasts, sleep, steps, plans and AI events live in one Cloudflare D1 database. Every request
            passes Cloudflare Access, so only you can sign in.
          </Item>
          <Item title="Photos, scan sheets and reports">
            Kept in a private Cloudflare R2 bucket and opened only through short-lived signed links.
          </Item>
          <Item title="On this phone">
            Logs made offline wait in a queue in the browser’s storage (IndexedDB) and sync in order when you’re back online
            {pending > 0 ? ` (${pending} waiting now${online ? '' : ', offline'})` : ' (nothing waiting now)'}. Recent screens
            are cached so the app opens without a connection.
          </Item>
          <Item title="The AI">
            Free-tier models read your logs to suggest changes inside the rails. They never see your name, photos of you or
            photo metadata. Progress photos never go to any AI.
          </Item>
          <Item title="The Coach">
            Claude reaches the same data only through the connector you add in your own Claude chats, and works inside the
            same rails. Every change it makes is a plan version you can revert.
          </Item>
          <Item title="Times and units">
            Instants are stored in UTC and shown for {timezone}; dates read 2026-10-05. Units are kg, cm, ml, kcal and g.
          </Item>
          <Item title="Export">
            Export and restore (under More) zips every table and your photos on this phone; the server also keeps a
            per-table JSON backup each month.
          </Item>
        </Box>
      </Card>
    </Box>
  )
}
