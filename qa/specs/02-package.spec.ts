import { expect, test, type Page } from "@playwright/test"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { createQaSupabase } from "../lib/db"
import {
  fillBuffered,
  fillNumericField,
  labeledInput,
  saveAndWaitFor,
} from "../lib/forms"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"
import { readRunState, writeRunState } from "../lib/run-state"
import { selectors } from "../lib/selectors"
import { QA_RUN } from "../lib/test-data"

test.use({ storageState: ADMIN_STORAGE_STATE })

async function cleanupPackageFixture(): Promise<void> {
  const supabase = createQaSupabase()
  const { data: existing, error } = await supabase
    .from("packages")
    .select("id")
    .eq("name", QA_RUN.package.name)

  if (error) {
    throw new Error(`Failed to inspect existing QA packages: ${error.message}`)
  }

  const ids = (existing ?? []).map((pkg) => pkg.id)
  if (ids.length === 0) {
    return
  }

  const { data: legRows } = await supabase
    .from("package_legs")
    .select("id")
    .in("package_id", ids)
  const legIds = (legRows ?? []).map((leg) => leg.id)

  if (legIds.length > 0) {
    await supabase.from("package_leg_routes").delete().in("package_leg_id", legIds)
  }
  await supabase.from("package_legs").delete().in("package_id", ids)
  const { error: deleteError } = await supabase.from("packages").delete().in("id", ids)
  if (deleteError) {
    throw new Error(`Failed to delete existing QA packages: ${deleteError.message}`)
  }
}

async function getPackageDbEvidence(
  slug: string,
  supplierId: string,
): Promise<Record<string, unknown>> {
  const supabase = createQaSupabase()
  const { data: pkg, error: pkgError } = await supabase
    .from("packages")
    .select(
      "id, slug, name, description, duration_nights, currency, single_supplement_pct, fixed_price_per_person, active",
    )
    .eq("slug", slug)
    .single()

  if (pkgError || !pkg) {
    throw new Error(pkgError?.message ?? "Package was not found in DB")
  }

  const { data: legs } = await supabase
    .from("package_legs")
    .select("id, supplier_id, label, sort_order")
    .eq("package_id", pkg.id)

  const legIds = (legs ?? []).map((leg) => leg.id)
  const { data: legRoutes } = legIds.length
    ? await supabase
        .from("package_leg_routes")
        .select("package_leg_id, route_id")
        .in("package_leg_id", legIds)
    : { data: [] as Array<{ package_leg_id: string; route_id: string }> }

  return {
    package: pkg,
    legs: legs ?? [],
    legRoutes: legRoutes ?? [],
    legLinksToSupplier: (legs ?? []).some((leg) => leg.supplier_id === supplierId),
  }
}

async function gotoWizardStep(page: Page, stepLabel: RegExp): Promise<void> {
  await page.getByRole("button", { name: stepLabel }).first().click()
}

