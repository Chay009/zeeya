CREATE TABLE `local_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`background_sync_enabled` integer DEFAULT false NOT NULL,
	`transaction_notifications_enabled` integer DEFAULT false NOT NULL,
	`biometric_lock_enabled` integer DEFAULT false NOT NULL,
	`screen_capture_protection_enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "local_settings_boolean_values" CHECK("local_settings"."background_sync_enabled" IN (0, 1) AND "local_settings"."transaction_notifications_enabled" IN (0, 1) AND "local_settings"."biometric_lock_enabled" IN (0, 1) AND "local_settings"."screen_capture_protection_enabled" IN (0, 1))
);
