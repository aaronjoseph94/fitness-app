ALTER TABLE `meals` ADD `analysis_job_id` text;--> statement-breakpoint
ALTER TABLE `progress_photos` ADD `width` integer;--> statement-breakpoint
ALTER TABLE `progress_photos` ADD `height` integer;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `plan` text;--> statement-breakpoint
CREATE INDEX `ai_events_plan_version_idx` ON `ai_events` (`plan_version_id`);