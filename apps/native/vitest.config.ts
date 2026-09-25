import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" -> "./*" alias in tsconfig.json. Tests historically used
// relative imports only, so this never came up; a test that imports a module
// which itself uses "@/" (stores/dashboard-store.ts) needs the alias to
// resolve the same way Metro and tsc already do.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
