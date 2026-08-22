CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_name` text NOT NULL,
	`last4` text NOT NULL,
	`currency` text NOT NULL,
	`balance` real NOT NULL,
	`balance_as_of` integer NOT NULL,
	`balance_sender` text NOT NULL,
	`estimated_balance` real NOT NULL,
	`estimated_as_of` integer NOT NULL,
	`reconciliation_delta` real
);
--> statement-breakpoint
CREATE TABLE `balance_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`account_id` text,
	`balance` real NOT NULL,
	`currency` text NOT NULL,
	`as_of` integer NOT NULL,
	`detected_bank_name` text NOT NULL,
	`detected_account` text,
	`association_kind` text NOT NULL,
	`sender` text NOT NULL,
	`reconciliation_previous_as_of` integer,
	`reconciliation_expected_balance` real,
	`reconciliation_delta` real,
	`captured_income` real,
	`captured_expense` real,
	`captured_transaction_count` integer,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `balance_readings_account_id_idx` ON `balance_readings` (`account_id`);--> statement-breakpoint
CREATE INDEX `balance_readings_as_of_idx` ON `balance_readings` (`as_of`);--> statement-breakpoint
CREATE TABLE `mandate_events` (
	`id` text PRIMARY KEY NOT NULL,
	`mandate_id` text NOT NULL,
	`status` text NOT NULL,
	`date` integer NOT NULL,
	`sender` text NOT NULL,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`mandate_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mandate_events_mandate_id_idx` ON `mandate_events` (`mandate_id`);--> statement-breakpoint
CREATE TABLE `mandates` (
	`mandate_id` text PRIMARY KEY NOT NULL,
	`merchant` text NOT NULL,
	`amount` real,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_updated` integer NOT NULL,
	`sender` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`date` integer NOT NULL,
	`parser_version` text NOT NULL,
	`parsed_result` text NOT NULL,
	`ingestion_status` text NOT NULL,
	`ingestion_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sms_ledger_date_idx` ON `sms_ledger` (`date`);--> statement-breakpoint
CREATE INDEX `sms_ledger_provider_id_idx` ON `sms_ledger` (`provider_id`);--> statement-breakpoint
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
	`amount` real NOT NULL,
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
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transactions_account_id_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_sms_id_idx` ON `transactions` (`sms_id`);