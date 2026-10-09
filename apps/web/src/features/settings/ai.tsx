// Owns: the AI settings page (2a kit) — the paid models (Claude, ChatGPT, Gemini Pro: a set key puts that model first),
// the free provider keys the AI falls back on, and how Claude connects. A key lives in the Worker (never in the web
// bundle) and comes back as status only, so this screen shows whether one is set, where it came from and its last four
// characters, never the value. Reads GET /api/settings/secrets and GET /api/settings/connection; every edit is one PUT
// or DELETE /api/settings/secrets/:name. Needs a connection.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import type { SecretName } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, signInAgain } from '../../api'
import { PageHeader, Panel } from '../../components'
import { useOnline } from '../../offline'
import { tokens } from '../../theme'
import { formatDateTime } from '../quick-log'
import { copyText } from './lib/copy'
import { CopyRow, ReadOnlyRow, SettingsGroup, ValueRow } from './lib/rows'
import { SecretDialog } from './lib/SecretDialog'
import { isConfigured, MODEL_SECRET_NAMES, PAID_SECRET_NAMES, SECRET_FIELDS, sourceLabel } from './lib/secrets'
import { useConnection, useSecretMutations, useSecrets } from './lib/useSecrets'

const saveError = (error: unknown) => problemText(error, 'Setting a key needs a connection.')

/** A card's numbered or bulleted note: 13 px body copy on the card's 20 px gutter, the markers hanging inside it. */
const listSx = {
  m: 0,
  pt: 0,
  pb: `${tokens.pad.card.y}px`,
  pl: `${tokens.pad.card.x + 18}px`,
  pr: `${tokens.pad.card.x}px`,
  fontSize: tokens.font.size.small,
  lineHeight: tokens.font.leading.emphasis,
  color: tokens.ink.label,
} as const

