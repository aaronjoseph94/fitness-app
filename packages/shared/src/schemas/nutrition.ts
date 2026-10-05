// Owns: foods (the nutrition cache), favourites (food or recipe), meals with their items and photos, and the
// create/patch bodies for every input method (text, voice, photo, barcode, manual items, favourite).
// Wire names follow SPEC spelling ("favorite"); schema names follow GLOSSARY ("Favourite").
import * as z from 'zod'
import { Count, Fraction, Grams, Id, Instant, Kcal, LocalDate, MealSlot, QueryInt, Row } from './common'
import { FileUrl, ImageType } from './files'

/** Energy and macros of a portion, a day's intake or a day's targets. */
export const Nutrients = z.object({ kcal: Kcal, protein_g: Grams, carbs_g: Grams, fat_g: Grams, fibre_g: Grams })
export type Nutrients = z.infer<typeof Nutrients>

/** What is left of a day's targets (target − intake); negative when over. */
export const Remaining = z.object({ kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() })
export type Remaining = z.infer<typeof Remaining>

// ── Foods ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Open Food Facts, Canadian Nutrient File, USDA FoodData Central, an LLM estimate, or Aaron. */
export const FoodSource = z.enum(['off', 'cnf', 'usda', 'llm', 'user'])
export type FoodSource = z.infer<typeof FoodSource>

/** EAN-8, UPC-A, EAN-13 or GTIN-14 digits. */
export const Barcode = z.string().regex(/^\d{8,14}$/)

/** A cached nutrition record. Nutrient fields are per 100 g. */
export const Food = Row.extend({
  source: FoodSource,
  source_id: z.string().nullable(),
  barcode: Barcode.nullable(),
  name: z.string().min(1),
  brand: z.string().nullable(),
  serving_g: Grams.nullable(),
  kcal_per_100g: Kcal,
  protein_g: Grams,
  carbs_g: Grams,
  fat_g: Grams,
  fibre_g: Grams.nullable(),
  sugar_g: Grams.nullable(),
  sodium_mg: z.number().nonnegative().nullable(),
})
export type Food = z.infer<typeof Food>

/** Body of POST /api/foods — a food Aaron enters himself (source "user"). Nutrients per 100 g. */
export const FoodCreate = z.object({
  id: Id,
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).optional(),
  barcode: Barcode.optional(),
  serving_g: Grams.positive().optional(),
  kcal_per_100g: Kcal,
  protein_g: Grams,
  carbs_g: Grams,
  fat_g: Grams,
  fibre_g: Grams.optional(),
  sugar_g: Grams.optional(),
  sodium_mg: z.number().nonnegative().optional(),
})
export type FoodCreate = z.infer<typeof FoodCreate>

/** One food from recent meals (GET /api/foods/recent): how often it was eaten, and the grams and nutrition last used. */
export const RecentFood = z.object({
  food: Food,
  uses: Count,
  grams: Grams.positive(),
  /** Nutrients of `grams`. */
  nutrients: Nutrients,
  last_used_at: Instant,
})
export type RecentFood = z.infer<typeof RecentFood>

/** Query of GET /api/foods/recent: foods from confirmed meals of the last `days` days (default 30), most used first. */
export const RecentFoodsQuery = z.object({
  days: QueryInt.pipe(z.number().int().min(1).max(90)).optional(),
  limit: QueryInt.pipe(z.number().int().min(1).max(50)).optional(),
})
export type RecentFoodsQuery = z.infer<typeof RecentFoodsQuery>

/** Query of GET /api/foods/search: text, a scanned barcode, or both. */
export const FoodSearchQuery = z
  .object({ q: z.string().trim().min(2).max(200).optional(), barcode: Barcode.optional() })
  .refine((s) => s.q !== undefined || s.barcode !== undefined, { message: 'Give q or barcode' })
export type FoodSearchQuery = z.infer<typeof FoodSearchQuery>

// ── Favourites ─────────────────────────────────────────────────────────────────────────────────────────────────

/** One food of a recipe favourite. */
export const RecipeItem = z.object({ food_id: Id, grams: Grams.positive() })
export type RecipeItem = z.infer<typeof RecipeItem>

/** One food of a favourite as the list shows it: the food's name ("Name (Brand)"), grams and their kcal. */
export const FavouriteItem = z.object({ food_id: Id, name: z.string(), grams: Grams, kcal: Kcal })
export type FavouriteItem = z.infer<typeof FavouriteItem>

const FavouriteFields = Row.extend({
  label: z.string().min(1),
  sort_order: z.number().int(),
  /** Nutrients of one default portion (food × default_grams, or the whole recipe). */
  totals: Nutrients,
  /**
   * The foods of one default portion with their names (a food favourite has one). The server always sends it; it is
   * optional so a favourite drawn before the server answers (offline) can leave it out.
   */
  items: z.array(FavouriteItem).optional(),
})

/** A one-tap repeat: a food with default grams, or a recipe (a list of foods with grams). */
export const Favourite = z.discriminatedUnion('kind', [
  FavouriteFields.extend({ kind: z.literal('food'), food_id: Id, default_grams: Grams.positive() }),
  FavouriteFields.extend({ kind: z.literal('recipe'), recipe: z.array(RecipeItem).min(1) }),
])
export type Favourite = z.infer<typeof Favourite>

