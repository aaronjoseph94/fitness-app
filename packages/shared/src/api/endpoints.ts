// Owns: every REST endpoint definition (SPEC §10 plus the additions recorded in docs/PROGRESS.md), grouped by area.
// The Worker validates params/query/body with these and the PWA calls through them. A Binary body is sent as
// application/octet-stream; every other body is JSON. offline: 'queue' marks idempotent writes (client-generated id)
// the PWA may hold in its offline queue.
import * as z from 'zod'
import {
  AiJob,
  AiWorkoutRequest,
  Binary,
  ChatHistoryQuery,
  ChatMessage,
  ChatSend,
  ChatSent,
  DateRange,
  DaysQuery,
  DaySummary,
  DayView,
  EquipmentItem,
  EquipmentUpdate,
  EventsQuery,
  EventsResponse,
  Exercise,
  ExerciseCreate,
  ExercisePhotoUploadQuery,
  ExerciseExclusion,
  ExerciseHistory,
  ExerciseQuery,
  ExerciseSummary,
  ExclusionCreate,
  ExportManifest,
  ExportPage,
  ExportTableQuery,
  Fast,
  FastEnd,
  FastListQuery,
  FastMove,
  FastPlan,
  FastStart,
  Favourite,
  FavouriteCreate,
  FavouritePatch,
  FileKey,
  Food,
  FoodCreate,
  FoodSearchQuery,
  HealthImport,
  HealthImportResult,
  HealthIngest,
  HealthIngestResult,
  Id,
  ImportFileQuery,
  ImportPage,
  ImportResult,
  IsoWeek,
  JobRef,
  LocalDate,
  Meal,
  MealCreate,
  MealListQuery,
  MealPatch,
  MealPhoto,
  MealPhotoUploadQuery,
  Measurement,
  MeasurementsCreate,
  NoteResponse,
  Ok,
  PhotoListQuery,
  PhotoUploadQuery,
  PlanVersion,
  ProgressPhoto,
  ProposalDecision,
  PushKey,
  PushResult,
  PushSubscribe,
  PushSubscription,
  PushTest,
  PushUnsubscribe,
  RecentFood,
  RecentFoodsQuery,
  Scan,
  ScanPatch,
  ScanSchedule,
  ScanUploaded,
  ScanUploadQuery,
  SessionCreate,
  SessionFinish,
  SessionFinishResult,
  SessionSet,
  SetCreate,
  SetPatch,
  SettingsUpdate,
  SettingsView,
  SignedFile,
  SignedFileQuery,
  SleepLog,
  SleepLogCreate,
  StepLog,
  StepLogCreate,
  Template,
  TemplateCreate,
  TemplatePatch,
  TrendSeries,
  Upload,
  WaterLog,
  WaterLogCreate,
  WaterListQuery,
  WeekPlan,
  WeekPlanApplied,
  WeekPlanCreate,
  WeekPlanProposal,
  WeekPlanQuery,
  WeekPlanView,
  WeekPlanViewQuery,
  WeeklyMetrics,
  WeeklyReview,
  WeighIn,
  WeighInCreate,
  WeighInUpdate,
  WorkoutSession,
} from '../schemas/index'
import { defineEndpoint } from './endpoint'

const IdParams = z.object({ id: Id })
const DateParams = z.object({ date: LocalDate })
const WeekParams = z.object({ week: IsoWeek })
const FileKeyParams = z.object({ key: FileKey })

/** Week plans (SPEC §8 "Next-week plan"): the plans of a week, the week view, propose, apply, revert, reject. */
const weekPlans = {
  /** Newest week first; filter by week (its Monday) and status. */
  list: defineEndpoint({ method: 'GET', path: '/api/week-plans', query: WeekPlanQuery, response: z.array(WeekPlan) }),
  /** A week's active and proposed plans with this week's and last week's actuals and what changed (default: this week). */
  get: defineEndpoint({ method: 'GET', path: '/api/week-plans/view', query: WeekPlanViewQuery, response: WeekPlanView }),
  /** Aaron's own plan for a week, stored as proposed after the guards (replaying an id returns the stored plan). */
  propose: defineEndpoint({ method: 'POST', path: '/api/week-plans', body: WeekPlanCreate, response: WeekPlanProposal }),
  /** Make a plan the week's active one: rebuilds that week's daily targets as one plan version. */
  apply: defineEndpoint({ method: 'POST', path: '/api/week-plans/:id/apply', params: IdParams, response: WeekPlanApplied }),
  /** Undo applying the active plan: the week's previous active plan comes back (or the plan version's targets). */
  revert: defineEndpoint({ method: 'POST', path: '/api/week-plans/:id/revert', params: IdParams, response: WeekPlanApplied }),
  /** Turn down a proposed plan: it is superseded (the week keeps its active plan) and its proposal is rejected. */
  reject: defineEndpoint({ method: 'POST', path: '/api/week-plans/:id/reject', params: IdParams, response: WeekPlan }),
}

