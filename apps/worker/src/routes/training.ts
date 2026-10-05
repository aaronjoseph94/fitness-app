// Owns: the /api training route group (thin: validate via the shared contract, call the training module's entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import {
  createExclusion,
  createExercise,
  createTemplate,
  deleteSet,
  deleteTemplate,
  exerciseHistory,
  finishSession,
  getEquipment,
  getExercise,
  getSession,
  getTemplate,
  listExercises,
  listSessions,
  listTemplates,
  logSet,
  startSession,
  updateEquipment,
  updateSet,
  updateTemplate,
} from '../modules/training'

export function mountTrainingRoutes(app: App): void {
  const t = endpoints.training
  route(app, t.listExercises, ({ query }, deps) => listExercises(deps, query))
  route(app, t.getExercise, ({ params }, deps) => getExercise(deps, params.id))
  route(app, t.createExercise, ({ body }, deps) => createExercise(deps, body), { status: 201 })
  route(app, t.getEquipment, (_, deps) => getEquipment(deps))
  route(app, t.updateEquipment, ({ body }, deps) => updateEquipment(deps, body))
  route(app, t.createExclusion, ({ body }, deps) => createExclusion(deps, body), { status: 201 })
  route(app, t.listTemplates, (_, deps) => listTemplates(deps))
  route(app, t.getTemplate, ({ params }, deps) => getTemplate(deps, params.id))
  route(app, t.createTemplate, ({ body }, deps) => createTemplate(deps, body), { status: 201 })
  route(app, t.updateTemplate, ({ params, body }, deps) => updateTemplate(deps, params.id, body))
  route(app, t.deleteTemplate, ({ params }, deps) => deleteTemplate(deps, params.id))
  route(app, t.listSessions, ({ query }, deps) => listSessions(deps, query))
  route(app, t.startSession, ({ body }, deps) => startSession(deps, body), { status: 201 })
  route(app, t.getSession, ({ params }, deps) => getSession(deps, params.id))
  route(app, t.logSet, ({ params, body }, deps) => logSet(deps, params.id, body), { status: 201 })
  route(app, t.updateSet, ({ params, body }, deps) => updateSet(deps, params.id, body))
  route(app, t.deleteSet, ({ params }, deps) => deleteSet(deps, params.id))
  route(app, t.finishSession, ({ params, body }, deps) => finishSession(deps, params.id, body))
  route(app, t.exerciseHistory, ({ params }, deps) => exerciseHistory(deps, params.id))
}
