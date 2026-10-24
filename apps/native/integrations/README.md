# Native integrations

Keep OS-facing integrations separate from product features. Group by OS, then
capability, so comparing the two OS folders shows the implemented differences.

```text
integrations/
  android/
    home-screen-widgets/          Expo Widgets + Compose
    notifications/                Expo SDK 58 custom notification layouts
    quick-actions/                platform entrypoint to shared implementation
  apple/
    home-screen-widgets/          Expo Widgets + SwiftUI
    lock-screen-widgets/          inline/circular/rectangular accessory widget
    notifications/                Expo Notifications sender
    quick-actions/                platform entrypoint to shared implementation
  shared/
    widgets/                      SQL snapshot + public Metro entrypoints
    notifications/                categories, tap routing, public entrypoints
    quick-actions/                action definitions + shared package lifecycle

features/share-import/           user-facing Expo Sharing review/import flow

targets/apple/                    @bacons/apple-targets native extension sources
  app-intent/
  transaction-notification/

modules/zeeya-message-queue/       native SMS/Shortcuts integration
  android/                       SMS receiver + standard fallback notice
  ios/                           existing shared message-queue bridge
```

Product screens import the integration's public entrypoint, not both platform
implementations. Metro selects `.android`/`.ios` entrypoints; shared data stays
in `shared/`. Quick-action behavior is genuinely identical and implemented only
once; the OS folders expose it without copying its logic. There is no provider
registry or generic adapter layer.

The Home Screen kind remains `ZeeyaOverviewWidget`; Lock Screen widgets now have
their own `ZeeyaLockScreenWidget` gallery entry and source folder. Existing
development installations using the former combined kind for Lock Screen may
need to re-add that widget after rebuilding. App/extension bundle IDs are unchanged.

## Which package owns what

| Feature                                                   | Implementation                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| Home Screen widgets, both platforms                       | Official `expo-widgets` and `@expo/ui`                           |
| iOS Lock Screen accessory widgets                         | Official `expo-widgets`                                          |
| Android custom notification layouts                       | Official `expo-widgets.createCustomNotification`                 |
| Notification permissions/channels/actions and iOS posting | Official `expo-notifications`                                    |
| iOS expanded custom notification UI                       | `@bacons/apple-targets` notification-content extension           |
| Existing Apple message-import App Intent                  | `@bacons/apple-targets` app-intent extension                     |
| Incoming text sharing                                     | Official `expo-sharing`; its plugin generates its own extension  |
| App-icon quick actions                                    | Community `expo-quick-actions`, not an official Expo SDK API     |
| Incoming Android SMS signals with JS stopped              | Local native BroadcastReceiver; Expo SMS cannot receive messages |

## Migration rule

### Official Expo APIs and community target packages

| Package                                                                                                     | Available capability                                                                                                    | Zeeya status                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Official `expo-widgets`](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/)                              | Android/iOS widgets, Apple Live Activities, Android custom-notification layouts                                         | Used for widgets and Android custom notifications; Live Activities are not implemented    |
| [Official `expo-app-intents`](https://docs.expo.dev/versions/v58.0.0/sdk/app-intents/)                      | Apple Siri, Shortcuts, Spotlight, and App Intents integration; app-owned Swift declarations still required              | SDK 58 option, currently alpha; not installed or migrated                                 |
| [`EvanBacon/expo-apple-targets`](https://github.com/EvanBacon/expo-apple-targets) (`@bacons/apple-targets`) | Configures native Apple extension targets, including App Intents, notification extensions, App Clips, and Watch targets | Installed; manages our App Intent and notification-content targets under `targets/apple/` |
| [`csark0812/expo-targets`](https://github.com/csark0812/expo-targets) (`expo-targets`)                      | Apple targets plus selected Android equivalents; React Native UI supported for certain extension types                  | Not installed; evaluate for an uncovered requirement, not as an automatic replacement     |

These are not interchangeable packages. The two community repositories are not
official Expo SDK modules; their supported-target lists do not mean those features
are implemented in Zeeya. Android equivalents can have different lifecycle/UI
constraints from Apple extensions, so consult each package's platform matrix.

Before migrating our existing message-import App Intent, compare official
`expo-app-intents` against its actual background execution, durable queue,
App Group, and encryption requirements. Its alpha status and app-target Swift
integration mean it is not assumed to be a drop-in replacement. Prefer it when
it demonstrably covers our requirements; otherwise retain the existing target
and record why. Do not register duplicate intents through both packages.

Prefer an official Expo SDK API when it supports the required behavior. Use
Apple Targets for Apple extensions without an equivalent Expo API. Keep local
native code only for uncovered platform behavior. Package ownership is recorded
here/in imports; it is not a second folder hierarchy parallel to features.

To migrate, change an integration's platform implementation and public entrypoint,
preserving shared props/routes. Update config-plugin ownership and remove the old
extension; do not generate two versions of the same target. For widgets update
`initialLayout` paths and regenerate layout registries. Native target source is
discovered through `@bacons/apple-targets`'s configured `root: "./targets/apple"`.
Native identifiers, categories, App Groups, and behavior remain unchanged.

## Behavior and verification

Android JS-posted financial notices have collapsed, expanded, and heads-up layouts.
Channel importance/user settings still determine whether heads-up UI appears.
The process-independent SMS receiver uses a standard NotificationCompat notice
about messages awaiting processing, not confirmed financial transactions. Do not
replace that receiver with a JS-only notification API.

iOS accessoryInline/accessoryCircular/accessoryRectangular layouts display the
same saved SQL snapshot as the Home Screen widget, not continuously live data.
Android Lock Screen widget availability depends on the OS/host. Live Activities
and Dynamic Island are not implemented; those need a defined time-bounded
start/update/end use case. Only counts/timestamps cross the current widget and
notification boundaries, not raw SMS, merchants, balances, or secrets.

Native changes require a new development build, not Expo Go or an OTA-only update.
Verify notification permission/tap/expanded states, widget gallery/Lock Screen
families, and process-dead SMS reception on actual devices. JS tests, config
introspection, and isolated runtimes do not prove native/device behavior.

Sources: [SDK 58 Widgets](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/),
[Expo Notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/),
[Apple Targets](https://github.com/EvanBacon/expo-apple-targets).
