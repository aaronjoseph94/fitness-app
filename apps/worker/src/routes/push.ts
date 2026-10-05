// Owns: the /api push route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { pushKey, sendTest, subscribe, unsubscribe } from '../modules/push'

export function mountPushRoutes(app: App): void {
  route(app, endpoints.push.key, (_, deps) => pushKey(deps))
  route(app, endpoints.push.subscribe, ({ body }, deps) => subscribe(deps, body))
  route(app, endpoints.push.unsubscribe, ({ body }, deps) => unsubscribe(deps, body.endpoint))
  route(app, endpoints.push.test, ({ body }, deps) => sendTest(deps, body.endpoint))
}
