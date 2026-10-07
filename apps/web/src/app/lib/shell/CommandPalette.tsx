// Owns: the ⌘K / Ctrl-K command palette — one keyboard-first way to log something or jump anywhere. Every other
// affordance in this app is a phone one (a floating log button, a bottom bar, a slide-up sheet); this is the
// desktop-native path to the same actions, and the only place a keyboard can reach every screen without a mouse.
import SearchRounded from '@mui/icons-material/SearchRounded'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { sheetSurface, tokens } from '../../../theme'
import { useUiStore, type QuickLogKind } from '../../ui-store'
import { TABS } from '../tabs'

interface Command {
  label: string
  /** Shown beside the label, and searched, so two similar commands never read the same. */
  hint: string
  run: () => void
}

/** Everything the palette can do, in listing order when nothing is typed: log first, then go. */
function useCommands(close: () => void): Command[] {
  const navigate = useNavigate()
  const openQuickLog = useUiStore((s) => s.openQuickLog)

  return useMemo(() => {
    const log = (label: string, hint: string, kind: QuickLogKind): Command => ({
      label,
      hint,
      run: () => {
        close()
        openQuickLog(kind)
      },
    })
    const go = (label: string, hint: string, to: string): Command => ({
      label,
      hint,
      run: () => {
        close()
        void navigate(to)
      },
    })
    return [
      log('Log a weigh-in', 'This morning’s scale number', 'weigh-in'),
      log('Log a meal', 'Describe it, photograph it, barcode or search', 'meal'),
      log('Log water', 'Add a glass', 'water'),
      log('Start or stop a fast', 'Planned fasts too', 'fast'),
      log('Add a progress photo', 'Pose photos', 'photo'),
      ...TABS.map((t) => go(t.title, `Go to ${t.label}`, t.path)),
      go('Settings', 'Rails, daily targets, app', '/settings'),
      go('Model keys and the Claude connector', 'Provider keys and the MCP token', '/settings/ai'),
      go('Reminders', 'Notifications for the day', '/settings/reminders'),
      go('Export and restore', 'Everything in one zip', '/settings/data'),
      go('Plan history', 'Every plan version, revertible', '/plan'),
      go('Scans', 'Evolt 360 results', '/scans'),
      go('Progress photos', 'Library and compare', '/photos'),
      go('Import Apple Watch data', 'Steps, active energy and sleep', '/imports/health'),
      go('Exercise library', 'Search, filter and form videos', '/train/library'),
      go('Equipment', 'What your gym has, what to avoid', '/train/equipment'),
      go('Workout builder', 'Build a template, fill it with AI', '/train/builder'),
    ]
  }, [close, navigate, openQuickLog])
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const results = useRef<HTMLUListElement>(null)

  // Closing clears the query, so the palette always opens on the full list rather than the last search.
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [setOpen])
  const commands = useCommands(close)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      // The browser's own find is never what this shortcut means in a single-user app, so the default is suppressed.
      event.preventDefault()
      setOpen(!useUiStore.getState().paletteOpen)
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [setOpen])

  const matches = useMemo(() => {
    const wanted = query.trim().toLowerCase()
    if (!wanted) return commands
    return commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(wanted))
  }, [commands, query])

  // A fresh query restarts the highlight, so Enter always runs the top match.
  useEffect(() => setIndex(0), [query])

  // Arrow keys past the fold bring the highlighted row into view, the way a native menu behaves.
  useEffect(() => {
    results.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index, open, matches])

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' }, '& .MuiPaper-root': { mt: { md: 10 } } }}
      slotProps={{
        paper: {
          // The paper carries role="dialog", so its name goes here (on the Dialog root it names nothing).
          'aria-label': 'Commands',
          'data-testid': 'command-palette',
          // The thicker material, so the palette reads as a surface floating over a dimmed page rather than a card
          // that happens to sit on top of it (the dialog's MUI backdrop is the scrim).
          sx: { ...sheetSurface, borderRadius: `${tokens.radius.card}px` },
        } as object,
      }}
    >
      <Box sx={{ px: 3, pt: 3 }}>
        <TextField
          autoFocus
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Log something or go somewhere…"
          aria-label="Search commands"
          data-testid="palette-input"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded />
                </InputAdornment>
              ),
            },
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (matches.length) setIndex((i) => Math.min(i + 1, matches.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              matches[index]?.run()
            }
          }}
        />
      </Box>
      <List ref={results} dense data-testid="palette-results" sx={{ maxHeight: 420, overflowY: 'auto', py: 2, mt: 2 }}>
        {matches.map((command, i) => (
          <ListItemButton
            key={command.label}
            data-index={i}
            selected={i === index}
            // The pointer and the keyboard share one highlight, so moving the mouse never leaves two rows lit.
            onMouseEnter={() => setIndex(i)}
            onClick={command.run}
            sx={{ minHeight: tokens.tapTarget }}
          >
            <ListItemText
              primary={command.label}
              secondary={command.hint}
              slotProps={{
                primary: { sx: { fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label } },
                secondary: { sx: { fontSize: tokens.font.size.label } },
              }}
            />
          </ListItemButton>
        ))}
        {matches.length === 0 && (
          <ListItemButton disabled data-index={0} sx={{ minHeight: tokens.tapTarget }}>
            <ListItemText primary={`Nothing matches “${query.trim()}”.`} />
          </ListItemButton>
        )}
      </List>
    </Dialog>
  )
}
