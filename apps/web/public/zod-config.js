// Owns: Zod's global settings, applied before any app module loads (a classic script in index.html runs before module
// chunks): jitless, so Zod never probes `new Function` to compile parsers. The Content-Security-Policy (_headers) has
// no 'unsafe-eval', and even the probe logs a violation. Zod 4 reads globalThis.__zod_globalConfig when it loads, and
// decides per schema when the schema is built, so this cannot wait for main.tsx (chunks evaluate before it).
globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true })