export function AiSettingsPage() {
  const secrets = useSecrets()
  const connection = useConnection()
  const update = useSecretMutations()
  const online = useOnline()
  const [editing, setEditing] = useState<SecretName | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** A value just saved, kept on screen until it is hidden: the API will never return it again. */
  const [revealed, setRevealed] = useState<{ name: SecretName; value: string } | null>(null)
  /** What "Copy" last put on the clipboard, so the button can say so. */
  const [copied, setCopied] = useState<string | null>(null)

  const header = (
    <PageHeader
      title="AI and Claude"
      subtitle="The keys the AI runs on and how Claude connects. A key stays in the Worker; this page only shows whether it is set."
    />
  )

  // A read paused offline without data is not loading: it falls through to the offline message.
  if (secrets.isPending && secrets.fetchStatus !== 'paused')
    return (
      <Stack spacing={6} aria-busy="true">
        {header}
        {[0, 1].map((i) => (
          <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        ))}
      </Stack>
    )
  if (!secrets.data) {
    // 2a: offline is the calm info banner, a failed read the warning banner (as QueryStateCard draws them).
    const offline = secrets.fetchStatus === 'paused' || secrets.error?.kind === 'network'
    return (
      <Stack spacing={6}>
        {header}
        <Alert
          severity={offline ? 'info' : 'warning'}
          data-testid="ai-settings-error"
          action={
            secrets.error?.kind === 'auth-expired' ? (
              <Button color="inherit" onClick={signInAgain}>
                Sign in again
              </Button>
            ) : (
              <Button color="inherit" onClick={() => void secrets.refetch()}>
                Try again
              </Button>
            )
          }
        >
          {offline ? 'You’re offline and the key list hasn’t been loaded on this device yet.' : `Couldn't load the key list. ${problemText(secrets.error)}`}
        </Alert>
      </Stack>
    )
  }

  const statuses = new Map(secrets.data.secrets.map((s) => [s.name, s]))
  const modelKeysSet = [...PAID_SECRET_NAMES, ...MODEL_SECRET_NAMES].filter((name) => isConfigured(statuses.get(name)))
  const locked = !online || update.saving
  const mcpUrl = connection.data?.mcp_url ?? ''

  const copy = async (key: string, text: string) => {
    const ok = await copyText(text)
    setCopied(ok ? key : null)
    setNotice(ok ? 'Copied.' : 'Copying was blocked — select the text and copy it by hand.')
  }

  const save = async (name: SecretName, value: string) => {
    setError(null)
    try {
      await update.save(name, value)
      setEditing(null)
      setRevealed({ name, value })
      setNotice(`${SECRET_FIELDS[name].label} saved.`)
    } catch (e) {
      setError(saveError(e))
    }
  }

  const remove = async (name: SecretName) => {
    setError(null)
    try {
      await update.remove(name)
      setEditing(null)
      setRevealed(null)
      setNotice(`${SECRET_FIELDS[name].label} removed.`)
    } catch (e) {
      setError(saveError(e))
    }
  }

  const secretRow = (name: SecretName) => {
    const field = SECRET_FIELDS[name]
    const status = statuses.get(name)
    return (
      <ValueRow
        key={name}
        label={field.label}
        help={field.help}
        value={status ? sourceLabel(status) : 'Not set'}
        onClick={() => {
          setError(null)
          setEditing(name)
        }}
        disabled={locked}
        testId={`secret-${name}`}
      />
    )
  }

  return (
    <Stack spacing={6} data-testid="ai-settings-page" sx={{ pb: { xs: 4, md: 0 } }}>
      {header}
      {!online && (
        <Alert severity="info" data-testid="ai-settings-offline">
          You’re offline. These are the last known key states; setting a key needs a connection.
        </Alert>
      )}
      {modelKeysSet.length === 0 && (
        <Alert severity="warning" data-testid="ai-not-set-up">
          No model key is set, so the AI paths are off: logged meals wait for you to itemise them and weekly reviews come
          from the engine alone. Add the OpenRouter key, or a paid one, to turn them back on.
        </Alert>
      )}

      {revealed && (
        <Panel
          id="secret-revealed"
          title={`${SECRET_FIELDS[revealed.name].label} saved`}
          description="Copy it now if you need it elsewhere. Keys are write-only: this screen never shows the value again."
          actions={
            <Button variant="outlined" size="small" onClick={() => setRevealed(null)}>
              Hide
            </Button>
          }
          padding="none"
          testId="secret-revealed"
        >
          <CopyRow
            label="Value"
            value={revealed.value}
            copied={copied === 'revealed'}
            onCopy={() => void copy('revealed', revealed.value)}
            testId="revealed-copy"
          />
        </Panel>
      )}

      <SettingsGroup
        id="paid"
        title="Paid models"
        subtitle="Pay as you go, tried top to bottom before the free tiers. Set a key and its model answers first; remove it and the free models take over. At most 200 paid requests a day per provider (prices are per million tokens — roughly words)."
      >
        {PAID_SECRET_NAMES.map(secretRow)}
      </SettingsGroup>

      <SettingsGroup
        id="models"
        title="Models"
        subtitle="Free tiers, tried top to bottom after any paid model; one key is enough."
      >
        {MODEL_SECRET_NAMES.map(secretRow)}
      </SettingsGroup>

      <SettingsGroup
        id="claude"
        title="Claude"
        subtitle="The senior coach, through a connector in your own Claude chats."
      >
        {connection.data ? (
          <>
            <CopyRow
              label="Connector URL"
              help="The address to paste into Claude's custom connector field. It must be the public HTTPS origin — Claude connects from Anthropic's cloud, not from this phone."
              value={mcpUrl}
              copied={copied === 'mcp_url'}
              onCopy={() => void copy('mcp_url', mcpUrl)}
              testId="copy-mcp-url"
            />
            {secretRow('MCP_BEARER_TOKEN')}
            <ReadOnlyRow
              label="Last change from Claude"
              help="Every write Claude makes is versioned and revertible."
              value={connection.data.last_write_at ? formatDateTime(connection.data.last_write_at) : 'Never yet'}
            />
          </>
        ) : (
          <ReadOnlyRow label="Connector" value={connection.isPending ? 'Loading…' : `Couldn't load. ${problemText(connection.error)}`} />
        )}
      </SettingsGroup>

      <SettingsGroup id="connector-how" title="Adding the connector to Claude">
        <Box component="ol" sx={listSx}>
          <li>In Claude, open Settings → Connectors → Add custom connector.</li>
          <li>Paste the connector URL above.</li>
          <li>
            When Claude asks you to sign in, approve the consent page (it is behind your Cloudflare login). If your client
            asks for a token header instead, generate one in the row above and paste it there.
          </li>
          <li>
            Then ask Claude to “run my coach review”. It follows the coach procedure the server ships, reads the same
            numbers the app computes, and every change it applies is a plan version you can revert in one tap.
          </li>
        </Box>
      </SettingsGroup>

      <SettingsGroup id="key-storage" title="Where these keys live">
        <Box component="ul" sx={listSx}>
          <li>
            In this app’s own Cloudflare D1 database, written only through your signed-in session. They never enter the web
            bundle or the offline cache, and the API only ever returns whether a key is set, where it came from and its
            last four characters.
          </li>
          <li>
            A key set here wins over a Worker secret of the same name. Clear it here and a <code>wrangler secret put</code>{' '}
            value takes over again.
          </li>
          <li>Every change is recorded as one event carrying the key’s name and the action, never the value.</li>
        </Box>
      </SettingsGroup>

      {editing && (
        <SecretDialog
          key={editing}
          field={SECRET_FIELDS[editing]}
          status={statuses.get(editing) ?? { name: editing, source: 'none', hint: null, env_set: false, updated_at: null }}
          saving={update.saving}
          error={error}
          onSave={(value) => void save(editing, value)}
          onRemove={() => void remove(editing)}
          onClose={() => {
            setEditing(null)
            setError(null)
          }}
        />
      )}

      <Snackbar open={notice !== null} autoHideDuration={3000} onClose={() => setNotice(null)} message={notice} />
    </Stack>
  )
}
