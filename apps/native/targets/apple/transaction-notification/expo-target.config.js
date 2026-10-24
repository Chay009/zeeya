const nativeCapabilities = require("../../../config/native-capabilities.json");

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "notification-content",
  name: "ZeeyaNotificationContent",
  displayName: "Zeeya notification",
  bundleIdentifier: ".notification-content",
  deploymentTarget: nativeCapabilities.iosDeploymentTarget,
});