test("02-package creates package via wizard and verifies persistence", async ({ page, baseURL }) => {
  const report = new ReportBuilder("02-package", "Phase 2 Package Creation QA")
  const diagnostics = attachBrowserDiagnostics(page)
  const runState = readRunState()
  const pkgFixture = QA_RUN.package
  const supplierFixture = QA_RUN.supplier

  report.setGoal(
    "Create a package through the package wizard using the Phase 1 supplier, verify persistence on detail page, toggle active state, and confirm database rows.",
  )
  report.setEnvironment({
    baseURL,
    user: "carmen@luxustravel.co.za",
    storageState: ADMIN_STORAGE_STATE,
    phase1SupplierFromRunState: runState.supplier ?? null,
  })

  if (!runState.supplier?.id || !runState.supplier?.slug) {
    report.step("Phase 2 BLOCKED on Phase 1", {
      status: "fail",
      notes: [
        "qa/.run-state.json is missing the supplier id/slug populated by Phase 1.",
        "Run Phase 1 (qa/specs/01-supplier.spec.ts) successfully before Phase 2.",
      ],
    })
    report.write()
    test.skip(true, "Phase 1 supplier missing from qa/.run-state.json")
    return
  }

  const supplierId = runState.supplier.id
  let packageSlug: string | null = null
  let packageId: string | null = null

  try {
    await cleanupPackageFixture()

    await page.goto("/app/packages")
    await expect(page.getByRole("heading", { name: selectors.packages.pageHeading })).toBeVisible()
    report.step("Opened packages page", {
      screenshot: await report.screenshot(page, "packages-page"),
      evidence: { url: page.url() },
    })

    await page.getByRole("button", { name: selectors.packages.newPackageButton }).first().click()
    const wizard = page.getByRole("dialog").filter({ hasText: "New package" })
    await expect(wizard).toBeVisible()
    report.step("Opened package wizard (Step 1: Details)", {
      screenshot: await report.screenshot(page, "wizard-step-1-open"),
    })

    // Step 1 — Details
    // Note: wizard form fields are not htmlFor-associated to their labels (a11y gap).
    await fillBuffered(labeledInput(wizard, "Name"), pkgFixture.name)
    await fillNumericField(wizard, "Duration nights", pkgFixture.durationNights)
    await fillNumericField(wizard, "Single supplement %", pkgFixture.singleSupplementPct)
    await fillNumericField(
      wizard,
      "Fixed price per person (optional)",
      pkgFixture.fixedPricePerPerson,
    )
    report.step("Filled Step 1 details (name, duration, supplement %, fixed price)", {
      screenshot: await report.screenshot(page, "wizard-step-1-filled"),
      evidence: {
        name: pkgFixture.name,
        durationNights: pkgFixture.durationNights,
        currency: pkgFixture.currency,
        singleSupplementPct: pkgFixture.singleSupplementPct,
        fixedPricePerPerson: pkgFixture.fixedPricePerPerson,
      },
    })

    // Step 2 — Add Legs
    await gotoWizardStep(page, /2\. Add Legs/i)
    await expect(wizard.getByText(/Add legs/i).first()).toBeVisible()
    report.step("Navigated to Step 2: Add Legs", {
      screenshot: await report.screenshot(page, "wizard-step-2-open"),
    })

    const supplierSelectTrigger = wizard.getByRole("combobox").filter({ hasText: /Select supplier/i })
    await supplierSelectTrigger.click()
    const supplierOption = page.getByRole("option", { name: supplierFixture.name })
    const supplierVisible = await supplierOption.isVisible().catch(() => false)
    if (!supplierVisible) {
      report.step("Phase 1 supplier not present in wizard supplier dropdown", {
        status: "fail",
        screenshot: await report.screenshot(page, "supplier-dropdown-missing"),
        notes: [
          `Expected to find supplier "${supplierFixture.name}" (kind=train_operator) in dropdown.`,
          "Sev-1 gap: package wizard cannot reach the freshly-created supplier.",
        ],
      })
      throw new Error("Phase 1 supplier missing from package wizard dropdown")
    }
    await supplierOption.click()
    await wizard.getByRole("button", { name: /^Add leg$/i }).click()
    await expect(wizard.getByText(supplierFixture.name).first()).toBeVisible()
    report.step("Added a leg referencing the Phase 1 supplier", {
      screenshot: await report.screenshot(page, "wizard-step-2-leg-added"),
      evidence: { supplierId, supplierName: supplierFixture.name },
    })

    // Step 3 — Routes & Rates
    await gotoWizardStep(page, /3\. Routes & Rates/i)
    const routeCheckboxLabel = wizard.locator("label", {
      has: page.getByText(supplierFixture.routeName, { exact: false }),
    })
    await expect(routeCheckboxLabel.first()).toBeVisible()
    await routeCheckboxLabel.first().click()
    report.step("Selected the Phase 1 route on the leg", {
      screenshot: await report.screenshot(page, "wizard-step-3-route-selected"),
      evidence: { routeName: supplierFixture.routeName },
    })

    // Step 4 — Review
    await gotoWizardStep(page, /4\. Review/i)
    report.step("Reviewed package in Step 4", {
      screenshot: await report.screenshot(page, "wizard-step-4-review"),
    })

    // Step 5 — Save
    await gotoWizardStep(page, /5\. Save/i)
    await wizard.getByRole("button", { name: selectors.packages.savePackageButton }).click()

    await page.waitForURL(/\/app\/packages\/[^/]+$/, { timeout: 30_000 })
    packageSlug = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1) ?? null
    if (!packageSlug) {
      throw new Error("Could not resolve package slug from URL")
    }
    report.step("Package saved and redirected to detail page", {
      screenshot: await report.screenshot(page, "package-detail"),
      evidence: { slug: packageSlug, url: page.url() },
    })

    // Reload to confirm round-trip from DB
    await page.reload()
    await expect(page.getByRole("heading", { name: pkgFixture.name })).toBeVisible()
    const main = page.locator("main, body").first()
    await expect(labeledInput(main, "Name")).toHaveValue(pkgFixture.name)
    await expect(labeledInput(main, "Duration nights")).toHaveValue(
      String(pkgFixture.durationNights),
    )
    await expect(labeledInput(main, "Single supplement %")).toHaveValue(
      String(pkgFixture.singleSupplementPct),
    )
    await expect(labeledInput(main, "Fixed price per person (optional)")).toHaveValue(
      String(pkgFixture.fixedPricePerPerson),
    )
    report.step("Package detail round-trips after reload", {
      screenshot: await report.screenshot(page, "package-detail-reloaded"),
    })

    // Toggle active off then back on, saving via the API and reloading to
    // confirm each step persisted before continuing.
    const saveAndReload = async (): Promise<void> => {
      await saveAndWaitFor(page, /\/api\/packages\//, "PATCH", async () => {
        await page
          .getByRole("button", { name: selectors.packages.saveChangesButton })
          .first()
          .click()
      })
      await page.reload()
    }

    const activeSwitch = () => page.getByRole("switch", { name: /Active/i }).first()
    await expect(activeSwitch()).toHaveAttribute("aria-checked", "true")
    await activeSwitch().click()
    await expect(activeSwitch()).toHaveAttribute("aria-checked", "false")
    await saveAndReload()
    await expect(activeSwitch()).toHaveAttribute("aria-checked", "false")
    await activeSwitch().click()
    await expect(activeSwitch()).toHaveAttribute("aria-checked", "true")
    await saveAndReload()
    await expect(activeSwitch()).toHaveAttribute("aria-checked", "true")
    report.step("Toggled active off and back on, saved both times", {
      screenshot: await report.screenshot(page, "package-active-toggled"),
    })

    const dbEvidence = await getPackageDbEvidence(packageSlug, supplierId)
    const pkgRow = dbEvidence.package as {
      id: string
      currency: string
      duration_nights: number | null
      single_supplement_pct: number
      fixed_price_per_person: number | null
      active: boolean
    }
    packageId = pkgRow.id
    report.addDbEvidence(dbEvidence)

    const legLinks = dbEvidence.legLinksToSupplier as boolean
    const legRoutes = dbEvidence.legRoutes as Array<unknown>
    const dbOk =
      legLinks &&
      legRoutes.length > 0 &&
      pkgRow.currency === pkgFixture.currency &&
      pkgRow.duration_nights === pkgFixture.durationNights &&
      pkgRow.single_supplement_pct === pkgFixture.singleSupplementPct &&
      pkgRow.fixed_price_per_person === pkgFixture.fixedPricePerPerson &&
      pkgRow.active === true

    report.step("Database confirms package, leg linked to Phase 1 supplier, and route selection", {
      status: dbOk ? "pass" : "fail",
      evidence: {
        packageId,
        packageSlug,
        legLinksToSupplier: legLinks,
        legRouteCount: legRoutes.length,
        currency: pkgRow.currency,
        durationNights: pkgRow.duration_nights,
        singleSupplementPct: pkgRow.single_supplement_pct,
        fixedPricePerPerson: pkgRow.fixed_price_per_person,
        active: pkgRow.active,
      },
    })

    writeRunState({
      ...readRunState(),
      package: {
        id: packageId,
        slug: packageSlug,
      },
    })
    report.step("Persisted package id and slug to qa/.run-state.json", {
      evidence: { packageId, packageSlug },
    })
  } catch (error) {
    const screenshot = await report.screenshot(page, "package-phase-failure").catch(() => undefined)
    report.step("Phase 2 package scenario completed", {
      status: "fail",
      screenshot,
      notes: [error instanceof Error ? error.message : String(error)],
      evidence: { packageSlug, packageId },
    })
    throw error
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
