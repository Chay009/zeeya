CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_name` text NOT NULL,
	`bank_key` text NOT NULL,
	`last4` text NOT NULL,
	`currency` text NOT NULL,
	`anchor_status` text NOT NULL,
	`balance_minor_units` integer,
	`balance_as_of` integer NOT NULL,
	`balance_sender` text NOT NULL,
	`estimated_balance_minor_units` integer,
	`estimated_as_of` integer NOT NULL,
	`reconciliation_delta_minor_units` integer,
	`captured_income_minor_units` integer NOT NULL,
	`captured_expense_minor_units` integer NOT NULL,
	`captured_change_minor_units` integer NOT NULL,
	`captured_transaction_count` integer NOT NULL,
	CONSTRAINT "accounts_anchor_status_check" CHECK("accounts"."anchor_status" IN ('reported', 'unreported')),
	CONSTRAINT "accounts_anchor_status_balance_nullability_check" CHECK(("accounts"."anchor_status" = 'reported' AND "accounts"."balance_minor_units" IS NOT NULL AND "accounts"."estimated_balance_minor_units" IS NOT NULL)
       OR ("accounts"."anchor_status" = 'unreported' AND "accounts"."balance_minor_units" IS NULL AND "accounts"."estimated_balance_minor_units" IS NULL)),
	CONSTRAINT "accounts_captured_transaction_count_check" CHECK("accounts"."captured_transaction_count" >= 0),
	CONSTRAINT "accounts_captured_income_expense_nonnegative_check" CHECK("accounts"."captured_income_minor_units" >= 0 AND "accounts"."captured_expense_minor_units" >= 0),
	CONSTRAINT "accounts_captured_change_check" CHECK("accounts"."captured_change_minor_units" = "accounts"."captured_income_minor_units" - "accounts"."captured_expense_minor_units"),
	CONSTRAINT "accounts_captured_zero_count_check" CHECK("accounts"."captured_transaction_count" != 0 OR ("accounts"."captured_income_minor_units" = 0 AND "accounts"."captured_expense_minor_units" = 0 AND "accounts"."captured_change_minor_units" = 0))
);
--> statement-breakpoint
CREATE INDEX `accounts_bank_key_currency_idx` ON `accounts` (`bank_key`,`currency`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`category` text NOT NULL,
	`date` integer NOT NULL,
	`bank_name` text,
	`brand_name` text,
	`vendor` text,
	`trx_type_rich` text,
	`subcategory` text,
	`mandate_event` text,
	`is_from_card` integer DEFAULT false NOT NULL,
	`amount_minor_units` integer,
	`currency` text,
	`direction` text,
	`bene` text,
	`merchant_category` text,
	`sender` text NOT NULL,
	`account_id` text,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "activity_mandate_event_check" CHECK("activity"."mandate_event" IS NULL OR "activity"."mandate_event" IN ('active', 'cancelled')),
	CONSTRAINT "activity_direction_check" CHECK("activity"."direction" IS NULL OR "activity"."direction" IN ('income', 'expense', 'neutral')),
	CONSTRAINT "activity_category_check" CHECK("activity"."category" IN ('GRM_BANK', 'GRM_BILL', 'GRM_STOCKUPDATES', 'GRM_TRAVEL', 'GRM_DELIVERY', 'GRM_EVENT', 'GRM_APPOINTMENT', 'GRM_NOTIF', 'GRM_OTP', 'GRM_OFFERS')),
	CONSTRAINT "activity_financial_fields_check" CHECK(("activity"."amount_minor_units" IS NULL AND "activity"."currency" IS NULL AND "activity"."direction" IS NULL)
       OR ("activity"."amount_minor_units" IS NOT NULL AND "activity"."currency" IS NOT NULL AND "activity"."direction" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_sms_category_idx` ON `activity` (`sms_id`,`category`);--> statement-breakpoint
