import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import { AUTH_DIR, HANDBOOK_USERS, SHOT_VIEWPORT, type HandbookRole } from "./handbook-shots.fixtures"

// Logs in as consultant, manager and admin and saves one storage state per role,
// so the capture spec can switch actor without re-authenticating each time.
async function globalSetup(): Promise<void> {
  configurePlaywrightRuntime()
  loadQaEnv()

  const supabase = createQaSupabase()
  mkdirSync(AUTH_DIR, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const role of Object.keys(HANDBOOK_USERS) as HandbookRole[]) {
      const user = HANDBOOK_USERS[role]

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, clearance_level, is_active")
        .eq("email", user.email)
        .maybeSingle()
      if (error) {
        throw new Error(`Cannot read profiles (${error.message}). Is local Supabase running (pnpm db:start)?`)
      }
      if (!data || data.clearance_level !== user.clearance) {
        throw new Error(
          `Seeded ${role} ${user.email} (clearance_level=${user.clearance}) not found. ` +
            `Run \`pnpm db:reset\` then \`pnpm db:seed:demo\` before capturing handbook screenshots.`,
        )
      }

      const page = await browser.newPage({ baseURL: "http://localhost:3000", viewport: SHOT_VIEWPORT })
      try {
        let loggedIn = false
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          await page.goto("/login")
          await page.getByLabel("Email").fill(user.email)
          await page.getByLabel("Password").fill(user.password)
          await page.getByRole("button", { name: /sign in with email/i }).click()
          loggedIn = await page
            .waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          if (loggedIn) break
          await page.waitForTimeout(3_000 * attempt)
        }
        if (!loggedIn) {
          throw new Error(`Failed to log in as ${role} ${user.email}. Current URL: ${page.url()}`)
        }
        await page.context().storageState({ path: user.storageState })
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}

export default globalSetup
