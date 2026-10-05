-- Owns: the v_day view — one row per local date (spine: daily_targets.date) with targets and the day's logged totals.
-- The dashboard, the weekly review and get_today all read this so the numbers agree everywhere.
-- This file is the source; scripts/postprocess-migrations.ts copies it into each *_v_day.sql custom migration and fails
-- if the newest one has drifted. To change the view: edit here, then `drizzle-kit generate --custom --name v_day && tsx scripts/postprocess-migrations.ts`.
-- Table rebuilds ("__new_" migrations) get DROP VIEW v_day before and this SQL after, added by the same script.
-- Every metric is a correlated scalar subquery on an indexed date column, so `WHERE date = ?` is an indexed SEARCH, never a SCAN.
-- Intake: confirmed meals only. Fasted: a fast that has begun (started_at <= now; a planned fast starts at its time) and
-- overlaps the date; a running fast covers its start date and the next day (its 24 h envelope). Fasts are assumed to start
-- at most 2 days before the date (bounds the indexed range on start_date).
DROP VIEW IF EXISTS `v_day`;
--> statement-breakpoint
CREATE VIEW `v_day` AS
SELECT
  t.date AS date,
  t.plan_version_id AS plan_version_id,
  t.kcal AS target_kcal,
  t.protein_g AS target_protein_g,
  t.carbs_g AS target_carbs_g,
  t.fat_g AS target_fat_g,
  t.fibre_g AS target_fibre_g,
  t.water_ml AS target_water_ml,
  t.steps AS target_steps,
  t.is_fast_day AS is_fast_day,
  t.training_planned AS training_planned,
  (SELECT w.weight_kg FROM weight_logs w WHERE w.date = t.date) AS weight_kg,
  (SELECT coalesce(sum(i.kcal), 0) FROM meals m JOIN meal_items i ON i.meal_id = m.id
    WHERE m.date = t.date AND m.status = 'confirmed') AS intake_kcal,
  (SELECT coalesce(sum(i.protein_g), 0) FROM meals m JOIN meal_items i ON i.meal_id = m.id
    WHERE m.date = t.date AND m.status = 'confirmed') AS intake_protein_g,
  (SELECT coalesce(sum(i.carbs_g), 0) FROM meals m JOIN meal_items i ON i.meal_id = m.id
    WHERE m.date = t.date AND m.status = 'confirmed') AS intake_carbs_g,
  (SELECT coalesce(sum(i.fat_g), 0) FROM meals m JOIN meal_items i ON i.meal_id = m.id
    WHERE m.date = t.date AND m.status = 'confirmed') AS intake_fat_g,
  (SELECT coalesce(sum(i.fibre_g), 0) FROM meals m JOIN meal_items i ON i.meal_id = m.id
    WHERE m.date = t.date AND m.status = 'confirmed') AS intake_fibre_g,
  (SELECT count(*) FROM meals m WHERE m.date = t.date AND m.status = 'confirmed') AS meals_logged,
  (SELECT coalesce(sum(wl.amount_ml), 0) FROM water_logs wl WHERE wl.date = t.date) AS water_ml,
  (SELECT s.steps FROM step_logs s WHERE s.date = t.date) AS steps,
  (SELECT s.active_kcal FROM step_logs s WHERE s.date = t.date) AS active_kcal,
  (SELECT sl.asleep_min FROM sleep_logs sl WHERE sl.date = t.date) AS asleep_min,
  EXISTS (
    SELECT 1 FROM fast_logs f
    WHERE f.start_date <= t.date
      AND f.start_date >= date(t.date, '-2 days')
      AND coalesce(f.end_date, date(f.start_date, '+1 day')) >= t.date
      AND f.started_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) AS fasted,
  (SELECT count(*) FROM workout_sessions ws WHERE ws.date = t.date AND ws.ended_at IS NOT NULL) AS sessions_done
FROM daily_targets t;
