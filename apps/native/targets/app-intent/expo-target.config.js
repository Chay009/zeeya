/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "app-intent",
  name: "ZeeyaMessageImport",
  displayName: "Import Financial Message",
  bundleIdentifier: ".shortcuts",
  deploymentTarget: "17.0",
  frameworks: ["CryptoKit"],
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
