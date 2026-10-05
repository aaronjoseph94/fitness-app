// Owns: making drizzle-kit's SQLite migrations safe for D1. Runs after every `drizzle-kit generate` (pnpm db:generate).
//
// 1. PRAGMA foreign_keys=OFF/ON → PRAGMA defer_foreign_keys=on/off (D1 ignores foreign_keys inside its implicit transaction).
// 2. A comment-only custom migration named *_v_day.sql is filled from src/db/v_day.sql (the single source of the view).
//    To change the view: edit src/db/v_day.sql, then `drizzle-kit generate --custom --name v_day && tsx scripts/postprocess-migrations.ts`.
// 3. A table rebuild ("__new_") makes SQLite re-parse views and fail on v_day, so the migration is wrapped with
//    DROP VIEW v_day … <current v_day.sql>, and a loud warning asks for hand review.
// 4. Fails if any .sql migration has no statements, or if the newest v_day migration differs from src/db/v_day.sql.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const MIGRATIONS = path.join(ROOT, 'drizzle')
const VIEW_SQL = path.join(ROOT, 'src', 'db', 'v_day.sql')
const BREAK = '--> statement-breakpoint'
const VIEW_MARKER = '-- postprocess: v_day re-created after table rebuild'

/** SQL with `--` comments and whitespace removed; empty means the file has no statements. */
const statementsOf = (sqlText: string) =>
  sqlText
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .join('\n')

const viewSql = readFileSync(VIEW_SQL, 'utf8').trimEnd() + '\n'
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const errors: string[] = []
const warnings: string[] = []

for (const file of files) {
  const full = path.join(MIGRATIONS, file)
  const original = readFileSync(full, 'utf8')
  let text = original

  // 1. D1-safe foreign key handling for table rebuilds.
  text = text.replace(/PRAGMA\s+foreign_keys\s*=\s*OFF;/gi, 'PRAGMA defer_foreign_keys=on;')
  text = text.replace(/PRAGMA\s+foreign_keys\s*=\s*ON;/gi, 'PRAGMA defer_foreign_keys=off;')

  // 2. Fill an empty v_day custom migration from the source file.
  if (file.endsWith('_v_day.sql') && statementsOf(text) === '') text = viewSql

  // 3. Table rebuilds: drop the view first, re-create it last.
  if (statementsOf(text).includes('__new_')) {
    if (!text.includes(VIEW_MARKER)) {
      text = `DROP VIEW IF EXISTS \`v_day\`;\n${BREAK}\n${text.trimEnd()}\n${BREAK}\n${VIEW_MARKER}\n${viewSql}`
    }
    warnings.push(
      `${file} rebuilds a table ("__new_"). It now drops and re-creates v_day. REVIEW IT BY HAND: data copy, defaults, foreign keys.`,
    )
  }

  if (statementsOf(text) === '')
    errors.push(`${file} has no SQL statements (a comment-only custom migration?).`)
  if (text !== original) {
    writeFileSync(full, text)
    console.log(`postprocess: rewrote ${file}`)
  }
}

// 4. The newest v_day migration must match the source file, or the deployed view is not the one in the repo.
const viewMigrations = files.filter((f) => f.endsWith('_v_day.sql'))
const latestView = viewMigrations.at(-1)
if (!latestView) {
  errors.push(
    'No *_v_day.sql migration found. Run: drizzle-kit generate --custom --name v_day && tsx scripts/postprocess-migrations.ts',
  )
} else if (readFileSync(path.join(MIGRATIONS, latestView), 'utf8') !== viewSql) {
  errors.push(
    `src/db/v_day.sql changed since ${latestView}. Run: drizzle-kit generate --custom --name v_day && tsx scripts/postprocess-migrations.ts`,
  )
}

for (const w of warnings) console.warn(`\n!!! WARNING: ${w}\n`)
if (errors.length > 0) {
  for (const e of errors) console.error(`postprocess: ERROR ${e}`)
  process.exit(1)
}
console.log(`postprocess: ${files.length} migration(s) OK`)
