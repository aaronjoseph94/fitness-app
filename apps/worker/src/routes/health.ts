// Owns: the /api health route group (thin: validate via the shared contract, call module entry points).
import type { App } from '../env'

export function mountHealthRoutes(_app: App): void {}
