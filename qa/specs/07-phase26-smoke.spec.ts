import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { createQaSupabase } from "../lib/db"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"

test.use({ storageState: ADMIN_STORAGE_STATE })
test.setTimeout(120_000)

// Phase 26 smoke spec covers the three remaining test-plan items from the PR:
//   A — audit log entry appears in the DB after changing a setting via the UI
//   B — rate-card overlap API correctly rejects overlapping / contained ranges
//       and accepts adjacent ranges (boundary cases)
//   C — supplier detail view loads without regressions

// ---------------------------------------------------------------------------
// Test A — Audit log entry after settings change
// ---------------------------------------------------------------------------

test("07-phase26: A — audit log entry created after deposit setting change", async ({
  page,
  baseURL,
}) => {
  const report = new ReportBuilder(
    "07-phase26-A-audit-log",
    "Phase 26 Smoke A — Audit log on setting change",
  )
  const diagnostics = attachBrowserDiagnostics(page)
  report.setEnvironment({ baseURL, surface: "/app/settings" })

  const SETTING_KEY = "default_deposit_percentage"
  const supabase = createQaSupabase()

  const { data: originalSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle()
  const originalValue = originalSetting?.value ?? "25"
  const newValue = originalValue === "25" ? "30" : "25"

  const beforeTime = new Date().toISOString()

  try {
    await page.goto("/app/settings")
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible({ timeout: 15_000 })

    const depositInput = page.locator("#default-deposit-percentage")
    await depositInput.fill(newValue)

    // Save button sits in the same flex row as the deposit input
    // input › div.relative.flex-1 › div.flex.gap-2 › button
    const saveBtn = depositInput.locator("xpath=../../button")
    await saveBtn.click()

    await expect(page.getByText(/Default deposit percentage saved/i)).toBeVisible({
      timeout: 10_000,
    })

    report.step("Changed deposit % via UI and saw success toast", {
      status: "pass",
      screenshot: await report.screenshot(page, "deposit-saved-toast"),
      evidence: { from: originalValue, to: newValue },
    })

    // Verify an audit log row was written
    const { data: logs, error: logsError } = await supabase
      .from("audit_logs")
      .select("id, actor, action, entity_id, entity_type, after_json, created_at")
      .eq("entity_id", "deposit")
      .eq("action", "settings_changed")
      .gte("created_at", beforeTime)
      .order("created_at", { ascending: false })
      .limit(5)

    expect(logsError).toBeNull()
    expect((logs ?? []).length).toBeGreaterThan(0)

    const log = (logs ?? [])[0]
    const afterJson = log.after_json as Record<string, unknown>
    expect(afterJson?.defaultDepositPercentage).toBe(Number(newValue))

    report.step("Audit log row confirmed in database with correct after_json", {
      status: "pass",
      evidence: { logId: log.id, actor: log.actor, after: log.after_json },
    })
  } finally {
    // Restore original setting to avoid side effects on other tests
    await supabase
      .from("app_settings")
      .upsert({ key: SETTING_KEY, value: originalValue, updated_at: new Date().toISOString() })

    report.step("Captured browser diagnostics", {
      status:
        diagnostics.consoleErrors.length === 0 && diagnostics.failedResponses.length === 0
          ? "pass"
          : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})

// ---------------------------------------------------------------------------
// Test B — Rate-card overlap API boundary cases
// ---------------------------------------------------------------------------

test("07-phase26: B — rate-card overlap detection covers overlapping, adjacent, and contained ranges", async ({
  page,
  baseURL,
}) => {
  const report = new ReportBuilder(
    "07-phase26-B-overlap",
    "Phase 26 Smoke B — Rate-card overlap boundary cases",
  )
  const diagnostics = attachBrowserDiagnostics(page)
  report.setEnvironment({ baseURL })

  const supabase = createQaSupabase()

  const { data: rateType, error: rateTypeError } = await supabase
    .from("rate_types")
    .select("id")
    .eq("is_default", true)
    .is("archived_at", null)
    .single()
  if (rateTypeError || !rateType) {
    throw new Error(`Could not fetch default rate type: ${rateTypeError?.message}`)
  }
  const rateTypeId = rateType.id

  const supplierId = randomUUID()
  const supplierSlug = `qa-overlap-${Date.now()}`
  const routeId = randomUUID()
  const suiteTypeId = randomUUID()

  await supabase.from("suppliers").insert({
    id: supplierId,
    slug: supplierSlug,
    name: `QA Overlap ${Date.now()}`,
    kind: "hotel_property",
    active: true,
  })

  await supabase.from("routes").insert({
    id: routeId,
    supplier_id: supplierId,
    name: "QA Route",
    active: true,
    direction_mode: "one_way",
  })

  await supabase.from("suite_types").insert({
    id: suiteTypeId,
    supplier_id: supplierId,
    name: "QA Suite",
    active: true,
    sort_order: 0,
  })

  const basePayload = {
    name: "QA Overlap Test",
    kind: "hotel_property",
    email: "",
    phone: "",
    website: "",
    location: "",
    notes: "",
    singleSupplementPct: 0,
    active: true,
    emails: [],
    suiteTypes: [{ id: suiteTypeId, name: "QA Suite", active: true, sortOrder: 0 }],
    bedroomTypes: [],
    bedroomLayouts: [],
    bathroomTypes: [],
  }

  function rateCard(validFrom: string, validTo: string | null) {
    return {
      routeId,
      suiteTypeId,
      rateTypeId,
      pricePerPerson: 1000,
      childPrice: null,
      infantPrice: null,
      currency: "ZAR",
      validFrom,
      validTo,
    }
  }

  function routeWith(cards: ReturnType<typeof rateCard>[]) {
    return [{ id: routeId, name: "QA Route", active: true, directionMode: "one_way", rateCards: cards }]
  }

  try {
    // Case 1: Overlapping ranges (2026-01-01..06-30 and 2026-03-01..12-31 share Mar–Jun)
    const overlapResp = await page.request.patch(`/api/suppliers/${supplierSlug}`, {
      data: {
        ...basePayload,
        routes: routeWith([
          rateCard("2026-01-01", "2026-06-30"),
          rateCard("2026-03-01", "2026-12-31"),
        ]),
      },
    })
    expect(overlapResp.status()).toBe(409)
    const overlapBody = await overlapResp.json() as { error: string }
    expect(overlapBody.error).toMatch(/[Oo]verlapping/)
    report.step("Overlapping ranges → 409 with overlap message", {
      status: "pass",
      evidence: { httpStatus: overlapResp.status(), error: overlapBody.error },
    })

    // Case 2: Adjacent ranges (2026-01-01..06-30 and 2026-07-01..12-31 — no shared day)
    const adjacentResp = await page.request.patch(`/api/suppliers/${supplierSlug}`, {
      data: {
        ...basePayload,
        routes: routeWith([
          rateCard("2026-01-01", "2026-06-30"),
          rateCard("2026-07-01", "2026-12-31"),
        ]),
      },
    })
    expect(adjacentResp.status()).toBe(200)
    report.step("Adjacent non-overlapping ranges → 200 accepted", {
      status: "pass",
      evidence: { httpStatus: adjacentResp.status() },
    })

    // Case 3: Contained range (2026-03-01..06-30 is entirely inside 2026-01-01..12-31)
    const containedResp = await page.request.patch(`/api/suppliers/${supplierSlug}`, {
      data: {
        ...basePayload,
        routes: routeWith([
          rateCard("2026-01-01", "2026-12-31"),
          rateCard("2026-03-01", "2026-06-30"),
        ]),
      },
    })
    expect(containedResp.status()).toBe(409)
    const containedBody = await containedResp.json() as { error: string }
    expect(containedBody.error).toMatch(/[Oo]verlapping/)
    report.step("Contained range → 409 with overlap message", {
      status: "pass",
      evidence: { httpStatus: containedResp.status(), error: containedBody.error },
    })
  } finally {
    await supabase.from("rate_cards").delete().eq("route_id", routeId)
    await supabase.from("routes").delete().eq("id", routeId)
    await supabase.from("suite_types").delete().eq("id", suiteTypeId)
    await supabase.from("suppliers").delete().eq("id", supplierId)

    report.step("Captured browser diagnostics", {
      status: diagnostics.consoleErrors.length === 0 ? "pass" : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})

// ---------------------------------------------------------------------------
// Test C — Supplier detail view smoke (regression check)
// ---------------------------------------------------------------------------

test("07-phase26: C — supplier detail view loads without regressions", async ({
  page,
  baseURL,
}) => {
  const report = new ReportBuilder(
    "07-phase26-C-supplier-smoke",
    "Phase 26 Smoke C — Supplier detail view regression check",
  )
  const diagnostics = attachBrowserDiagnostics(page)
  report.setEnvironment({ baseURL, surface: "/app/suppliers/rovos-rail" })

  try {
    await page.goto("/app/suppliers/rovos-rail")

    // The supplier heading must be visible
    await expect(page.getByRole("heading", { name: /Rovos Rail/i }).first()).toBeVisible({
      timeout: 20_000,
    })

    // Rate card section or tabs should render
    await expect(page.getByText(/Rate Cards?/i).first()).toBeVisible({ timeout: 10_000 })

    // No 404 / error heading
    expect(await page.getByRole("heading", { name: /not found|404/i }).count()).toBe(0)

    const screenshot = await report.screenshot(page, "supplier-detail")
    report.step("Supplier detail page renders heading and rate cards section", {
      status: "pass",
      screenshot,
      evidence: { url: page.url() },
    })

    // Any 4xx/5xx on the page is a regression signal; filter acceptable noise
    const criticalFailures = diagnostics.failedResponses.filter(
      (r) => !r.includes("/email-preview"),
    )
    if (criticalFailures.length > 0) {
      report.step("Unexpected network failures detected", {
        status: "warn",
        evidence: { failures: criticalFailures },
      })
    } else {
      report.step("No critical network failures", { status: "pass" })
    }

    expect(criticalFailures).toHaveLength(0)
  } finally {
    report.step("Captured browser diagnostics", {
      status:
        diagnostics.consoleErrors.length === 0 && diagnostics.failedResponses.length === 0
          ? "pass"
          : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})
