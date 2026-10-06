// Owns: the /api settings route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { clearSecret, listSecrets, setSecret } from '../modules/secrets'
import { getMcpConnection, getSettings, updateSettings } from '../modules/settings'

export function mountSettingsRoutes(app: App): void {
  route(app, endpoints.settings.get, (_, deps) => getSettings(deps))
  route(app, endpoints.settings.update, ({ body }, deps) => updateSettings(deps, body))
  route(app, endpoints.settings.secrets, (_, deps) => listSecrets(deps))
  route(app, endpoints.settings.setSecret, ({ params, body }, deps) => setSecret(deps, params.name, body.value))
  route(app, endpoints.settings.clearSecret, ({ params }, deps) => clearSecret(deps, params.name))
  // Claude must reach the Worker at the origin the request arrived on (Access and the OAuth metadata are per origin).
  route(app, endpoints.settings.connection, (_input, deps, c) => getMcpConnection(deps, new URL(c.req.url).origin))
}
