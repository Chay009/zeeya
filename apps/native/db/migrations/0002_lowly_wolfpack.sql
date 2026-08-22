CREATE TABLE `identity_conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sms_id` text NOT NULL,
	`contested_provider_id` text NOT NULL,
	`detected_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `identity_conflicts_sms_id_idx` ON `identity_conflicts` (`sms_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_conflicts_open_unique` ON `identity_conflicts` (`sms_id`,`contested_provider_id`) WHERE "identity_conflicts"."resolved_at" IS NULL;--> statement-breakpoint
ALTER TABLE `sms_ledger` DROP COLUMN `contested_provider_id`;