CREATE TABLE `ai_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`date` text,
	`summary` text NOT NULL,
	`body` text,
	`proposal_status` text,
	`plan_version_id` text,
	`job_id` text,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `ai_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_events_created_at_idx` ON `ai_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_events_date_idx` ON `ai_events` (`date`);--> statement-breakpoint
CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`result` text,
	`provider` text,
	`model` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`latency_ms` integer,
	`tokens_in` integer,
	`tokens_out` integer,
	`run_after` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`lease_until` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_status_run_after_idx` ON `ai_jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `app_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`until` text,
	`actor` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_notes_until_idx` ON `app_notes` (`until`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chat_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cron_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`period_key` text NOT NULL,
	`ran_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cron_runs_kind_period_uq` ON `cron_runs` (`kind`,`period_key`);--> statement-breakpoint
CREATE TABLE `daily_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`week_plan_id` text,
	`kcal` integer NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`fibre_g` real NOT NULL,
	`water_ml` integer NOT NULL,
	`steps` integer NOT NULL,
	`is_fast_day` integer DEFAULT false NOT NULL,
	`training_planned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`week_plan_id`) REFERENCES `week_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_targets_date_uq` ON `daily_targets` (`date`);--> statement-breakpoint
CREATE TABLE `equipment_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment` text NOT NULL,
	`kind` text DEFAULT 'library' NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_profile_equipment_uq` ON `equipment_profile` (`equipment`);--> statement-breakpoint