const FavouriteCreateFields = z.object({ id: Id, label: z.string().trim().min(1).max(100), sort_order: z.number().int().optional() })

/** Body of POST /api/favorites. */
export const FavouriteCreate = z.discriminatedUnion('kind', [
  FavouriteCreateFields.extend({ kind: z.literal('food'), food_id: Id, default_grams: Grams.positive() }),
  FavouriteCreateFields.extend({ kind: z.literal('recipe'), recipe: z.array(RecipeItem).min(1) }),
])
export type FavouriteCreate = z.infer<typeof FavouriteCreate>

/** Body of PATCH /api/favorites/:id; `default_grams` applies to food favourites, `recipe` to recipes. */
export const FavouritePatch = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  sort_order: z.number().int().optional(),
  default_grams: Grams.positive().optional(),
  recipe: z.array(RecipeItem).min(1).optional(),
})
export type FavouritePatch = z.infer<typeof FavouritePatch>

// ── Meals ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const MealStatus = z.enum(['parsing', 'review', 'confirmed'])
export type MealStatus = z.infer<typeof MealStatus>

export const InputMethod = z.enum(['text', 'photo', 'voice', 'barcode', 'favorite', 'manual'])
export type InputMethod = z.infer<typeof InputMethod>

/** A food in a meal with its grams and nutrition; `estimated` when no database match and the LLM guessed. */
export const MealItem = z.object({
  id: Id,
  meal_id: Id,
  food_id: Id.nullable(),
  description: z.string(),
  grams: Grams,
  ...Nutrients.shape,
  confidence: Fraction.nullable(),
  estimated: z.boolean(),
})
export type MealItem = z.infer<typeof MealItem>

export const MealPhoto = z.object({
  id: Id,
  meal_id: Id,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  exif_stripped: z.boolean(),
  url: FileUrl,
})
export type MealPhoto = z.infer<typeof MealPhoto>

/** A meal as the API returns it, with items, computed totals and photos. `date` is eaten_at's Edmonton day. */
export const Meal = Row.extend({
  date: LocalDate,
  slot: MealSlot,
  eaten_at: Instant,
  input_method: InputMethod,
  raw_text: z.string().nullable(),
  status: MealStatus,
  items: z.array(MealItem),
  totals: Nutrients,
  photos: z.array(MealPhoto),
})
export type Meal = z.infer<typeof Meal>

/** An item from a known food: the server derives nutrition from the food's per-100 g values. */
const FoodItemInput = z.object({
  id: Id,
  food_id: Id,
  grams: Grams.positive(),
  description: z.string().trim().max(200).optional(),
})

/** An item with its own nutrition (typed by Aaron, or an LLM estimate he kept or rescaled). */
const CustomItemInput = z.object({
  id: Id,
  description: z.string().trim().min(1).max(200),
  grams: Grams.positive(),
  ...Nutrients.shape,
  estimated: z.boolean().default(false),
})

/** A meal item in a create or patch body: a food reference, or custom nutrition. Ids are client-generated. */
export const MealItemInput = z.union([FoodItemInput, CustomItemInput])
export type MealItemInput = z.infer<typeof MealItemInput>

const MealCreateFields = z.object({ id: Id, slot: MealSlot, eaten_at: Instant })
const MealText = z.string().trim().min(1).max(2000)

/**
 * Body of POST /api/meals, by input method. Text and voice (already transcribed) go to meal_analysis; photo meals
 * are analysed once their photos arrive (POST /api/meals/:id/photos); manual and barcode carry their items;
 * a favourite is copied, scaled by `scale`. The local `date` is computed from `eaten_at`.
 */
export const MealCreate = z.discriminatedUnion('input_method', [
  MealCreateFields.extend({ input_method: z.enum(['text', 'voice']), raw_text: MealText }),
  MealCreateFields.extend({ input_method: z.literal('photo'), raw_text: MealText.optional() }),
  MealCreateFields.extend({ input_method: z.enum(['manual', 'barcode']), items: z.array(MealItemInput).min(1).max(50) }),
  MealCreateFields.extend({ input_method: z.literal('favorite'), favorite_id: Id, scale: z.number().positive().max(10).default(1) }),
])
export type MealCreate = z.infer<typeof MealCreate>

/** Body of PATCH /api/meals/:id. `items` replaces the whole list; `confirm: true` confirms the meal (→ day_adjustment). */
export const MealPatch = z.object({
  slot: MealSlot.optional(),
  eaten_at: Instant.optional(),
  items: z.array(MealItemInput).max(50).optional(),
  confirm: z.literal(true).optional(),
})
export type MealPatch = z.infer<typeof MealPatch>

/** Query of GET /api/meals. */
export const MealListQuery = z.object({ date: LocalDate })
export type MealListQuery = z.infer<typeof MealListQuery>

/**
 * Query of POST /api/meals/:id/photos (body: the downscaled, EXIF-stripped image as Binary). Stored at
 * meal-photos/<meal_id>/<photo_id>.jpg|webp; a photo meal goes (back) to 'parsing' and is analysed with all its photos.
 */
export const MealPhotoUploadQuery = z.object({
  photo_id: Id,
  width: QueryInt,
  height: QueryInt,
  content_type: ImageType,
})
export type MealPhotoUploadQuery = z.infer<typeof MealPhotoUploadQuery>
