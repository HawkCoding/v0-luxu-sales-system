import { test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createQaSupabase } from "../../qa/lib/db"
import { SMOKE_STORAGE_STATE } from "./smoke.fixtures"

// Visual sweep, part 2 — the screens not yet walked, plus a dark-mode pass.
// Captures viewport shots (and a scrolled "-bottom" shot where below-fold
// content matters). QA only; no product code or data writes.

test.use({ storageState: SMOKE_STORAGE_STATE })

const db = createQaSupabase()
const DIR = resolve(process.cwd(), "tests/qa/screenshots/audit")
mkdirSync(DIR, { recursive: true })

async function cap(
  page: import("@playwright/test").Page,
  name: string,
  opts: { scroll?: boolean } = {},
): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(DIR, name) }).catch(() => undefined)
  if (opts.scroll) {
    await page.locator("main").evaluate((el) => el.scrollTo({ top: el.scrollHeight })).catch(() => undefined)
    await page.waitForTimeout(800)
    await page.screenshot({ path: resolve(DIR, name.replace(/\.png$/, "-bottom.png")) }).catch(() => undefined)
  }
}

test("16 pipeline", async ({ page }) => {
  await page.goto("/app/pipeline")
  await page.waitForTimeout(1500)
  await cap(page, "16-pipeline.png")
})

test("17 enquiries", async ({ page }) => {
  await page.goto("/app/enquiries")
  await page.waitForTimeout(1500)
  await cap(page, "17-enquiries.png")
})

test("21 booking detail (stage stepper + tabs)", async ({ page }) => {
  const { data: q } = await db
    .from("quotes")
    .select("booking_id")
    .gt("total", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  let bookingId = q?.booking_id as string | undefined
  if (!bookingId) {
    const { data: b } = await db.from("bookings").select("id").order("booking_number").limit(1).maybeSingle()
    bookingId = b?.id
  }
  if (!bookingId) return
  await page.goto(`/app/bookings/${bookingId}`)
  await page.waitForTimeout(2000)
  await cap(page, "21-booking-detail.png", { scroll: true })
})

test("22 documents", async ({ page }) => {
  await page.goto("/app/documents")
  await page.waitForTimeout(1500)
  await cap(page, "22-documents.png")
})

test("23 correspondence (emails sent)", async ({ page }) => {
  await page.goto("/app/correspondence")
  await page.waitForTimeout(1500)
  await cap(page, "23-correspondence.png")
})

test("24 reporting", async ({ page }) => {
  await page.goto("/app/reporting")
  await page.waitForTimeout(2000)
  await cap(page, "24-reporting.png", { scroll: true })
})

test("25 settings + templates", async ({ page }) => {
  await page.goto("/app/settings")
  await page.waitForTimeout(1500)
  await cap(page, "25-settings.png", { scroll: true })

  await page.goto("/app/templates")
  await page.waitForTimeout(1500)
  await cap(page, "26-templates.png")
})

test("27 dark mode", async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: "http://localhost:3000",
    storageState: SMOKE_STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
  })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("theme", "dark")
    } catch {
      /* ignore */
    }
  })
  const page = await ctx.newPage()
  try {
    await page.goto("/app")
    await page.getByText("Open Jobs").first().waitFor({ timeout: 60_000 }).catch(() => undefined)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: resolve(DIR, "27-dark-dashboard.png") }).catch(() => undefined)

    await page.goto("/app/suppliers")
    await page.waitForTimeout(1500)
    await page.screenshot({ path: resolve(DIR, "28-dark-suppliers.png") }).catch(() => undefined)

    await page.goto("/app/bookings")
    await page.waitForTimeout(1500)
    await page.screenshot({ path: resolve(DIR, "29-dark-bookings.png") }).catch(() => undefined)
  } finally {
    await ctx.close()
  }
})
