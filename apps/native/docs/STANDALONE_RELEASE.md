# Standalone Android release

## Build

The `Android APK` GitHub workflow builds the `preview` EAS profile by default.
It embeds the JS bundle and does not need Metro, a QR code, or an Expo development
server. `development` remains an explicit workflow option for debugging.
The release uses the existing application ID and EAS signing credentials. An
in-place update also requires the installed app's signing certificate to match;
a locally signed debug installation may differ. Do not uninstall or clear
storage as a troubleshooting step if Android rejects the update.

## Included product paths

- Optional native Google/Apple identity through Better Auth, with visible network,
  configuration, and action errors. Cloud identity deletion uses Better Auth's
  fresh-session checks and does not delete local financial records.
- One-time first-run setup, persisted in SecureStore; local/offline use does not
  require login or SMS permission. SMS and notification prompts are user initiated.
- Existing SQL-backed Home, transactions, analytics, accounts, subscriptions,
  budgets, and detail views. Currency/filter changes do not reuse an unrelated
  scope's monetary values while the new query loads.
- Android Home Screen widget; iOS Home Screen and accessory Lock Screen widgets.
  Only saved counts and refresh time leave the main app through these widgets.
- Android expanded/collapsed custom transaction notifications; iOS notification
  category/content extension; notification taps open transactions.
- App-icon shortcuts and incoming plain-text sharing with a review-before-import
  screen. Setup instructions live in Privacy & automation.
- Privacy settings fail closed when their persisted policy cannot be read.
  Foreground SMS monitoring re-checks permission after connecting an inbox.

## Verification boundary

Typechecks, JS tests, production JS export, config inspection, and signed APK
compilation are separate checks. None substitutes for testing the installed APK
on a device. In particular verify:

1. Fresh install: setup once, skip sign-in/permissions, then reopen without setup.
2. Existing install: update in place; accounts, messages, budgets remain intact.
3. Connect inbox: initial import, then receive an SMS without leaving the app.
4. Background/terminated delivery, notification permission, expand, and tap.
5. Add Zeeya from the launcher widget picker; reopen the app after an import and
   confirm the saved widget overview refreshes. Long-press its app icon too.
6. Switch analytics/Home currencies and filters while reads are in flight.
7. Biometric lock on resume; cancelled authentication must not reveal finances.
8. Google sign-in, sign-out, and account deletion (including stale-session retry).

Google must have an Android OAuth registration for the **APK's actual signing
certificate**, not just the local debug certificate. iOS builds still require
Apple team/signing setup and the corresponding enabled identity providers.
No device/emulator validation is implied by a successful CI build.

This release does not add financial cloud sync, billing, Live Activities, App
Clips, iMessage, or an autonomous background widget refresh service. Those are
not hidden behind placeholder UI; their requirements/platform setup remain
separate from this Android release.

## Verified build

- Source commit: `bee900c67789d77f2fe83d818235eeb9894f15a0`.
- [Successful standalone APK build](https://github.com/Chay009/zeeya/actions/runs/40095541094).
- [APK and signing certificate artifact](https://github.com/Chay009/zeeya/actions/runs/40095541094/artifacts/12562241310).
- CI verified APK v2 signing, an embedded `assets/index.android.bundle`, and
  absence of the debuggable manifest flag.
- Package: `com.anonymous.zeeya`.
- Release SHA-1: `83:10:86:C3:9F:49:55:93:52:92:6C:61:B9:7B:37:B1:4A:E3:D9:A4`.
- Release SHA-256: `65:A4:2C:88:8B:6C:22:29:14:CA:BE:90:DD:EC:CE:6F:24:72:B1:C6:F3:E8:C7:C6:99:35:DA:01:39:AC:92:6E`.

Register this package/SHA-1 pair as an Android OAuth client in the same Google
project as the configured Web client ID if it is not already registered. The
local debug certificate previously used during setup is different; registration
for that certificate alone does not authorize this release APK. Google Console
registration and signed-in device testing were not verified by CI.

Local verification: 762 native tests passed (two DST-dependent tests skipped in
IST and covered separately by the 48/48 DST run), plus 18 API/server/auth-migration
tests. Native TypeScript, formatting, lint, production JS export, and native
configuration inspection passed. The backend's built-in deletion configuration
was deployed; anonymous deletion requests correctly return 401.
