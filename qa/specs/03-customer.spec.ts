import { expect, test, type Page } from "@playwright/test"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { createQaSupabase } from "../lib/db"
import { saveAndWaitFor } from "../lib/forms"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"
import { readRunState, writeRunState } from "../lib/run-state"
import { QA_RUN } from "../lib/test-data"

test.use({ storageState: ADMIN_STORAGE_STATE })

async function cleanupCustomerFixture(): Promise<void> {
  const supabase = createQaSupabase()
  const { data: existing, error } = await supabase
    .from("customers")
    .select("id")
    .eq("email", QA_RUN.customer.email)

  if (error) {
    throw new Error(`Failed to inspect existing QA customers: ${error.message}`)
  }

  const ids = (existing ?? []).map((row) => row.id)
  if (ids.length === 0) {
    return
  }

  await supabase.from("bookings").delete().in("customer_id", ids)
  const { error: deleteError } = await supabase.from("customers").delete().in("id", ids)
  if (deleteError) {
    throw new Error(`Failed to delete existing QA customers: ${deleteError.message}`)
  }
}

interface CustomerDbEvidence {
  rowCount: number
  customer: Record<string, unknown> | null
}

async function getCustomerDbEvidence(email: string): Promise<CustomerDbEvidence> {
  const supabase = createQaSupabase()
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, first_name, last_name, email, phone, country, province, title, notes, vip_status, date_of_birth, preferences, communication_preferences, is_repeat_client, created_at, updated_at",
    )
    .eq("email", email)

  if (error) {
    throw new Error(`Failed to read customers row: ${error.message}`)
  }

  return {
    rowCount: data?.length ?? 0,
    customer: (data?.[0] ?? null) as Record<string, unknown> | null,
  }
}

async function openCreateDialog(page: Page) {
  await page.getByRole("button", { name: /New Customer/i }).first().click()
  const dialog = page.getByRole("dialog").filter({ has: page.getByText("New Customer", { exact: true }) })
  await expect(dialog).toBeVisible()
  return dialog
}

