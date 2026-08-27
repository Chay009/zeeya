const nativeCapabilities = require("../../config/native-capabilities.json");

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const configuredGroups = config.ios?.entitlements?.["com.apple.security.application-groups"];

  if (!configuredGroups?.includes(nativeCapabilities.iosAppGroup)) {
    throw new Error(
      `Zeeya App Intent requires the ${nativeCapabilities.iosAppGroup} App Group entitlement.`,
    );
  }

  return {
    type: "app-intent",
    name: nativeCapabilities.appIntent.name,
    displayName: nativeCapabilities.appIntent.displayName,
    bundleIdentifier: nativeCapabilities.appIntent.bundleIdentifierSuffix,
    deploymentTarget: nativeCapabilities.iosDeploymentTarget,
    frameworks: ["CryptoKit"],
    entitlements: {
      "com.apple.security.application-groups": configuredGroups,
    },
  };
};
