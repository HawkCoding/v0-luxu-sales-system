import { test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createQaSupabase } from "../../qa/lib/db"
import { SMOKE_STORAGE_STATE } from "./smoke.fixtures"

// Follow-up: the app scrolls inside <main> (body is overflow:hidden), so
// fullPage clips near one viewport. Here we (a) scroll the inner container to
// reveal a customer's jobs, and (b) neutralise overflow to grab true full-page
// shots of the long screens.

test.use({ storageState: SMOKE_STORAGE_STATE })

const db = createQaSupabase()
const DIR = resolve(process.cwd(), "tests/qa/screenshots/audit")
mkdirSync(DIR, { recursive: true })

const EXPAND_CSS = `
  html, body { overflow: visible !important; height: auto !important; }
  .h-svh { height: auto !important; }
  main { overflow: visible !important; height: auto !important; }
`

async function customerWithMostBookings(): Promise<string | null> {
  const { data } = await db
    .from("bookings")
    .select("customer_id")
    .not("customer_id", "is", null)
    .limit(3000)
  const counts = new Map<string, number>()
  for (const r of data ?? []) {
    const id = (r as { customer_id: string }).customer_id
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id
      bestN = n
    }
  }
  return best
}

test("customer detail with jobs", async ({ page }) => {
  const custId = await customerWithMostBookings()
  if (!custId) {
    test.info().annotations.push({ type: "note", description: "no customer with bookings" })
    return
  }
  await page.goto(`/app/customers/${custId}`)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(1500)

  // (a) Scroll the inner main container to the bottom to reveal the jobs list.
  await page.locator("main").evaluate((el) => el.scrollTo({ top: el.scrollHeight })).catch(() => undefined)
  await page.waitForTimeout(900)
  await page.screenshot({ path: resolve(DIR, "13-customer-jobs-bottom.png") }).catch(() => undefined)

  // (b) Neutralise overflow and take a true full-page shot of the whole record.
  await page.locator("main").evaluate((el) => el.scrollTo({ top: 0 })).catch(() => undefined)
  await page.addStyleTag({ content: EXPAND_CSS }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: resolve(DIR, "14-customer-full.png"), fullPage: true }).catch(() => undefined)
})

test("supplier hotel edit — full page", async ({ page }) => {
  const { data: hotel } = await db
    .from("suppliers")
    .select("slug")
    .eq("kind", "hotel_property")
    .order("name")
    .limit(1)
    .maybeSingle()
  if (!hotel?.slug) return
  await page.goto(`/app/suppliers/${hotel.slug}`)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(1200)
  await page.getByRole("button", { name: /^edit$/i }).first().click().catch(() => undefined)
  await page.waitForTimeout(1200)
  await page.addStyleTag({ content: EXPAND_CSS }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: resolve(DIR, "15-supplier-hotel-full.png"), fullPage: true }).catch(() => undefined)
})
