import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tsc -b emits compiled copies of the tests into dist/.
    include: ["src/**/*.test.ts"],
  },
});
