module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Lets drizzle-kit's generated .sql migration files be imported as
    // plain strings — Metro alone doesn't inline non-JS file contents.
    plugins: [
      ["inline-import", { extensions: [".sql"] }],
      // Reanimated 4 uses Worklets for UI-thread animations. Keep this last.
      "react-native-worklets/plugin",
    ],
  };
};
