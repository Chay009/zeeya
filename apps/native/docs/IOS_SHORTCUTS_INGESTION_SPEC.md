# iOS Shortcuts message ingestion

GitHub issue title: `feat(ios): ingest financial messages through Apple Shortcuts`

> The GitHub connector returned `403 Resource not accessible by integration` when this issue was created. This document is the durable source until repository issue-write access is enabled.

## Problem Statement

Zeeya's parser, ledger, dashboard, privacy controls, and insights are shared React Native features, but financial-message capture is Android-only because iOS does not expose an SMS inbox API. iPhone users need a supported way to send newly received financial messages into the same local-first pipeline without uploading message content, duplicating parser logic, or maintaining a hand-edited generated Xcode project.

## Solution

Add an Apple Shortcuts/App Intent capture adapter alongside the existing Android inbox adapter. A user creates a Personal Automation for incoming Messages and passes the message content and sender to Zeeya's “Import Financial Message” action. The App Intent stores an immutable pending-message envelope in an App Group queue. When Zeeya opens or returns to the foreground, a local Expo native module drains that queue through the existing idempotent SMS ledger and Malana parser.

Android continues direct SMS inbox/checkpoint synchronization. Its manifest receiver records a
privacy-safe arrival signal so the existing inbox/ledger sync can catch up while the process is
active; it never parses or stores broadcast payloads. Both platforms converge at the shared
ingestion boundary and use the same parser, bank/account model, transactions, balances,
subscriptions, categories, privacy settings, and UI.

## User Stories

1. As an Android user, I want direct permitted SMS ingestion to keep working without regressions.
2. As an iPhone user, I want an “Import Financial Message” Shortcuts action so incoming bank messages can reach Zeeya despite iOS inbox restrictions.
3. As an iPhone user, I want clear one-time Personal Automation setup instructions.
4. As an iPhone user, I want content, sender, and received date preserved for parsing and attribution.
5. As a privacy-conscious user, I want captured content to stay on my device.
6. As a user, I want repeated delivery of the same resolved Shortcut action input to be harmless.
7. As a user, I want pending messages to survive app termination.
8. As a user, I want acknowledgement only after ledger ingestion succeeds.
9. As an iPhone user, I want Zeeya to drain captured messages on launch and foreground.
10. As an iPhone user, I want the normal dashboard instead of an Android-only unsupported state.
11. As an iPhone user, I want historical-backfill limitations stated honestly.
12. As an iPhone user, I want native biometric and app-switcher privacy behavior.
13. As a user, I want settings to show only capabilities relevant to my platform.
14. As a maintainer, I want platform capture isolated behind adapters.
15. As a maintainer, I want Expo CNG/config-plugin integration rather than edits to generated native folders.
16. As a maintainer, I want versioned, malformed-entry-safe queue envelopes.
17. As a release engineer, I want bundle, App Group, Face ID, and extension identifiers declared reproducibly.

## Implementation Decisions

- One device-message sync boundary feeds the existing ledger. Android uses inbox/checkpoint sync; iOS drains Shortcut envelopes.
- Malana remains shared TypeScript. Swift only durably queues and exposes messages.
- Each iOS envelope is one atomically written JSON file in App Group `group.com.anonymous.zeeya`.
- A required `Received At` Shortcut input participates in the delivery ID, so the same resolved action input is idempotent while genuinely repeated content at a different time stays distinct. A protected 24-hour receipt avoids needless re-queueing; the ledger ID remains the final deduplication boundary after receipt expiry.
- The local Expo module lists pending envelopes and acknowledges them after successful ledger ingestion.
- Malformed or future-version envelopes are removed from the active queue after retaining only a privacy-safe file name and validation reason; raw rejected payloads are not retained.
- Shortcut provider IDs derive from queue IDs; iOS ingestion never advances Android's inbox checkpoint.
- Queue delivery is at-least-once; existing fingerprint/provider-ID uniqueness makes ledger effects idempotent.
- The App Intent target is generated through Expo CNG using an extension config plugin. Generated `ios/` contents are not the source of truth.
- Bundle ID is `com.anonymous.zeeya`; the extension uses a derived bundle ID.
- iOS UI explains the required user-created Personal Automation and can open Shortcuts. The app cannot install the automation itself.
- Queue draining is mounted at the native app root and runs at launch/foreground regardless of which route is open; dashboard focus and pull-to-refresh still refresh visible state.
- Periodic background processing uses the same Expo BackgroundTask adapter on Android and iOS. Android reads the inbox; iOS drains the Shortcuts queue. OS scheduling remains best-effort.
- Face ID copy and App Group entitlements live in Expo config. iOS app-switcher protection complements screen-capture protection.
- Both the main Expo app and App Intent extension target iOS 17, configured through Expo CNG rather than generated Xcode edits.

## Testing Decisions

- Test through the public iOS queue-drain operation and existing dashboard/ledger behavior, not native file internals.
- Cover sender/body/date preservation, acknowledgement-after-success, repeated-envelope deduplication, malformed entry isolation, and no Android checkpoint advancement.
- Preserve all Android sync/backfill tests.
- Test platform policy separately from React Native components where appropriate.
- Validate Expo config/target metadata, Expo Doctor/config checks, native and parser suites, TypeScript, lint/format, and web export.
- Windows cannot compile Swift/Xcode targets; an EAS iOS development build is the final native compile/signing verification.

## Out of Scope

- Historical iOS Messages access or silent Personal Automation installation.
- Reimplementing Malana in Swift.
- Raw-SMS server upload, category redesign, or unrelated normalized-table optimization.

## Further Notes

Apple permits Message Personal Automations to run automatically after user setup, and App Intents can execute in the background. The intent intentionally performs only a durable local queue write; parsing remains in the shared JS application pipeline.

Apple Shortcuts exposes message content and sender to this action but no stable Messages database event identifier. Zeeya therefore requires the automation to pass `Current Date` as `Received At` and treats a later full automation re-execution as a new delivery. It deliberately does not deduplicate solely by sender and body because two genuine identical financial messages would otherwise be silently merged. Repeated execution with the same already-resolved inputs remains idempotent.

Before the first iOS EAS build, set `expo.ios.appleTeamId` to the real 10-character Apple Developer Team ID. It is a signing credential identifier and must not be guessed or replaced with a placeholder. Expo config resolution and Doctor can be validated on Windows; Xcode target generation and Swift compilation require macOS/EAS.