CREATE TABLE `exercise_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text,
	`category` text,
	`reason` text NOT NULL,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_exclusions_exercise_uq` ON `exercise_exclusions` (`exercise_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_exclusions_category_uq` ON `exercise_exclusions` (`category`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`equipment` text,
	`mechanic` text,
	`force` text,
	`level` text NOT NULL,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text NOT NULL,
	`instructions` text NOT NULL,
	`image_paths` text NOT NULL,
	`video_search_url` text,
	`gif_url` text,
	`media` text,
	`source` text NOT NULL,
	`source_id` text,
	`custom` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_slug_uq` ON `exercises` (`slug`);--> statement-breakpoint
CREATE INDEX `exercises_equipment_idx` ON `exercises` (`equipment`);--> statement-breakpoint
CREATE TABLE `fast_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`planned` integer DEFAULT false NOT NULL,
	`note` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fast_logs_start_date_idx` ON `fast_logs` (`start_date`);--> statement-breakpoint
CREATE INDEX `fast_logs_end_date_idx` ON `fast_logs` (`end_date`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`food_id` text,
	`recipe` text,
	`label` text NOT NULL,
	`default_grams` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`serving_g` real,
	`kcal_per_100g` real NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`fibre_g` real DEFAULT 0 NOT NULL,
	`sugar_g` real,
	`sodium_mg` real,
	`raw` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_source_uq` ON `foods` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `foods_barcode_idx` ON `foods` (`barcode`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`food_id` text,
	`description` text NOT NULL,
	`grams` real NOT NULL,
	`kcal` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`fibre_g` real DEFAULT 0 NOT NULL,
	`confidence` real,
	`estimated` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_id_idx` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE TABLE `meal_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`storage_path` text NOT NULL,
	`width` integer,
	`height` integer,
	`exif_stripped` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meal_photos_meal_id_idx` ON `meal_photos` (`meal_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`eaten_at` text,
	`input_method` text NOT NULL,
	`raw_text` text,
	`status` text DEFAULT 'parsing' NOT NULL,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meals_date_idx` ON `meals` (`date`);--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`site` text NOT NULL,
	`value_cm` real NOT NULL,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurements_date_site_uq` ON `measurements` (`date`,`site`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`segment` text,
	`target_value` real NOT NULL,
	`label` text NOT NULL,
	`reached_on` text,
	`scan_id` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `milestones_reached_on_idx` ON `milestones` (`reached_on`);--> statement-breakpoint
CREATE TABLE `plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`reason` text NOT NULL,
	`diff` text NOT NULL,
	`targets` text NOT NULL,
	`forecast` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_versions_version_uq` ON `plan_versions` (`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_versions_one_active_uq` ON `plan_versions` (`active`) WHERE active = 1;--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`height_cm` real NOT NULL,
	`birth_date` text,
	`sex` text NOT NULL,
	`timezone` text DEFAULT 'America/Edmonton' NOT NULL,
	`goal_weight_kg` real NOT NULL,
	`goal_date` text NOT NULL,
	`start_weight_kg` real NOT NULL,
	`start_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` text NOT NULL,
	`date` text NOT NULL,
	`pose` text NOT NULL,
	`storage_path` text NOT NULL,
	`weight_kg` real,
	`nearest_scan_id` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`nearest_scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `progress_photos_date_idx` ON `progress_photos` (`date`);--> statement-breakpoint
CREATE TABLE `provider_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_usage_provider_day_uq` ON `provider_usage` (`provider`,`day`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`kinds` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_uq` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `scan_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`segment` text NOT NULL,
	`lean_kg` real NOT NULL,
	`fat_kg` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_segments_scan_segment_uq` ON `scan_segments` (`scan_id`,`segment`);--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`scanned_at` text NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'evolt360' NOT NULL,
	`source_units` text DEFAULT 'lb' NOT NULL,
	`storage_path` text,
	`extracted` text,
	`confirmed` integer DEFAULT false NOT NULL,
	`conditions` text,
	`notes` text,
	`height_cm` real,
	`age` integer,
	`sex` text,
	`weight_kg` real,
	`lean_body_mass_kg` real,
	`skeletal_muscle_mass_kg` real,
	`protein_kg` real,
	`mineral_kg` real,
	`total_body_water_kg` real,
	`icf_kg` real,
	`ecf_kg` real,
	`body_fat_mass_kg` real,
	`body_fat_pct` real,
	`subcutaneous_fat_kg` real,
	`visceral_fat_kg` real,
	`visceral_fat_area_cm2` real,
	`visceral_fat_level` real,
	`bmr_kcal` integer,
	`tee_kcal` integer,
	`waist_hip_ratio` real,
	`bio_age` integer,
	`bwi_score` real,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scans_date_idx` ON `scans` (`date`);--> statement-breakpoint
CREATE TABLE `session_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`reps` integer,
	`load_kg` real,
	`rpe` real,
	`completed` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_sets_session_id_idx` ON `session_sets` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_sets_exercise_id_idx` ON `session_sets` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`calorie_floor` integer DEFAULT 1400 NOT NULL,
	`calorie_ceiling` integer DEFAULT 1700 NOT NULL,
	`protein_min_g` integer NOT NULL,
	`fat_min_g` integer NOT NULL,
	`fasts_per_month` integer DEFAULT 2 NOT NULL,
	`fast_hours` integer DEFAULT 24 NOT NULL,
	`fibre_target_g` integer NOT NULL,
	`water_target_ml` integer NOT NULL,
	`training_days` text NOT NULL,
	`breakfast_enabled` integer DEFAULT false NOT NULL,
	`auto_apply_safe` integer DEFAULT false NOT NULL,
	`scan_interval_days` integer DEFAULT 28 NOT NULL,
	`reminders` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sleep_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`in_bed_at` text,
	`woke_at` text,
	`asleep_min` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`stages` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_logs_date_uq` ON `sleep_logs` (`date`);--> statement-breakpoint
CREATE TABLE `step_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`steps` integer NOT NULL,
	`active_kcal` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_logs_date_uq` ON `step_logs` (`date`);--> statement-breakpoint
CREATE TABLE `template_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`sets` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`target_load_kg` real,
	`rest_sec` integer,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `template_exercises_template_id_idx` ON `template_exercises` (`template_id`);--> statement-breakpoint
CREATE TABLE `water_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`logged_at` text NOT NULL,
	`date` text NOT NULL,
	`amount_ml` integer NOT NULL,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `water_logs_date_idx` ON `water_logs` (`date`);--> statement-breakpoint
CREATE TABLE `week_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`author` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`plan` text NOT NULL,
	`plan_version_id` text,
	`review_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `weekly_reviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `week_plans_week_start_idx` ON `week_plans` (`week_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `week_plans_active_week_uq` ON `week_plans` (`week_start`) WHERE status = 'active';--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`metrics` text,
	`narrative` text,
	`author` text NOT NULL,
	`proposals` text,
	`highlights` text,
	`concerns` text,
	`pdf_path` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reviews_week_start_uq` ON `weekly_reviews` (`week_start`);--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`note` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_logs_date_uq` ON `weight_logs` (`date`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`template_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`origin` text DEFAULT 'blank' NOT NULL,
	`readiness` text,
	`notes` text,
	`muscle_scores` text,
	`prs` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`origin` text DEFAULT 'custom' NOT NULL,
	`notes` text,
	`muscle_scores` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
