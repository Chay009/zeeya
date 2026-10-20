# Android development builds on GitHub Actions

`.github/workflows/android-development.yml` builds the existing EAS `development`
profile on an Ubuntu GitHub runner using `eas build --local`. It does not queue
a build on Expo's hosted builders. EAS cloud builds remain available unchanged.
The workflow supports manual runs and a narrowly scoped bootstrap push trigger:
changes to its own workflow file on `integration/codex-claude` start a build.
Ordinary app commits do not automatically start one. It has a 90-minute timeout
and seven-day APK retention.
GitHub Actions usage is subject to the repository's plan/minutes; this is not a
promise of free or unlimited builds or a guaranteed cure for a native crash.

## One-time repository configuration

In GitHub → Settings → Secrets and variables → Actions:

- Secret `EXPO_TOKEN`: an Expo access token for the account that can access this
  project's existing Android signing credentials. Never commit or paste it in chat.
- Variable `EXPO_PUBLIC_SERVER_URL`:
  `https://zeeya-api.chaitanyatoorubilli2409.workers.dev`.
- Variable `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`:
  `32407603488-622j8v7lcembc8aqrdb6ferqeb9hriac.apps.googleusercontent.com`.
- Optional variable `EXPO_PUBLIC_LOGO_DEV_TOKEN`: the existing client-visible logo
  service token, if needed. All `EXPO_PUBLIC_*` values are embedded in the app and
  must not contain backend credentials or an OAuth client secret.

The first three values are checked before dependency installation. Ignored local
`.env` files are not supplied by GitHub checkout. EAS secret-visibility variables
are not automatically available to local builds; this workflow supplies its own
environment explicitly.

The profile defaults to EAS-managed remote signing credentials. They must already
exist for this project before a non-interactive run. The workflow downloads them
through EAS rather than generating a replacement certificate or committing a
keystore. Compare the resulting APK certificate with the installed APK before
assuming it can update in place. Google OAuth must register that certificate's
SHA-1; the local debug fingerprint may differ from EAS signing credentials.

## Run and install

1. Commit/push this workflow and the app changes you intend to build. GitHub builds
   committed files from the selected branch, not the uncommitted files on your PC.
2. For the GitHub UI's **Run workflow** button, the workflow must also exist on the
   default branch. Merge it through the normal review process; do not change the
   default branch just to make the button appear.
3. Actions → **Android development APK** → **Run workflow**. Select the intended
   branch, such as `integration/codex-claude`.
4. Download the `zeeya-development-<commit>` artifact from the successful run,
   extract its APK, and install it over the existing development app.
5. Do not uninstall to bypass a signature mismatch: that can erase local financial
   data. Resolve signing identity/version compatibility first.
6. Start Metro with `pnpm exec expo start --max-workers 2` in `apps/native` and
   reconnect the newly installed development app.

Only the APK is uploaded, never the EAS temporary workspace, credentials, or an
entire build-log directory. Failed builds retain their normal Actions step logs.

## Toolchain and memory

Node 22, Java 17, Android API/build-tools 37, NDK 27.1.12297006, and CMake 3.22.1
match the current SDK 58 / React Native toolchain requirements in this repository.
EAS CLI is pinned to 25.2.0 and pnpm comes from the root `packageManager` field.
Gradle has a 3 GB heap, two workers, and project parallelism disabled; native CMake
parallelism is limited to two. All configured ABIs remain supported. These settings
reduce concurrent memory demand; the previous daemon crash has not yet been
reproduced or proven fixed on this runner.

References: [Expo local builds](https://docs.expo.dev/build-reference/local-builds/),
[Expo GitHub action](https://github.com/expo/expo-github-action),
[Expo SDK 58 build infrastructure](https://docs.expo.dev/build-reference/infrastructure/),
[Android SDK setup action](https://github.com/android-actions/setup-android),
[Manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
