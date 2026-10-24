import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/gateway.ts"],
  format: "esm",
  // Worker application entrypoints, not a published TypeScript library.
  // Type checking runs separately through check-types.
  dts: false,
  outDir: "./dist",
  clean: true,
  noExternal: [/@zeeya\/.*/],
});
