CREATE TABLE `body_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`area` text NOT NULL,
	`kind` text NOT NULL,
	`severity` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`resolved_on` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_notes_date_idx` ON `body_notes` (`date`);--> statement-breakpoint
CREATE TABLE `chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_attachments_message_idx` ON `chat_attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `chat_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`summary` text NOT NULL,
	`ref_id` text NOT NULL,
	`ref_updated_at` text,
	`before` text,
	`undone_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_receipts_message_idx` ON `chat_receipts` (`message_id`);--> statement-breakpoint
CREATE INDEX `chat_receipts_thread_idx` ON `chat_receipts` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_receipts_date_idx` ON `chat_receipts` (`date`);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `forecast` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `running` integer DEFAULT false NOT NULL;