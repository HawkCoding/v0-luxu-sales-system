import { test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createQaSupabase } from "../../qa/lib/db"
import { SMOKE_STORAGE_STATE } from "./smoke.fixtures"

// Visual UI/UX audit — walks the flows the stakeholder asked about and captures
// full-page screenshots into tests/qa/screenshots/audit/. Acting as QA only.

test.use({ storageState: SMOKE_STORAGE_STATE })

const db = createQaSupabase()
const DIR = resolve(process.cwd(), "tests/qa/screenshots/audit")
mkdirSync(DIR, { recursive: true })

async function shot(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.waitForTimeout(900)
  await page.screenshot({ path: resolve(DIR, name), fullPage: true }).catch(() => undefined)
}

test("01 dashboard", async ({ page }) => {
  await page.goto("/app")
  await page.getByText("Open Jobs").first().waitFor({ timeout: 60_000 }).catch(() => undefined)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await shot(page, "01-dashboard.png")
})

test("02 suppliers list + create dialog", async ({ page }) => {
  await page.goto("/app/suppliers")
  await page.getByRole("heading", { name: "Suppliers" }).waitFor({ timeout: 60_000 }).catch(() => undefined)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await shot(page, "02-suppliers-list.png")

  await page.getByRole("button", { name: /add supplier/i }).first().click().catch(() => undefined)
  await page.getByRole("dialog").waitFor({ timeout: 10_000 }).catch(() => undefined)
  await shot(page, "03-add-supplier-dialog.png")

  // Open the Category select to show the supplier kinds.
  await page.getByRole("combobox").first().click().catch(() => undefined)
  await page.waitForTimeout(500)
  await shot(page, "04-add-supplier-category.png")
})

test("05 hotel supplier detail (view + edit)", async ({ page }) => {
  const { data: hotel } = await db
    .from("suppliers")
    .select("slug,name,kind,status")
    .eq("kind", "hotel_property")
    .order("name")
    .limit(1)
    .maybeSingle()

  let slug = hotel?.slug
  let label = hotel ? `${hotel.name} (hotel)` : ""
  if (!slug) {
    const { data: anySup } = await db.from("suppliers").select("slug,name,kind").limit(1).maybeSingle()
    slug = anySup?.slug
    label = anySup ? `${anySup.name} (${anySup.kind})` : ""
  }
  if (!slug) {
    test.info().annotations.push({ type: "note", description: "No supplier found" })
    return
  }
  test.info().annotations.push({ type: "subject", description: label })

  await page.goto(`/app/suppliers/${slug}`)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(1500)
  await shot(page, "05-supplier-view.png")

  // Enter edit mode to expose the routes/direction + suite-vocabulary editors.
  await page.getByRole("button", { name: /^edit$/i }).first().click().catch(() => undefined)
  await page.waitForTimeout(1200)
  await shot(page, "06-supplier-edit.png")

  // Try to add a route/meal-plan so the Direction (One way/Round trip/Loop) field shows.
  const addRoute = page
    .getByRole("button", { name: /add (meal plan|route|service|rental route|itinerary|tour)/i })
    .first()
  if (await addRoute.isVisible().catch(() => false)) {
    await addRoute.scrollIntoViewIfNeeded().catch(() => undefined)
    await addRoute.click().catch(() => undefined)
    await page.waitForTimeout(900)
    await shot(page, "07-supplier-edit-route.png")
  }
})

test("08 customers list + customer's jobs", async ({ page }) => {
  await page.goto("/app/customers")
  await page.getByRole("heading", { name: "Customers" }).waitFor({ timeout: 60_000 }).catch(() => undefined)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(1000)
  await shot(page, "08-customers-list.png")

  const { data: bk } = await db
    .from("bookings")
    .select("customer_id")
    .not("customer_id", "is", null)
    .limit(1)
    .maybeSingle()
  const custId = bk?.customer_id
  if (custId) {
    await page.goto(`/app/customers/${custId}`)
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await page.waitForTimeout(1500)
    await shot(page, "09-customer-detail.png")
  }
})

test("10 bookings list", async ({ page }) => {
  await page.goto("/app/bookings")
  await page.getByRole("heading", { name: "Bookings" }).waitFor({ timeout: 60_000 }).catch(() => undefined)
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(1000)
  await shot(page, "10-bookings-list.png")
})

test("11 mobile dashboard + nav", async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: "http://localhost:3000",
    storageState: SMOKE_STORAGE_STATE,
    viewport: { width: 390, height: 844 },
  })
  const page = await ctx.newPage()
  try {
    await page.goto("/app")
    await page.getByText("Open Jobs").first().waitFor({ timeout: 60_000 }).catch(() => undefined)
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await page.waitForTimeout(900)
    await page.screenshot({ path: resolve(DIR, "11-mobile-dashboard.png"), fullPage: true }).catch(() => undefined)

    await page.getByRole("button", { name: /open navigation menu/i }).click().catch(() => undefined)
    await page.waitForTimeout(700)
    await page.screenshot({ path: resolve(DIR, "12-mobile-nav.png"), fullPage: true }).catch(() => undefined)
  } finally {
    await ctx.close()
  }
})
