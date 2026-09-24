import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    // Display formatting is pinned to Africa/Johannesburg (lib/date-format.ts). Pinning the process
    // to UTC keeps those assertions identical on CI and on a SAST dev machine.
    env: { TZ: "UTC" },
    setupFiles: ["./vitest.setup.ts"],
    // qa/ and tests/qa/ are Playwright-driven (pnpm qa / the role QA suites);
    // keep vitest out of them — they import @playwright/test, not vitest.
    // .claude/ holds agent worktrees (.claude/worktrees/*): stale copies of the repo whose tests
    // resolve against missing node_modules and fail by the hundred.
    exclude: ["**/node_modules/**", "**/.next/**", "qa/**", "tests/qa/**", ".claude/**"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 60,
        branches: 48,
      },
    },
  },
})
