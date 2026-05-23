import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // qa/specs/ is Playwright-driven (pnpm qa); keep vitest out of it.
    exclude: ["**/node_modules/**", "**/.next/**", "qa/**"],
  },
})
