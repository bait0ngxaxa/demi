import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

// Opt-in measurements on the disposable integration database (`npm run test:benchmark -- <path>`); not a CI gate.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/benchmarks/**/*.benchmark.test.ts"],
    globalSetup: ["./tests/integration/database-isolation.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 30 * 60 * 1000,
  },
});
