CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_name` text NOT NULL,
	`last4` text NOT NULL,
	`currency` text NOT NULL,
	`balance_minor_units` integer NOT NULL,
	`balance_as_of` integer NOT NULL,
	`balance_sender` text NOT NULL,
	`estimated_balance_minor_units` integer NOT NULL,
	`estimated_as_of` integer NOT NULL,
	`reconciliation_delta_minor_units` integer
);
--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`category` text NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_sms_category_idx` ON `activity` (`sms_id`,`category`);--> statement-breakpoint
CREATE INDEX `activity_category_idx` ON `activity` (`category`);--> statement-breakpoint
CREATE INDEX `activity_date_idx` ON `activity` (`date`);--> statement-breakpoint
CREATE TABLE `balance_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`account_id` text,
	`balance_minor_units` integer NOT NULL,
	`currency` text NOT NULL,
	`as_of` integer NOT NULL,
	`detected_bank_name` text NOT NULL,
	`detected_account` text,
	`association_kind` text NOT NULL,
	`sender` text NOT NULL,
	`reconciliation_previous_as_of` integer,
	`reconciliation_expected_balance_minor_units` integer,
	`reconciliation_delta_minor_units` integer,
	`captured_income_minor_units` integer,
	`captured_expense_minor_units` integer,
	`captured_transaction_count` integer,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "balance_readings_association_kind_check" CHECK("balance_readings"."association_kind" IN ('confirmed', 'suggested', 'unassigned'))
);
--> statement-breakpoint
CREATE INDEX `balance_readings_account_id_idx` ON `balance_readings` (`account_id`);--> statement-breakpoint
CREATE INDEX `balance_readings_as_of_idx` ON `balance_readings` (`as_of`);--> statement-breakpoint
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
CREATE TABLE `mandate_events` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`mandate_id` text NOT NULL,
	`status` text NOT NULL,
	`date` integer NOT NULL,
	`sender` text NOT NULL,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`mandate_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mandate_events_status_check" CHECK("mandate_events"."status" IN ('active', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mandate_events_sms_id_idx` ON `mandate_events` (`sms_id`);--> statement-breakpoint
CREATE INDEX `mandate_events_mandate_id_idx` ON `mandate_events` (`mandate_id`);--> statement-breakpoint
CREATE TABLE `mandates` (
	`mandate_id` text PRIMARY KEY NOT NULL,
	`merchant` text NOT NULL,
	`amount_minor_units` integer,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_updated` integer NOT NULL,
	`sender` text NOT NULL,
	CONSTRAINT "mandates_status_check" CHECK("mandates"."status" IN ('active', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE `sms_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`date` integer NOT NULL,
	`parser_version` text NOT NULL,
	`parsed_result` text,
	`ingestion_status` text NOT NULL,
	`ingestion_error` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "sms_ledger_parsed_result_matches_status" CHECK(("sms_ledger"."ingestion_status" = 'parsed' AND "sms_ledger"."parsed_result" IS NOT NULL AND "sms_ledger"."ingestion_error" IS NULL) OR ("sms_ledger"."ingestion_status" = 'error' AND "sms_ledger"."parsed_result" IS NULL AND "sms_ledger"."ingestion_error" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `sms_ledger_date_idx` ON `sms_ledger` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sms_ledger_provider_id_idx` ON `sms_ledger` (`provider_id`);--> statement-breakpoint
CREATE TABLE `sync_checkpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`last_ingested_date` integer,
	`last_ingested_provider_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`account_id` text,
	`amount_minor_units` integer NOT NULL,
	`currency` text NOT NULL,
	`direction` text NOT NULL,
	`trx_type_rich` text,
	`vendor` text,
	`brand_name` text,
	`merchant_category` text,
	`ref` text,
	`bank_name` text,
	`date` integer NOT NULL,
	`mandate_id` text,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transactions_direction_check" CHECK("transactions"."direction" IN ('income', 'expense', 'neutral'))
);
--> statement-breakpoint
CREATE INDEX `transactions_account_id_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_sms_id_idx` ON `transactions` (`sms_id`);