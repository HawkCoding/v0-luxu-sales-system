import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // qa/ and tests/qa/ are Playwright-driven (pnpm qa / the role QA suites);
    // keep vitest out of them — they import @playwright/test, not vitest.
    exclude: ["**/node_modules/**", "**/.next/**", "qa/**", "tests/qa/**"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 60,
        branches: 48,
      },
    },
  },
})
