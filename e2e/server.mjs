// Owns: the Playwright webServer command — the run's global setup for data, then the Worker. It makes sure
// apps/worker/.dev.vars exists (copied from .dev.vars.example: DEV_AUTH_BYPASS=1, the dev MCP token, no LLM keys),
// builds the web app, wipes the isolated persist dir (apps/worker/.wrangler/e2e), applies the D1 migrations and the
// seed into it, then runs `wrangler dev` on 127.0.0.1:8799 until Playwright stops it.
// The reset lives here, not in a Playwright globalSetup, because Playwright starts the webServer before globalSetup;
// with reuseExistingServer (local runs) a server you already started keeps its data and this script never runs.
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const WORKER = path.join(ROOT, 'apps', 'worker')
const PORT = 8799
const PERSIST = '.wrangler/e2e'

function run(cmd, args, cwd = ROOT) {
  console.log(`[e2e] ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } })
  if (result.status !== 0) {
    console.error(`[e2e] failed: ${cmd} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(path.join(WORKER, '.dev.vars'))) {
  copyFileSync(path.join(WORKER, '.dev.vars.example'), path.join(WORKER, '.dev.vars'))
  console.log('[e2e] created apps/worker/.dev.vars from .dev.vars.example')
}

if (process.env.E2E_SKIP_BUILD !== '1') run('pnpm', ['--filter', '@fitness/web', 'build'])

rmSync(path.join(WORKER, PERSIST), { recursive: true, force: true })
run(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', PERSIST],
  WORKER,
)
run('pnpm', ['exec', 'tsx', 'scripts/build-seed.ts'], WORKER)
run(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--persist-to',
    PERSIST,
    '--file',
    'seed.generated.sql',
  ],
  WORKER,
)

const dev = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--port',
    String(PORT),
    '--ip',
    '127.0.0.1',
    '--persist-to',
    PERSIST,
    '--show-interactive-dev-session=false',
    // Reports and PDFs build links from APP_ORIGIN; point it at this server.
    '--var',
    `APP_ORIGIN:http://127.0.0.1:${PORT}`,
  ],
  { cwd: WORKER, stdio: 'inherit' },
)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => dev.kill(signal))
dev.on('exit', (code) => process.exit(code ?? 0))
