// Owns: the /api settings route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { getSettings, updateSettings } from '../modules/settings'

export function mountSettingsRoutes(app: App): void {
  route(app, endpoints.settings.get, (_, deps) => getSettings(deps))
  route(app, endpoints.settings.update, ({ body }, deps) => updateSettings(deps, body))
}
