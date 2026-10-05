// Owns: the /api nutrition route group (thin: validate via the shared contract, call module entry points). Its writes
// queue meal_analysis / day_adjustment, whose handlers the meal-ai module registers when it loads.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import '../modules/meal-ai'
import {
  addMealPhoto,
  createFavourite,
  createFood,
  createMeal,
  deleteFavourite,
  deleteMeal,
  getMeal,
  listFavourites,
  listMeals,
  recentFoods,
  searchFoods,
  updateFavourite,
  updateMeal,
} from '../modules/nutrition'

export function mountNutritionRoutes(app: App): void {
  route(app, endpoints.nutrition.listMeals, ({ query }, deps) => listMeals(deps, query.date))
  route(app, endpoints.nutrition.getMeal, ({ params }, deps) => getMeal(deps, params.id))
  route(app, endpoints.nutrition.createMeal, ({ body }, deps) => createMeal(deps, body), { status: 201 })
  route(app, endpoints.nutrition.updateMeal, ({ params, body }, deps) => updateMeal(deps, params.id, body))
  route(app, endpoints.nutrition.deleteMeal, ({ params }, deps) => deleteMeal(deps, params.id))
  route(app, endpoints.nutrition.addMealPhoto, ({ params, query, body }, deps) => addMealPhoto(deps, params.id, query, body), {
    status: 201,
  })
  route(app, endpoints.nutrition.searchFoods, ({ query }, deps) => searchFoods(deps, query))
  route(app, endpoints.nutrition.recentFoods, ({ query }, deps) => recentFoods(deps, query))
  route(app, endpoints.nutrition.createFood, ({ body }, deps) => createFood(deps, body), { status: 201 })
  route(app, endpoints.nutrition.listFavourites, (_, deps) => listFavourites(deps))
  route(app, endpoints.nutrition.createFavourite, ({ body }, deps) => createFavourite(deps, body), { status: 201 })
  route(app, endpoints.nutrition.updateFavourite, ({ params, body }, deps) => updateFavourite(deps, params.id, body))
  route(app, endpoints.nutrition.deleteFavourite, ({ params }, deps) => deleteFavourite(deps, params.id))
}
