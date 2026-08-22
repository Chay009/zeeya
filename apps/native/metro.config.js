const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
// Alchemy writes runtime state here; block it to avoid Metro refresh loops.
const blockList = config.resolver.blockList ?? [];
const blockListPatterns = Array.isArray(blockList) ? blockList : [blockList];

config.resolver.blockList = [
  ...blockListPatterns,
  /[/\\]packages[/\\]infra[/\\]\.alchemy(?:[/\\]|$)/,
];

// drizzle-kit generates .sql migration files; Metro needs to know they're
// bundleable source (babel.config.js's inline-import plugin then turns each
// into a plain string import).
config.resolver.sourceExts.push("sql");

const uniwindConfig = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});

module.exports = uniwindConfig;
