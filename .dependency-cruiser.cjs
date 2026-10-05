// @ts-check
// Owns: deep-module enforcement (adapted from mattpocock/skills setup-ts-deep-modules, MIT).
//
// Each immediate child folder of a MODULE ROOT is a deep module. Its PUBLIC SURFACE is its ENTRY POINTS:
// the files directly in that folder (index.ts, plus any other root files it chooses to expose).
// Implementation lives in SUBFOLDERS (by convention `lib/`, tests in `tests/`) and is private.
// Across workspace packages, `package.json#exports` is the entry-point list.

/** Folders whose immediate children are modules. */
const MODULE_ROOTS = ['packages/shared/src', 'apps/worker/src/modules', 'apps/web/src/features']

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const rulesFor = (root) => {
  const R = esc(root)
  const INTERNALS = `^${R}/[^/]+/[^/]+/`
  return [
    {
      name: `entrypoint-boundary-from-outside:${root}`,
      comment: 'Code outside a module may import its entry points (root files), never anything inside its subfolders.',
      severity: 'error',
      from: { pathNot: `^${R}/` },
      to: { path: INTERNALS },
    },
    {
      name: `entrypoint-boundary-across-modules:${root}`,
      comment: "A module's own files import each other freely; other modules only through their entry points.",
      severity: 'error',
      from: { path: `^${R}/([^/]+)/`, pathNot: `^${R}/[^/]+/tests/` },
      to: { path: INTERNALS, pathNot: `^${R}/$1/` },
    },
    {
      name: `tests-folder-is-private:${root}`,
      comment: "A module's tests/ folder is reachable only from tests.",
      severity: 'error',
      from: { pathNot: `^${R}/[^/]+/tests/` },
      to: { path: `^${R}/[^/]+/tests/` },
    },
  ]
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...MODULE_ROOTS.flatMap(rulesFor),
    {
      name: 'no-circular',
      comment: 'No dependency cycles.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'web-never-imports-worker',
      comment: 'The web bundle must never pull in Worker code (secrets, DB). Share through @fitness/shared only.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/worker/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|\\.wrangler|drizzle)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'default'] },
  },
}
