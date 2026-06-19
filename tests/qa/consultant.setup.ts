import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import { CONSULTANT, CONSULTANT_STORAGE_STATE } from "./consultant.fixtures"

// Logs in as the seeded `consultant` user (leonie) and saves the session so the
// spec can run as a Consultant rather than the admin used by the existing suite.
async function globalSetup(): Promise<void> {
  configurePlaywrightRuntime()
  loadQaEnv()

  // Sanity-check the seeded consultant exists; fail loudly with guidance if not.
  const supabase = createQaSupabase()
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, clearance_level, is_active")
    .eq("email", CONSULTANT.email)
    .maybeSingle()
  if (error) {
    throw new Error(`Cannot read profiles (${error.message}). Is local Supabase running (pnpm db:start)?`)
  }
  if (!data || data.clearance_level !== "consultant") {
    throw new Error(
      `Seeded consultant ${CONSULTANT.email} (clearance_level=consultant) not found. ` +
        `Run \`pnpm db:reset\` to load the seed before running the Consultant QA suite.`,
    )
  }

  mkdirSync(dirname(CONSULTANT_STORAGE_STATE), { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: "http://localhost:3000" })
  try {
    let loggedIn = false
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.goto("/login")
      await page.getByLabel("Email").fill(CONSULTANT.email)
      await page.getByLabel("Password").fill(CONSULTANT.password)
      await page.getByRole("button", { name: /sign in with email/i }).click()
      loggedIn = await page
        .waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (loggedIn) break
      await page.waitForTimeout(3_000 * attempt)
    }
    if (!loggedIn) {
      throw new Error(`Failed to log in as consultant ${CONSULTANT.email}. Current URL: ${page.url()}`)
    }
    await page.context().storageState({ path: CONSULTANT_STORAGE_STATE })
  } finally {
    await browser.close()
  }
}

export default globalSetup