CREATE INDEX `activity_category_date_id_idx` ON `activity` (`category`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `activity_date_id_idx` ON `activity` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `activity_date_sms_id_idx` ON `activity` (`date`,`sms_id`);--> statement-breakpoint
CREATE INDEX `activity_category_date_sms_id_idx` ON `activity` (`category`,`date`,`sms_id`);--> statement-breakpoint
CREATE INDEX `activity_account_id_date_id_idx` ON `activity` (`account_id`,`date`,`id`);--> statement-breakpoint
CREATE TABLE `balance_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`sms_id` text NOT NULL,
	`account_id` text,
	`balance_minor_units` integer NOT NULL,
	`currency` text NOT NULL,
	`as_of` integer NOT NULL,
	`detected_bank_name` text NOT NULL,
	`detected_bank_key` text NOT NULL,
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
	CONSTRAINT "balance_readings_association_kind_check" CHECK("balance_readings"."association_kind" IN ('confirmed', 'suggested', 'unassigned')),
	CONSTRAINT "balance_readings_association_kind_account_id_check" CHECK(("balance_readings"."association_kind" = 'confirmed' AND "balance_readings"."account_id" IS NOT NULL)
       OR ("balance_readings"."association_kind" IN ('suggested', 'unassigned') AND "balance_readings"."account_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `balance_readings_account_id_as_of_id_idx` ON `balance_readings` (`account_id`,`as_of`,`id`);--> statement-breakpoint
CREATE INDEX `balance_readings_bank_key_account_as_of_id_idx` ON `balance_readings` (`detected_bank_key`,`account_id`,`as_of`,`id`);--> statement-breakpoint
CREATE TABLE `category_budgets` (
	`category` text NOT NULL,
	`currency` text NOT NULL,
	`monthly_limit_minor_units` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`category`, `currency`),
	CONSTRAINT "category_budgets_limit_check" CHECK(typeof("category_budgets"."monthly_limit_minor_units") = 'integer' AND "category_budgets"."monthly_limit_minor_units" > 0)
);
--> statement-breakpoint
CREATE TABLE `detected_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_name` text NOT NULL,
	`last4` text NOT NULL,
	`currency` text NOT NULL,
	`as_of` integer NOT NULL,
	`sender` text NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `local_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`background_sync_enabled` integer DEFAULT false NOT NULL,
	`transaction_notifications_enabled` integer DEFAULT false NOT NULL,
	`biometric_lock_enabled` integer DEFAULT false NOT NULL,
	`screen_capture_protection_enabled` integer DEFAULT false NOT NULL,
	`daily_budget_minor_units` integer,
	`last_seen_arrival_sequence` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "local_settings_boolean_values" CHECK("local_settings"."background_sync_enabled" IN (0, 1) AND "local_settings"."transaction_notifications_enabled" IN (0, 1) AND "local_settings"."biometric_lock_enabled" IN (0, 1) AND "local_settings"."screen_capture_protection_enabled" IN (0, 1)),
	CONSTRAINT "local_settings_daily_budget_check" CHECK("local_settings"."daily_budget_minor_units" IS NULL OR (typeof("local_settings"."daily_budget_minor_units") = 'integer' AND "local_settings"."daily_budget_minor_units" > 0)),
	CONSTRAINT "local_settings_arrival_cursor_check" CHECK("local_settings"."last_seen_arrival_sequence" >= 0)
);
--> statement-breakpoint
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
CREATE INDEX `mandate_events_mandate_id_date_id_idx` ON `mandate_events` (`mandate_id`,`date`,`id`);--> statement-breakpoint
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
CREATE INDEX `mandates_last_updated_mandate_id_idx` ON `mandates` (`last_updated`,`mandate_id`);--> statement-breakpoint
CREATE TABLE `projection_state` (
	`id` text PRIMARY KEY NOT NULL,
	`source_revision` integer DEFAULT 0 NOT NULL,
	`projected_revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "projection_state_revision_check" CHECK("projection_state"."source_revision" >= 0 AND "projection_state"."projected_revision" >= 0 AND "projection_state"."projected_revision" <= "projection_state"."source_revision")
);
--> statement-breakpoint
CREATE TABLE `sms_arrivals` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sms_id` text NOT NULL,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_arrivals_sms_id_idx` ON `sms_arrivals` (`sms_id`);--> statement-breakpoint
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
	`parse_revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sms_ledger_parsed_result_matches_status" CHECK(("sms_ledger"."ingestion_status" = 'parsed' AND "sms_ledger"."parsed_result" IS NOT NULL AND "sms_ledger"."ingestion_error" IS NULL) OR ("sms_ledger"."ingestion_status" = 'error' AND "sms_ledger"."parsed_result" IS NULL AND "sms_ledger"."ingestion_error" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `sms_ledger_date_idx` ON `sms_ledger` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sms_ledger_provider_id_idx` ON `sms_ledger` (`provider_id`);--> statement-breakpoint
CREATE TRIGGER `sms_ledger_parse_revision_bump` AFTER UPDATE OF `parser_version`, `parsed_result`, `ingestion_status` ON `sms_ledger`
BEGIN
	UPDATE `sms_ledger` SET `parse_revision` = OLD.`parse_revision` + 1 WHERE `id` = NEW.`id`;
END;--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text NOT NULL,
	`amount_minor_units` integer NOT NULL,
	`currency` text NOT NULL,
	`count` integer NOT NULL,
	`last_date` integer NOT NULL,
	`confidence` text NOT NULL,
	CONSTRAINT "subscriptions_confidence_check" CHECK(typeof("subscriptions"."count") = 'integer' AND (
        ("subscriptions"."confidence" = 'possible' AND "subscriptions"."count" = 2)
        OR
        ("subscriptions"."confidence" = 'likely' AND "subscriptions"."count" >= 3)
      ))
);
--> statement-breakpoint
CREATE INDEX `subscriptions_last_date_id_idx` ON `subscriptions` (`last_date`,`id`);--> statement-breakpoint
CREATE TABLE `sync_checkpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`last_ingested_date` integer,
	`last_ingested_provider_id` text,
	`initial_scan_completed_at` integer,
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
	`subcategory` text,
	`category` text NOT NULL,
	`ref` text,
	`bank_name` text,
	`date` integer NOT NULL,
	`mandate_id` text,
	`subscription_identity_key` text,
	FOREIGN KEY (`sms_id`) REFERENCES `sms_ledger`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transactions_direction_check" CHECK("transactions"."direction" IN ('income', 'expense', 'neutral'))
);
--> statement-breakpoint
CREATE INDEX `transactions_account_id_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_currency_direction_date_id_idx` ON `transactions` (`currency`,`direction`,`date`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_sms_id_idx` ON `transactions` (`sms_id`);
