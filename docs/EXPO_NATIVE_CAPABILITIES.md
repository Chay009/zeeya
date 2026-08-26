# Expo native capabilities

This document records the product and operational boundaries of Zeeya's native capability layer.

## Background SMS sync

- Uses `expo-background-task` / Android WorkManager, with a 15-minute minimum interval.
- Android chooses the actual execution time. It is periodic catch-up, not instant SMS delivery.
- Android's `SMS_RECEIVED` receiver records a durable, privacy-safe arrival signal and wakes the
  existing inbox/ledger sync while the app process is active. If the process is stopped, the signal
  is consumed on the next app/background sync; the receiver never parses or stores raw SMS text.
- Zeeya does not request battery-optimization exemption or an unrestricted background-service permission.
- The task reuses the same checkpointed, idempotent `syncInbox()` path as foreground refresh.
- It is opt-in under **Privacy & automation** and requires existing `READ_SMS` and `RECEIVE_SMS`
  permissions.

## Notifications

- Uses local `expo-notifications`; Firebase and a Zeeya notification server are not required.
- A notification is eligible only when a background sync adds a newly recognized financial transaction.
- Lock-screen content intentionally excludes amount, merchant, account, and raw SMS text.
- Remote notifications can later use Expo Push Service or another provider without changing local ingestion.

## Local privacy controls

- Biometric lock and screen-capture protection are opt-in and stored in on-device SQLite.
- Biometric lock permits the operating system's enrolled device PIN, pattern, password, or passcode
  as its fallback; Zeeya does not store a second app-specific PIN.
- Biometric results and secrets are never stored in SQLite.
- The SQLite encryption key is 256 random bits stored in `expo-secure-store` with device-only accessibility.
- Existing `zeeya.db` installations are copied transactionally to `zeeya-secure.db`; the plaintext file is
  deleted only after the secure copy succeeds.

## Updates

- The client implements the Expo Updates Protocol through `expo-updates`.
- The initial update URL is Expo's hosted endpoint for the existing project id.
- Preview and production builds are pinned to separate `preview` and `production` EAS Update channels.
- Self-hosting later means replacing `updates.url` with a server implementing the Expo Updates Protocol;
  it does not require changing application feature code.
- `runtimeVersion` follows the native app version, so an OTA bundle is never applied across incompatible
  native-module builds.

## Build boundary

This capability batch adds native modules (SQLCipher, background task, notifications, biometrics, screen
capture, Skia/Victory, and Expo Updates), so the first installation requires one new development or preview
APK. After that, compatible JavaScript-only changes can be delivered through Expo Updates without another
APK.
