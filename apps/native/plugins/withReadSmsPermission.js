// Expo config plugin: adds the Android READ_SMS permission at prebuild time.
//
// react-native-get-sms-android is a native module (predates Expo's
// dev-client/config-plugin conventions, so it doesn't ship its own plugin)
// used to read the device's existing SMS inbox for on-device parsing. This
// only affects Android — iOS has no equivalent API; no third-party app can
// read the SMS inbox on iOS, so this permission is a no-op there and the
// plugin only touches the Android manifest.
//
// READ_SMS is a "dangerous" Android permission: declaring it here makes the
// OS prompt the user at runtime (handled in lib/sms.ts via
// PermissionsAndroid.request), and also puts the app in scope for Google
// Play's SMS/Call Log permissions policy — apps requesting READ_SMS must
// have it as a core, disclosed feature to pass Play Store review.
const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const READ_SMS = "android.permission.READ_SMS";

function withReadSmsPermission(config) {
  return withAndroidManifest(config, (config) => {
    // Mutates config.modResults.manifest in place; does not return a value.
    AndroidConfig.Permissions.addPermission(config.modResults, READ_SMS);
    return config;
  });
}

module.exports = withReadSmsPermission;
