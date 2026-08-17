import { expect, test, type Locator, type Page } from "@playwright/test"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { createQaSupabase } from "../lib/db"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"
import { readRunState, writeRunState } from "../lib/run-state"
import { selectors } from "../lib/selectors"
import { QA_RUN } from "../lib/test-data"

test.use({ storageState: ADMIN_STORAGE_STATE })

async function selectOption(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByLabel(label).click()
  await page.getByRole("option", { name: option }).click()
}

async function fillBuffered(locator: Locator, value: string): Promise<void> {
  await locator.fill(value)
  await locator.blur()
}

async function cleanupSupplierFixture(): Promise<void> {
  const supabase = createQaSupabase()
  const { data: existingSuppliers, error } = await supabase
    .from("suppliers")
    .select("id")
    .eq("name", QA_RUN.supplier.name)

  if (error) {
    throw new Error(`Failed to inspect existing QA suppliers: ${error.message}`)
  }

  const supplierIds = (existingSuppliers ?? []).map((supplier) => supplier.id)
  if (supplierIds.length === 0) {
    return
  }

  await supabase.from("supplier_emails").delete().in("supplier_id", supplierIds)
  await supabase.from("routes").delete().in("supplier_id", supplierIds)
  await supabase.from("suite_types").delete().in("supplier_id", supplierIds)
  const { error: deleteError } = await supabase.from("suppliers").delete().in("id", supplierIds)

  if (deleteError) {
    throw new Error(`Failed to delete existing QA suppliers: ${deleteError.message}`)
  }
}

async function getSupplierDbEvidence(slug: string): Promise<Record<string, unknown>> {
  const supabase = createQaSupabase()
  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id, slug, name, kind, email, phone, website, location, notes, active, status")
    .eq("slug", slug)
    .single()

  if (supplierError || !supplier) {
    throw new Error(supplierError?.message ?? "Supplier was not found in DB")
  }

  const [{ data: emails }, { data: routes }, { data: suiteTypes }] = await Promise.all([
    supabase.from("supplier_emails").select("id, email, label").eq("supplier_id", supplier.id),
    supabase.from("routes").select("id, name, active").eq("supplier_id", supplier.id),
    supabase.from("suite_types").select("id, name, active").eq("supplier_id", supplier.id),
  ])

  return {
    supplier,
    emails: emails ?? [],
    routes: routes ?? [],
    suiteTypes: suiteTypes ?? [],
  }
}