test("03-customer manual create flow with duplicate detection", async ({ page, baseURL }) => {
  const report = new ReportBuilder("03-customer", "Phase 3 Customer Manual Creation QA")
  const diagnostics = attachBrowserDiagnostics(page)
  const fixture = QA_RUN.customer

  report.setGoal(
    "Create a customer manually via the New Customer dialog, verify validation, round-trip the fixture on the detail page, edit notes, confirm duplicate-email behaviour, and persist the customer id for Phase 4.",
  )
  report.setEnvironment({
    baseURL,
    user: "carmen@luxustravel.co.za",
    storageState: ADMIN_STORAGE_STATE,
  })

  let customerId: string | null = null

  try {
    await cleanupCustomerFixture()

    await page.goto("/app/customers")
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible()
    report.step("Opened customers page", {
      screenshot: await report.screenshot(page, "customers-page"),
      evidence: { url: page.url() },
    })

    // 1. Empty submit validation
    {
      const dialog = await openCreateDialog(page)
      const createButton = dialog.getByRole("button", { name: /Create Customer/i })
      const initiallyDisabled = await createButton.isDisabled()
      if (initiallyDisabled) {
        report.step("Negative path: empty submit (button disabled until fields touched)", {
          status: "warn",
          screenshot: await report.screenshot(page, "empty-submit-disabled"),
          notes: [
            "Create Customer button is disabled before any field is touched, so empty-submit validation messages can't surface from a click.",
          ],
        })
      } else {
        await createButton.click()
        const firstNameError = dialog.getByText("First name is required")
        const lastNameError = dialog.getByText("Last name is required")
        const emailError = dialog.getByText("Email is required")
        const firstShown = await firstNameError.isVisible().catch(() => false)
        const lastShown = await lastNameError.isVisible().catch(() => false)
        const emailShown = await emailError.isVisible().catch(() => false)
        const allShown = firstShown && lastShown && emailShown
        report.step("Negative path: empty submit surfaces required-field validation", {
          status: allShown ? "pass" : "warn",
          screenshot: await report.screenshot(page, "empty-submit-validation"),
          evidence: {
            firstNameRequiredShown: firstShown,
            lastNameRequiredShown: lastShown,
            emailRequiredShown: emailShown,
            schemaRequired: ["first_name", "last_name", "email"],
            schemaOptional: ["title", "phone", "country", "province", "notes", "date_of_birth", "vip_status", "preferences", "communication_preferences"],
          },
          notes: allShown
            ? []
            : ["Expected inline validation for first_name, last_name, and email (per Zod schema)."],
        })
      }

      // 2. Malformed email
      const emailInput = dialog.getByLabel("Email", { exact: false }).first()
      await emailInput.click()
      await emailInput.fill("not-an-email")
      await emailInput.blur()
      const malformedError = dialog.getByText("Must be a valid email address")
      const malformedShown = await malformedError.isVisible().catch(() => false)
      report.step("Negative path: malformed email rejected", {
        status: malformedShown ? "pass" : "fail",
        screenshot: await report.screenshot(page, "malformed-email"),
        evidence: { value: "not-an-email", validationVisible: malformedShown },
      })

      // Surface gap: dialog does NOT expose province, VIP, DOB, preferences (schema allows them).
      report.step("Manual form coverage vs. Zod schema", {
        status: "warn",
        notes: [
          "Create Customer dialog exposes: title, first_name, last_name, email, phone, country, notes.",
          "Dialog does NOT expose: province, vip_status, date_of_birth, preferences, communication_preferences.",
          "All five hidden fields are accepted by the API and editable on the customer detail page, but cannot be set during creation.",
        ],
        evidence: {
          dialogFields: ["title", "firstName", "lastName", "email", "phone", "country", "notes"],
          missingFromDialog: ["province", "vipStatus", "dateOfBirth", "preferences", "communicationPreferences"],
        },
      })

      // Close dialog to reset state before happy path
      await dialog.getByRole("button", { name: /^Cancel$/ }).click()
      await expect(dialog).toBeHidden()
    }

    // 3. Happy path
    {
      const dialog = await openCreateDialog(page)

      // Title (Select component)
      await dialog.getByLabel("Title", { exact: true }).click()
      await page.getByRole("option", { name: fixture.title, exact: true }).click()

      await dialog.getByLabel(/^First Name/i).fill(fixture.firstName)
      await dialog.getByLabel(/^Last Name/i).fill(fixture.lastName)
      await dialog.getByLabel("Email", { exact: false }).first().fill(fixture.email)
      await dialog.getByLabel("Phone").fill(fixture.phone)

      // Country (Select component)
      await dialog.getByLabel("Country", { exact: true }).click()
      await page.getByRole("option", { name: fixture.country, exact: true }).click()

      await dialog.getByLabel("Notes").fill(fixture.notes)

      report.step("Filled happy-path fixture in dialog", {
        screenshot: await report.screenshot(page, "happy-path-filled"),
        evidence: {
          title: fixture.title,
          firstName: fixture.firstName,
          lastName: fixture.lastName,
          email: fixture.email,
          phone: fixture.phone,
          country: fixture.country,
        },
      })

      const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/customers") && response.request().method() === "POST",
      )
      await dialog.getByRole("button", { name: /Create Customer/i }).click()
      const createResponse = await responsePromise
      const status = createResponse.status()
      const body = await createResponse.json().catch(() => ({}))
      customerId = body?.id ?? null

      report.step("POST /api/customers returned 201 with customer id", {
        status: status === 201 && Boolean(customerId) ? "pass" : "fail",
        evidence: { status, body },
      })

      // Modal opens with detail view at /app/customers/{id}
      await page.waitForURL(/\/app\/customers\/[^/]+$/, { timeout: 15_000 })
      report.step("Customer detail modal opened after create", {
        screenshot: await report.screenshot(page, "detail-modal-after-create"),
        evidence: { url: page.url() },
      })
    }

    if (!customerId) {
      throw new Error("Customer id was not returned by /api/customers POST")
    }

    // 4. Round-trip on detail page (direct nav, not the modal).
    // Note: <CardTitle> renders as a div, not an ARIA heading — use getByText.
    await page.goto(`/app/customers/${customerId}`)
    await expect(page.getByText("Customer information", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })
    const headerName = page.getByText(`${fixture.firstName} ${fixture.lastName}`, { exact: false }).first()
    await expect(headerName).toBeVisible()
    report.step("Detail page renders fixture name + customer information", {
      screenshot: await report.screenshot(page, "detail-page"),
      evidence: { customerId, url: page.url() },
    })

    // 5. Edit notes and save
    {
      const editButton = page.getByRole("button", { name: /^Edit$/ }).first()
      await editButton.click()
      const editedNotes = `${fixture.notes} EDITED-${Date.now()}`
      const notesEditable = page.getByPlaceholder("Add internal notes for this customer...")
      await expect(notesEditable).toBeVisible()
      await notesEditable.click()
      await notesEditable.fill(editedNotes)
      const saveResponse = await saveAndWaitFor(
        page,
        new RegExp(`/api/customers/${customerId}`),
        "PATCH",
        () => page.getByRole("button", { name: /Save changes/i }).first().click(),
        { timeout: 20_000 },
      )
      report.step("Edited notes and saved changes", {
        status: saveResponse.ok() ? "pass" : "fail",
        screenshot: await report.screenshot(page, "notes-saved"),
        evidence: {
          saveStatus: saveResponse.status(),
          editedSnippet: editedNotes.slice(0, 80),
        },
      })

      // Reload and confirm the new value persisted (per scenario step 9).
      await page.reload()
      await expect(page.getByText("Customer information", { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      })
      const notesValueAfterReload = await page
        .getByPlaceholder("Add internal notes for this customer...")
        .inputValue()
      const notesPersisted = notesValueAfterReload === editedNotes
      report.step("Edited notes persist after reload", {
        status: notesPersisted ? "pass" : "fail",
        evidence: {
          expected: editedNotes,
          actual: notesValueAfterReload,
        },
      })
    }

    // 6. Duplicate detection
    await page.goto("/app/customers")
    {
      const dialog = await openCreateDialog(page)
      await dialog.getByLabel(/^First Name/i).fill(fixture.firstName)
      await dialog.getByLabel(/^Last Name/i).fill(fixture.lastName)
      await dialog.getByLabel("Email", { exact: false }).first().fill(fixture.email)

      const dupResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/customers") && response.request().method() === "POST",
      )
      await dialog.getByRole("button", { name: /Create Customer/i }).click()
      const dupResponse = await dupResponsePromise
      const dupStatus = dupResponse.status()
      const dupBody = await dupResponse.json().catch(() => ({}))

      const conflictMessage = dialog.getByText(/already exists/i).first()
      const conflictShown = await conflictMessage.isVisible().catch(() => false)

      report.step("Duplicate email submit returns 409 and surfaces inline error", {
        status: dupStatus === 409 && conflictShown ? "pass" : "fail",
        screenshot: await report.screenshot(page, "duplicate-email"),
        evidence: {
          status: dupStatus,
          body: dupBody,
          conflictMessageVisible: conflictShown,
        },
        notes:
          dupStatus === 409 && conflictShown
            ? []
            : ["Expected: HTTP 409 + inline 'A customer with this email address already exists.' message."],
      })

      await dialog.getByRole("button", { name: /^Cancel$/ }).click()
    }

    // 7. DB check
    const dbEvidence = await getCustomerDbEvidence(fixture.email)
    report.addDbEvidence(dbEvidence as unknown as Record<string, unknown>)
    const row = dbEvidence.customer as null | {
      id: string
      first_name: string
      last_name: string
      email: string
      phone: string | null
      country: string | null
      title: string | null
      notes: string | null
    }
    const dbOk =
      dbEvidence.rowCount === 1 &&
      row !== null &&
      row.first_name === fixture.firstName &&
      row.last_name === fixture.lastName &&
      row.email === fixture.email.toLowerCase() &&
      row.phone === fixture.phone &&
      row.country === fixture.country &&
      row.title === fixture.title

    report.step("Database has exactly one customer row matching the fixture", {
      status: dbOk ? "pass" : "fail",
      evidence: {
        rowCount: dbEvidence.rowCount,
        customerId: row?.id ?? null,
        firstNameMatches: row?.first_name === fixture.firstName,
        lastNameMatches: row?.last_name === fixture.lastName,
        emailMatches: row?.email === fixture.email.toLowerCase(),
        phoneMatches: row?.phone === fixture.phone,
        countryMatches: row?.country === fixture.country,
        titleMatches: row?.title === fixture.title,
      },
    })

    writeRunState({
      ...readRunState(),
      customer: { id: customerId },
    })
    report.step("Persisted customer id to qa/.run-state.json", {
      evidence: { customerId },
    })
  } catch (error) {
    const screenshot = await report.screenshot(page, "customer-phase-failure").catch(() => undefined)
    report.step("Phase 3 customer scenario aborted by exception", {
      status: "fail",
      screenshot,
      notes: [error instanceof Error ? error.message : String(error)],
      evidence: { customerId },
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