export const endpoints = {
  system: {
    health: defineEndpoint({
      method: 'GET',
      path: '/api/health',
      response: z.object({ ok: z.boolean(), tz: z.string() }),
    }),
  },

  day: {
    get: defineEndpoint({ method: 'GET', path: '/api/day/:date', params: DateParams, response: DayView }),
    range: defineEndpoint({ method: 'GET', path: '/api/days', query: DaysQuery, response: z.array(DaySummary) }),
    events: defineEndpoint({ method: 'GET', path: '/api/events', query: EventsQuery, response: EventsResponse }),
    note: defineEndpoint({ method: 'GET', path: '/api/notes', response: NoteResponse }),
  },

  body: {
    createWeight: defineEndpoint({ method: 'POST', path: '/api/weights', body: WeighInCreate, response: WeighIn, offline: 'queue' }),
    updateWeight: defineEndpoint({
      method: 'PUT',
      path: '/api/weights/:id',
      params: IdParams,
      body: WeighInUpdate,
      response: WeighIn,
      offline: 'queue',
    }),
    createMeasurements: defineEndpoint({
      method: 'POST',
      path: '/api/measurements',
      body: MeasurementsCreate,
      response: z.array(Measurement),
      offline: 'queue',
    }),
    /** At most 400 days (one point per day; the Progress tab asks for at most 400). */
    trend: defineEndpoint({ method: 'GET', path: '/api/trend', query: DaysQuery, response: TrendSeries }),
  },

  nutrition: {
    listMeals: defineEndpoint({ method: 'GET', path: '/api/meals', query: MealListQuery, response: z.array(Meal) }),
    /** One meal with its items, photos and analysis state (poll it while `analysis.status` is queued or running). */
    getMeal: defineEndpoint({ method: 'GET', path: '/api/meals/:id', params: IdParams, response: Meal }),
    createMeal: defineEndpoint({ method: 'POST', path: '/api/meals', body: MealCreate, response: Meal, offline: 'queue' }),
    updateMeal: defineEndpoint({
      method: 'PATCH',
      path: '/api/meals/:id',
      params: IdParams,
      body: MealPatch,
      response: Meal,
      offline: 'queue',
    }),
    deleteMeal: defineEndpoint({ method: 'DELETE', path: '/api/meals/:id', params: IdParams, response: Ok, offline: 'queue' }),
    addMealPhoto: defineEndpoint({
      method: 'POST',
      path: '/api/meals/:id/photos',
      params: IdParams,
      query: MealPhotoUploadQuery,
      body: Upload,
      response: MealPhoto,
      offline: 'queue',
    }),
    searchFoods: defineEndpoint({ method: 'GET', path: '/api/foods/search', query: FoodSearchQuery, response: z.array(Food) }),
    createFood: defineEndpoint({ method: 'POST', path: '/api/foods', body: FoodCreate, response: Food, offline: 'queue' }),
    listFavourites: defineEndpoint({ method: 'GET', path: '/api/favorites', response: z.array(Favourite) }),
    createFavourite: defineEndpoint({
      method: 'POST',
      path: '/api/favorites',
      body: FavouriteCreate,
      response: Favourite,
      offline: 'queue',
    }),
    updateFavourite: defineEndpoint({
      method: 'PATCH',
      path: '/api/favorites/:id',
      params: IdParams,
      body: FavouritePatch,
      response: Favourite,
      offline: 'queue',
    }),
    deleteFavourite: defineEndpoint({ method: 'DELETE', path: '/api/favorites/:id', params: IdParams, response: Ok, offline: 'queue' }),
    /** Foods of confirmed meals in the last 30 days, most used first, with the grams last used. */
    recentFoods: defineEndpoint({ method: 'GET', path: '/api/foods/recent', query: RecentFoodsQuery, response: z.array(RecentFood) }),
  },

  water: {
    create: defineEndpoint({ method: 'POST', path: '/api/water', body: WaterLogCreate, response: WaterLog, offline: 'queue' }),
    list: defineEndpoint({ method: 'GET', path: '/api/water', query: WaterListQuery, response: z.array(WaterLog) }),
    delete: defineEndpoint({ method: 'DELETE', path: '/api/water/:id', params: IdParams, response: Ok, offline: 'queue' }),
  },

  fasting: {
    start: defineEndpoint({ method: 'POST', path: '/api/fasts/start', body: FastStart, response: Fast, offline: 'queue' }),
    end: defineEndpoint({
      method: 'POST',
      path: '/api/fasts/:id/end',
      params: IdParams,
      body: FastEnd,
      response: Fast,
      offline: 'queue',
    }),
    plan: defineEndpoint({ method: 'POST', path: '/api/fasts/plan', body: FastPlan, response: Fast, offline: 'queue' }),
    list: defineEndpoint({ method: 'GET', path: '/api/fasts', query: FastListQuery, response: z.array(Fast) }),
    /** Move a planned fast that has not started (409 fast_started once it has). */
    move: defineEndpoint({
      method: 'PATCH',
      path: '/api/fasts/:id',
      params: IdParams,
      body: FastMove,
      response: Fast,
      offline: 'queue',
    }),
    /**
     * Remove a fast that did not happen: a planned fast not yet begun, a planned fast begun but never ended (skipped),
     * or one ended within an hour of its start (a mis-tap). 409 fast_started otherwise (end it instead).
     */
    cancel: defineEndpoint({ method: 'DELETE', path: '/api/fasts/:id', params: IdParams, response: Ok, offline: 'queue' }),
  },

  health: {
    createSleep: defineEndpoint({ method: 'POST', path: '/api/sleep', body: SleepLogCreate, response: SleepLog, offline: 'queue' }),
    createSteps: defineEndpoint({ method: 'POST', path: '/api/steps', body: StepLogCreate, response: StepLog, offline: 'queue' }),
    importHealth: defineEndpoint({
      method: 'POST',
      path: '/api/imports/health',
      body: HealthImport,
      response: HealthImportResult,
      offline: 'never',
    }),
    /** iOS Shortcut webhook; Bearer HEALTH_WEBHOOK_TOKEN instead of Access. Never called by the PWA. */
    ingest: defineEndpoint({
      method: 'POST',
      path: '/api/ingest/health',
      body: HealthIngest,
      response: HealthIngestResult,
      offline: 'never',
    }),
  },

  training: {
    /** Every row without instructions (ExerciseSummary); getExercise returns one in full. */
    listExercises: defineEndpoint({ method: 'GET', path: '/api/exercises', query: ExerciseQuery, response: z.array(ExerciseSummary) }),
    getExercise: defineEndpoint({ method: 'GET', path: '/api/exercises/:id', params: IdParams, response: Exercise }),
    createExercise: defineEndpoint({
      method: 'POST',
      path: '/api/exercises',
      body: ExerciseCreate,
      response: Exercise,
      offline: 'queue',
    }),
    /** The photo of one of Aaron's own exercises (custom only: 409 not_custom otherwise); replaces its image. */
    uploadExercisePhoto: defineEndpoint({
      method: 'POST',
      path: '/api/exercises/:id/photo',
      params: IdParams,
      query: ExercisePhotoUploadQuery,
      body: Upload,
      response: Exercise,
      offline: 'queue',
    }),
    getEquipment: defineEndpoint({ method: 'GET', path: '/api/equipment', response: z.array(EquipmentItem) }),
    updateEquipment: defineEndpoint({
      method: 'PUT',
      path: '/api/equipment',
      body: EquipmentUpdate,
      response: z.array(EquipmentItem),
      offline: 'queue',
    }),
    createExclusion: defineEndpoint({
      method: 'POST',
      path: '/api/exclusions',
      body: ExclusionCreate,
      response: ExerciseExclusion,
      offline: 'queue',
    }),
    /** Un-hide: remove an exclusion (idempotent). The body-only rail is not an exclusion and stays. */
    deleteExclusion: defineEndpoint({ method: 'DELETE', path: '/api/exclusions/:id', params: IdParams, response: Ok, offline: 'queue' }),
    listTemplates: defineEndpoint({ method: 'GET', path: '/api/templates', response: z.array(Template) }),
    getTemplate: defineEndpoint({ method: 'GET', path: '/api/templates/:id', params: IdParams, response: Template }),
    createTemplate: defineEndpoint({
      method: 'POST',
      path: '/api/templates',
      body: TemplateCreate,
      response: Template,
      offline: 'queue',
    }),
    updateTemplate: defineEndpoint({
      method: 'PATCH',
      path: '/api/templates/:id',
      params: IdParams,
      body: TemplatePatch,
      response: Template,
      offline: 'queue',
    }),
    deleteTemplate: defineEndpoint({ method: 'DELETE', path: '/api/templates/:id', params: IdParams, response: Ok, offline: 'queue' }),
    /** Sessions started on local dates from…to (newest first), with their sets; no plan. */
    listSessions: defineEndpoint({ method: 'GET', path: '/api/sessions', query: DateRange, response: z.array(WorkoutSession) }),
    startSession: defineEndpoint({
      method: 'POST',
      path: '/api/sessions',
      body: SessionCreate,
      response: WorkoutSession,
      offline: 'queue',
    }),
    getSession: defineEndpoint({ method: 'GET', path: '/api/sessions/:id', params: IdParams, response: WorkoutSession }),
    logSet: defineEndpoint({
      method: 'POST',
      path: '/api/sessions/:id/sets',
      params: IdParams,
      body: SetCreate,
      response: SessionSet,
      offline: 'queue',
    }),
    updateSet: defineEndpoint({
      method: 'PATCH',
      path: '/api/sets/:id',
      params: IdParams,
      body: SetPatch,
      response: SessionSet,
      offline: 'queue',
    }),
    deleteSet: defineEndpoint({ method: 'DELETE', path: '/api/sets/:id', params: IdParams, response: Ok, offline: 'queue' }),
    finishSession: defineEndpoint({
      method: 'POST',
      path: '/api/sessions/:id/finish',
      params: IdParams,
      body: SessionFinish,
      response: SessionFinishResult,
      offline: 'queue',
    }),
    exerciseHistory: defineEndpoint({
      method: 'GET',
      path: '/api/history/exercises/:id',
      params: IdParams,
      response: ExerciseHistory,
    }),
  },

  plan: {
    get: defineEndpoint({ method: 'GET', path: '/api/plan', response: PlanVersion }),
    versions: defineEndpoint({ method: 'GET', path: '/api/plan/versions', response: z.array(PlanVersion) }),
    restoreVersion: defineEndpoint({
      method: 'POST',
      path: '/api/plan/versions/:id/restore',
      params: IdParams,
      response: PlanVersion,
    }),
    acceptProposal: defineEndpoint({
      method: 'POST',
      path: '/api/proposals/:id/accept',
      params: IdParams,
      response: ProposalDecision,
    }),
    rejectProposal: defineEndpoint({
      method: 'POST',
      path: '/api/proposals/:id/reject',
      params: IdParams,
      response: ProposalDecision,
    }),
  },

  weekPlans,

  ai: {
    workout: defineEndpoint({ method: 'POST', path: '/api/ai/workout', body: AiWorkoutRequest, response: JobRef }),
    chat: defineEndpoint({ method: 'POST', path: '/api/ai/chat', body: ChatSend, response: ChatSent }),
    chatHistory: defineEndpoint({ method: 'GET', path: '/api/ai/chat', query: ChatHistoryQuery, response: z.array(ChatMessage) }),
    job: defineEndpoint({ method: 'GET', path: '/api/jobs/:id', params: IdParams, response: AiJob }),
  },

  scans: {
    upload: defineEndpoint({ method: 'POST', path: '/api/scans', query: ScanUploadQuery, body: Upload, response: ScanUploaded }),
    /** Confirm (or re-confirm) with every value as edited; an id with no scan yet is manual entry without a sheet. */
    confirm: defineEndpoint({ method: 'PATCH', path: '/api/scans/:id', params: IdParams, body: ScanPatch, response: Scan }),
    /** Newest first. */
    list: defineEndpoint({ method: 'GET', path: '/api/scans', response: z.array(Scan) }),
    /** When the next scan is due: the scheduled date (coach or week plan), else the interval after the last scan. */
    schedule: defineEndpoint({ method: 'GET', path: '/api/scans/schedule', response: ScanSchedule }),
    get: defineEndpoint({ method: 'GET', path: '/api/scans/:id', params: IdParams, response: Scan }),
    /** Read the stored sheet again (a new scan_extract job) for an unconfirmed scan. */
    extract: defineEndpoint({ method: 'POST', path: '/api/scans/:id/extract', params: IdParams, response: ScanUploaded }),
    /** Discard an unconfirmed scan and its sheet (409 for a confirmed one). */
    remove: defineEndpoint({ method: 'DELETE', path: '/api/scans/:id', params: IdParams, response: Ok }),
  },

  photos: {
    upload: defineEndpoint({
      method: 'POST',
      path: '/api/photos',
      query: PhotoUploadQuery,
      body: Upload,
      response: ProgressPhoto,
      offline: 'queue',
    }),
    list: defineEndpoint({ method: 'GET', path: '/api/photos', query: PhotoListQuery, response: z.array(ProgressPhoto) }),
    remove: defineEndpoint({ method: 'DELETE', path: '/api/photos/:id', params: IdParams, response: Ok, offline: 'queue' }),
  },

  reviews: {
    /** Newest week first. */
    list: defineEndpoint({ method: 'GET', path: '/api/reviews', response: z.array(WeeklyReview) }),
    /** 404 not_found when the week has no review yet. */
    get: defineEndpoint({ method: 'GET', path: '/api/reviews/:week', params: WeekParams, response: WeeklyReview }),
    /** The engine's live aggregate of the week (the report page shows it while a week has no review). */
    metrics: defineEndpoint({ method: 'GET', path: '/api/reviews/:week/metrics', params: WeekParams, response: WeeklyMetrics }),
    /** Queue the weekly_review job for the week now (Gemini draft; replaces an earlier Gemini draft). 409 when a Claude review exists. */
    draft: defineEndpoint({ method: 'POST', path: '/api/reviews/:week/draft', params: WeekParams, response: JobRef }),
    /** Render /reports/week/:week with Browser Rendering into R2 reports/<week>.pdf. 501 pdf_unavailable without the binding (local dev). */
    pdf: defineEndpoint({ method: 'POST', path: '/api/reviews/:week/pdf', params: WeekParams, response: SignedFile }),
  },

  export: {
    /** Tables (restore order, row counts) and signed URLs for every stored file; the browser builds the zip. */
    manifest: defineEndpoint({ method: 'GET', path: '/api/export', response: ExportManifest }),
    /** One page of one table in id order (≤ 500 rows); follow next_cursor until null. */
    table: defineEndpoint({ method: 'GET', path: '/api/export/tables', query: ExportTableQuery, response: ExportPage }),
    /** Restore one page of rows (upsert by id). 409 not_fresh on a used instance without overwrite; 403 rails_locked for settings unless actor user. */
    importTable: defineEndpoint({ method: 'POST', path: '/api/import', body: ImportPage, response: ImportResult, offline: 'never' }),
    /** Restore one stored file under its key (same gate as importTable). */
    importFile: defineEndpoint({
      method: 'POST',
      path: '/api/import/files',
      query: ImportFileQuery,
      body: Upload,
      response: Ok,
      offline: 'never',
    }),
  },

  settings: {
    get: defineEndpoint({ method: 'GET', path: '/api/settings', response: SettingsView }),
    update: defineEndpoint({ method: 'PATCH', path: '/api/settings', body: SettingsUpdate, response: SettingsView }),
  },

  push: {
    /** The VAPID public key the page subscribes with (public_key null when the Worker has no VAPID keys). */
    key: defineEndpoint({ method: 'GET', path: '/api/push/key', response: PushKey }),
    /** Upsert this device's subscription by endpoint. */
    subscribe: defineEndpoint({ method: 'POST', path: '/api/push/subscribe', body: PushSubscribe, response: PushSubscription }),
    /** Forget this device's subscription (Ok when it was never stored). */
    unsubscribe: defineEndpoint({ method: 'DELETE', path: '/api/push/subscribe', body: PushUnsubscribe, response: Ok }),
    /** Send a test notification to one device (endpoint) or all; drops subscriptions the push service says are gone. */
    test: defineEndpoint({ method: 'POST', path: '/api/push/test', body: PushTest, response: PushResult }),
  },

  files: {
    /** Our HMAC-signed, expiring file URL. Used as an <img src>/download link, not through the JSON client. */
    get: defineEndpoint({
      method: 'GET',
      path: '/api/files/:key',
      params: FileKeyParams,
      query: SignedFileQuery,
      response: Binary,
    }),
  },
} as const