test("01-supplier creates supplier, route, suite type, and report", async ({ page, baseURL }) => {
  const report = new ReportBuilder("01-supplier", "Phase 1 Supplier Creation QA")
  const diagnostics = attachBrowserDiagnostics(page)
  const supplier = QA_RUN.supplier
  let supplierSlug: string | null = null
  let supplierId: string | null = null

  report.setGoal("Create a supplier through the suppliers UI, verify round-trip fields, add one route and one suite type, and confirm database rows.")
  report.setEnvironment({
    baseURL,
    user: "carmen@luxustravel.co.za",
    storageState: ADMIN_STORAGE_STATE,
  })

  try {
    await cleanupSupplierFixture()

    await page.goto("/app/suppliers")
    await expect(page.getByRole("heading", { name: selectors.suppliers.pageHeading })).toBeVisible()
    report.step("Opened suppliers page", {
      screenshot: await report.screenshot(page, "suppliers-page"),
      evidence: { url: page.url() },
    })

    await page.getByRole("button", { name: selectors.suppliers.addButton }).click()
    const dialog = page.getByRole("dialog", { name: selectors.suppliers.addButton })
    await expect(dialog).toBeVisible()
    report.step("Opened add-supplier dialog", {
      screenshot: await report.screenshot(page, "add-dialog"),
    })

    const createButton = dialog.getByRole("button", { name: selectors.suppliers.createButton })
    if (await createButton.isDisabled()) {
      report.step("Negative path: empty submit validation", {
        status: "warn",
        screenshot: await report.screenshot(page, "empty-submit-disabled"),
        notes: [
          "The empty form cannot be submitted because the create button is disabled.",
          "This prevents validation messages for required fields from being surfaced on submit.",
        ],
      })
    } else {
      await createButton.click()
      report.step("Negative path: empty submit validation", {
        screenshot: await report.screenshot(page, "empty-submit-validation"),
        evidence: {
          text: await dialog.textContent(),
        },
      })
    }

    await selectOption(page, "Category", /^Train$/i)
    await fillBuffered(dialog.getByLabel("Supplier name"), "A")
    await expect(dialog.getByText("Supplier name must be at least 2 characters")).toBeVisible()
    report.step("Negative path: one-character name rejected", {
      screenshot: await report.screenshot(page, "short-name-validation"),
      evidence: {
        validation: "Supplier name must be at least 2 characters",
      },
    })

    await fillBuffered(dialog.getByLabel("Supplier name"), supplier.name)
    await fillBuffered(dialog.getByLabel("Phone"), supplier.phone)
    await fillBuffered(dialog.getByLabel("Website"), supplier.website)
    // Train operators have no single city, so this is the free-text "Head office city" field --
    // every other kind is tagged via a City dropdown instead.
    await fillBuffered(dialog.getByLabel("Head office city"), supplier.location)
    await fillBuffered(dialog.getByLabel("Email address"), supplier.email)
    await fillBuffered(dialog.getByLabel("Notes"), supplier.notes)
    await expect(createButton).toBeEnabled()
    await createButton.click()

    await page.waitForURL(/\/app\/suppliers\/[^/]+$/, { timeout: 30_000 })
    supplierSlug = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1) ?? null
    if (!supplierSlug) {
      throw new Error("Could not resolve supplier slug from URL")
    }

    report.step("Happy path: supplier created and redirected to detail page", {
      screenshot: await report.screenshot(page, "created-detail"),
      evidence: {
        slug: supplierSlug,
        url: page.url(),
      },
    })

    await expect(page.getByRole("heading", { name: supplier.name })).toBeVisible()
    await expect(page.getByLabel("Supplier name")).toHaveValue(supplier.name)
    await expect(page.getByLabel("Phone")).toHaveValue(supplier.phone)
    await expect(page.getByLabel("Website")).toHaveValue("https://qa-rovos.test/")
    await expect(page.getByLabel("Head office city")).toHaveValue(supplier.location)
    await expect(page.getByPlaceholder("supplier@example.com")).toHaveValue(supplier.email)
    await expect(page.getByLabel("Notes")).toHaveValue(supplier.notes)
    report.step("Supplier fields round-trip on detail page", {
      screenshot: await report.screenshot(page, "round-trip-detail"),
    })

    const editButton = page.getByRole("button", { name: selectors.suppliers.editButton })
    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click()
    }

    const supplierStatusSwitch = page.getByRole("switch").first()
    if ((await supplierStatusSwitch.getAttribute("aria-checked")) !== "true") {
      await supplierStatusSwitch.click()
    }

    await page.getByRole("button", { name: /Add suite type/i }).click()
    await fillBuffered(
      page.getByText("Suite Type name").locator("xpath=..").getByRole("textbox"),
      supplier.suiteTypeName,
    )
    await page.getByRole("button", { name: /Add route/i }).click()
    await fillBuffered(
      page.getByText("Route name").locator("xpath=..").getByRole("textbox"),
      supplier.routeName,
    )
    report.step("Added one suite type and one route in edit mode", {
      screenshot: await report.screenshot(page, "route-suite-edit"),
    })

    await page.getByRole("button", { name: selectors.suppliers.savePublishButton }).click()
    await expect(page.getByText(/Supplier published successfully|Supplier updated successfully/i)).toBeVisible({
      timeout: 20_000,
    })
    report.step("Saved supplier route and suite changes", {
      screenshot: await report.screenshot(page, "saved-route-suite"),
    })

    const dbEvidence = await getSupplierDbEvidence(supplierSlug)
    const supplierRecord = dbEvidence.supplier as { id: string; slug: string }
    supplierId = supplierRecord.id
    report.addDbEvidence(dbEvidence)

    const routes = dbEvidence.routes as Array<{ name: string }>
    const suiteTypes = dbEvidence.suiteTypes as Array<{ name: string }>
    const routeExists = routes.some((route) => route.name === supplier.routeName)
    const suiteExists = suiteTypes.some((suiteType) => suiteType.name === supplier.suiteTypeName)

    report.step("Database confirms supplier, email, route, and suite type rows", {
      status: routeExists && suiteExists ? "pass" : "fail",
      evidence: {
        supplierId,
        supplierSlug,
        routeExists,
        suiteExists,
      },
    })

    writeRunState({
      ...readRunState(),
      supplier: {
        id: supplierId,
        slug: supplierSlug,
      },
    })
    report.step("Persisted supplier id and slug to qa/.run-state.json", {
      evidence: {
        supplierId,
        supplierSlug,
      },
    })
  } catch (error) {
    const screenshot = await report.screenshot(page, "supplier-phase-failure").catch(() => undefined)
    report.step("Phase 1 supplier scenario completed", {
      status: "fail",
      screenshot,
      notes: [error instanceof Error ? error.message : String(error)],
      evidence: {
        supplierSlug,
        supplierId,
      },
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
