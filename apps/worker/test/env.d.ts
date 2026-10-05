// Owns: typing the test env from 'cloudflare:workers' as the Worker Env plus test-only bindings.
import type { D1Migration } from 'cloudflare:test'
import type { Env as WorkerEnv } from '../src/env'

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
export {}
