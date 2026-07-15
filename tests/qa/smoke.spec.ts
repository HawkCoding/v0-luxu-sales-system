import { test, expect } from "@playwright/test"
// pdf-parse 1.x is CJS with a callable default export.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require("pdf-parse")
import { createQaSupabase } from "../../qa/lib/db"
import { SMOKE_STORAGE_STATE, report } from "./smoke.fixtures"

// =============================================================================
// Phase 35 cross-cutting smoke suite. Acting purely as QA: no product code is
// modified. Uses the Manager role (dirk@luxustravel.co.za) for full access to
// error logs, PDF generation, document uploads, and settings nav badge checks.
//
// Criteria:
//  S1 — Dashboard stat cards (no NaN, no perpetual loading, Unresolved Errors)
//  S2 — Settings nav badge appears/disappears with unresolved error state
//  S3 — Quote PDF: magic bytes + structural content assertions
//  S4 — Invoice PDF: BLOCKED (placeholder doc row, no binary PDF in storage)
//  S5 — Voucher PDF: magic bytes + structural content assertions
//  S6 — File upload: accept/reject by size and MIME type
//  S7 — Signed URL: 200 + correct content-type; expiry BLOCKED
//  S8 — Loading skeleton, empty state, API error state
// =============================================================================

test.use({ storageState: SMOKE_STORAGE_STATE })

const db = createQaSupabase()

// Minimal structurally valid PDF (same bytes used by consultant.spec.ts).
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF",
  "utf8",
)

test.afterAll(async () => {
  const path = report.write()
  console.log(`\n[smoke-qa] report written to ${path}\n`)
})

// ---------------------------------------------------------------------------
// S0 — warm up Turbopack-lazy-compiled routes.
//
// Next.js 16 (Turbopack) compiles routes on first request. Uncompiled routes
// return HTML text/html 404. We detect this by checking content-type: once a
// route returns application/json (even 401/403) it is compiled and ready.
// ---------------------------------------------------------------------------
function isRouteCompiled(resp: { headers(): Record<string, string>; status(): number } | null): boolean {
  if (!resp) return false
  const ct = resp.headers()["content-type"] ?? ""
  return ct.includes("application/json")
}

async function waitForRouteCompilation(
  page: import("@playwright/test").Page,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let r: { headers(): Record<string, string>; status(): number } | null = null
    if (method === "GET") {
      r = await page.request.get(url).catch(() => null)
    } else {
      r = await page.request.post(url, body ? { data: body } : undefined).catch(() => null)
    }
    if (isRouteCompiled(r)) return
    await page.waitForTimeout(2_000)
  }
}

test("S0 — warm up routes", async ({ page }) => {
  const { data: bk } = await db.from("bookings").select("id").order("booking_number").limit(1).maybeSingle()
  if (!bk) return
  const { data: qt } = await db.from("quotes").select("id").gt("total", 0).limit(1).maybeSingle()
  const { data: cust } = await db.from("customers").select("id").limit(1).maybeSingle()
  const { data: errLog } = await db.from("error_logs").select("id").limit(1).maybeSingle()
  const { data: doc } = await db.from("documents").select("id").limit(1).maybeSingle()

  type WarmResult = { route: string; status: number; ct: string; compiled: boolean; attempts: number }
  const results: WarmResult[] = []

  async function warmAndRecord(method: "GET" | "POST", url: string, body?: unknown): Promise<void> {
    let attempts = 0
    const deadline = Date.now() + 60_000
    let lastStatus = 0
    let lastCT = ""
    while (Date.now() < deadline) {
      attempts += 1
      let r: { headers(): Record<string, string>; status(): number } | null = null
      if (method === "GET") {
        r = await page.request.get(url).catch(() => null)
      } else {
        r = await page.request.post(url, body !== undefined ? { data: body } : undefined).catch(() => null)
      }
      lastStatus = r?.status() ?? 0
      lastCT = r?.headers()["content-type"] ?? ""
      if (isRouteCompiled(r)) {
        results.push({ route: `${method} ${url}`, status: lastStatus, ct: lastCT, compiled: true, attempts })
        return
      }
      await page.waitForTimeout(2_000)
    }
    results.push({ route: `${method} ${url}`, status: lastStatus, ct: lastCT, compiled: false, attempts })
  }

  // Compile each route sequentially to avoid overwhelming the Turbopack server.
  // Each waits until the route returns JSON (compiled) rather than HTML (not-found).
  await warmAndRecord("GET", "/api/data")
  await warmAndRecord("GET", "/api/error-logs?resolved=false&count=true")
  await warmAndRecord("GET", "/api/customers")
  if (cust) await warmAndRecord("GET", `/api/customers/${cust.id}`)
  await warmAndRecord("GET", `/api/jobs/${bk.id}`)
  if (qt) await warmAndRecord("POST", `/api/quotes/${qt.id}/pdf`)
  await warmAndRecord("POST", "/api/voucher/generate", {})
  await warmAndRecord("GET", `/api/documents/${bk.id}`)
  if (errLog) await warmAndRecord("POST", `/api/error-logs/${errLog.id}/resolve`)

  // Upload route — multipart body.
  const uploadResp = await page.request.post("/api/documents/upload", {
    multipart: { booking_id: bk.id, kind: "other", file: { name: "warm.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") } },
  }).catch(() => null)
  const uploadCT = uploadResp?.headers()["content-type"] ?? ""
  results.push({ route: "POST /api/documents/upload", status: uploadResp?.status() ?? 0, ct: uploadCT, compiled: isRouteCompiled(uploadResp), attempts: 1 })

  console.log("\n[smoke-qa] Warm-up results:")
  for (const r of results) {
    console.log(`  ${r.compiled ? "✓" : "✗"} ${r.route} → HTTP ${r.status} (${r.ct.split(";")[0]}) after ${r.attempts} attempt(s)`)
  }
})

// ---------------------------------------------------------------------------
// S1. Dashboard stat cards render with real numbers (no NaN, no loading hang).
// ---------------------------------------------------------------------------
test("S1 — dashboard stat cards render with real numbers", async ({ page }) => {
  const N = 1
  const T = "Dashboard stat cards — no NaN, no perpetual loading, Unresolved Errors card"
  try {
    await page.goto("/app")
    await page.waitForLoadState("networkidle").catch(() => undefined)
    // Explicit guard: wait for the first stat label to become visible.
    await page.getByText("Open Jobs").waitFor({ timeout: 20_000 }).catch(() => undefined)

    const labels = ["Open Jobs", "Quotes Sent", "Deposits Paid", "Full Payment", "Unresolved Errors"]
    const present: string[] = []
    const absent: string[] = []
    for (const label of labels) {
      const visible = await page.getByText(label).first().isVisible({ timeout: 3_000 }).catch(() => false)
      visible ? present.push(label) : absent.push(label)
    }

    // No NaN anywhere in rendered body text.
    const bodyText = await page.textContent("body") ?? ""
    const nanInBody = /\bNaN\b/.test(bodyText)

    // Loading skeleton should be gone.
    const skeletonGone = await page.locator(".animate-pulse").first().isHidden({ timeout: 3_000 }).catch(() => true)

    report.addEvidence(N, T, `Labels present: ${present.join(", ")}${absent.length ? `; absent: ${absent.join(", ")}` : ""}`)
    report.addEvidence(N, T, `NaN in body: ${nanInBody}; skeleton gone: ${skeletonGone}`)
    await report.shot(page, N, "dashboard")

    if (nanInBody) {
      report.finding({
        severity: "Critical",
        title: "Dashboard renders NaN in stat card value",
        repro: "Navigate to /app as manager",
        expected: "All stat card values are integers",
        actual: "Page body contains literal 'NaN' text",
        fixScope: "app/app/page.tsx — stat card computation or useAllData() error path",
      })
    }
    if (absent.length > 0) {
      report.finding({
        severity: "Major",
        title: "Dashboard stat card label(s) missing",
        repro: "Navigate to /app as manager, inspect stat card labels",
        expected: `All five labels present: ${labels.join(", ")}`,
        actual: `Missing: ${absent.join(", ")}`,
        fixScope: "app/app/page.tsx — StatCard grid",
      })
    }

    const pass = present.length === labels.length && !nanInBody
    report.record(N, T, pass ? "PASS" : "FAIL", `${present.length}/${labels.length} stat labels visible; NaN=${nanInBody}; skeletonGone=${skeletonGone}`)
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// S2. Settings nav badge appears when unresolved errors exist; disappears
//     when all errors are resolved. Seeds a test error log via service client,
//     asserts the destructive badge, resolves via API, confirms badge is gone.
// ---------------------------------------------------------------------------
test("S2 — settings nav badge appears and disappears with error state", async ({ page, request }) => {
  const N = 2
  const T = "Settings nav unresolved-error badge"
  let seededId: string | null = null
  try {
    // Seed a test error log.
    const { data: inserted, error: insertErr } = await db
      .from("error_logs")
      .insert({
        severity: "Warning",
        source: "qa-smoke-test",
        message: "QA Smoke Suite — unresolved-badge test, safe to ignore",
        resolved: false,
      })
      .select("id")
      .single()
    if (insertErr || !inserted) throw insertErr ?? new Error("Failed to insert test error log")
    seededId = inserted.id
    report.addEvidence(N, T, `Seeded error_log id=${seededId}`)

    // Navigate fresh — SWR fetches the unresolved count on mount.
    await page.goto("/app")
    await page.waitForLoadState("networkidle").catch(() => undefined)
    // Wait for the error-log count request to complete.
    await page.waitForResponse(
      (r) => r.url().includes("/api/error-logs") && r.url().includes("count=true"),
      { timeout: 15_000 },
    ).catch(() => undefined)

    // The destructive badge appears inside <a href="/app/settings">.
    const settingsLink = page.locator('a[href="/app/settings"]')
    await expect(settingsLink).toBeVisible({ timeout: 10_000 })
    const badge = settingsLink.locator('[class*="destructive"]').first()
    const badgeVisible = await badge.isVisible({ timeout: 5_000 }).catch(() => false)
    report.addEvidence(N, T, `Destructive badge on Settings link: visible=${badgeVisible}`)
    await report.shot(page, N, "badge-present")

    if (!badgeVisible) {
      report.finding({
        severity: "Major",
        title: "Settings nav badge not shown when unresolved errors exist",
        repro: "Insert a non-resolved error_log row, navigate to /app as manager",
        expected: "Destructive badge with error count appears on Settings nav link",
        actual: "No destructive badge visible on the Settings link",
        fixScope: "app/app/client-layout.tsx — SWR fetch for unresolvedErrorsCount or showSettingsBadge condition",
      })
    }

    // Resolve via the API.
    const resolveResp = await request.post(`/api/error-logs/${seededId}/resolve`, { data: {} })
    report.addEvidence(N, T, `Resolve API → HTTP ${resolveResp.status()}`)
    expect(resolveResp.ok(), "resolve API ok").toBeTruthy()

    // Navigate fresh again — SWR re-fetches count on mount.
    await page.goto("/app")
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await page.waitForResponse(
      (r) => r.url().includes("/api/error-logs") && r.url().includes("count=true"),
      { timeout: 15_000 },
    ).catch(() => undefined)

    const badgeAfter = await settingsLink.locator('[class*="destructive"]').first().isVisible({ timeout: 5_000 }).catch(() => false)
    report.addEvidence(N, T, `Destructive badge after resolve: visible=${badgeAfter}`)
    await report.shot(page, N, "badge-gone")

    if (badgeAfter) {
      report.finding({
        severity: "Major",
        title: "Settings nav badge persists after all errors resolved",
        repro: "Resolve all unresolved error_logs, navigate to /app as manager",
        expected: "Destructive badge disappears from Settings link",
        actual: "Badge still visible after resolve",
        fixScope: "app/app/client-layout.tsx — SWR cache invalidation for unresolvedErrorsCount",
      })
    }

    const pass = badgeVisible && resolveResp.ok() && !badgeAfter
    report.record(N, T, pass ? "PASS" : "FAIL", `badge present=${badgeVisible}; resolve=${resolveResp.status()}; badge after resolve=${badgeAfter}`)
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  } finally {
    if (seededId) {
      try { await db.from("error_logs").delete().eq("id", seededId) } catch { /* ignore */ }
    }
  }
})

// ---------------------------------------------------------------------------
// S3. Quote PDF — valid PDF magic bytes, "QUOTATION", quote number, validity date.
// ---------------------------------------------------------------------------
test("S3 — quote PDF structural assertions", async ({ page }) => {
  const N = 3
  const T = "Quote PDF — magic bytes, QUOTATION, quote number, validity"
  try {
    // Find a priced quote (must have total > 0 for line items to exist).
    const { data: quotes } = await db
      .from("quotes")
      .select("id, booking_id, quote_number, total")
      .gt("total", 0)
      .order("created_at", { ascending: false })
      .limit(5)
    const quote = (quotes ?? [])[0]
    expect(quote, "a priced quote for PDF generation").toBeTruthy()

    const { data: booking } = await db
      .from("bookings")
      .select("booking_number")
      .eq("id", quote!.booking_id)
      .single()

    // Generate the PDF.
    const genResp = await page.request.post(`/api/quotes/${quote!.id}/pdf`)
    const genCT = genResp.headers()["content-type"] ?? ""
    report.addEvidence(N, T, `POST /api/quotes/${quote!.id}/pdf → HTTP ${genResp.status()}; content-type="${genCT}"`)
    expect(genResp.ok(), `POST /api/quotes/${quote!.id}/pdf → HTTP ${genResp.status()} (CT: ${genCT})`).toBeTruthy()
    const genBody = (await genResp.json()) as { url: string; document: { id: string } }
    expect(genBody.url, "signed URL returned").toBeTruthy()
    report.addEvidence(N, T, `Generated quote PDF for ${quote!.quote_number} (booking ${booking?.booking_number}); doc id=${genBody.document?.id}`)

    // Fetch the PDF bytes via the signed URL.
    const pdfResp = await page.request.get(genBody.url)
    expect(pdfResp.ok(), "PDF binary fetch ok").toBeTruthy()
    const pdfBytes = await pdfResp.body()

    // 1. Magic bytes: first 4 bytes must be %PDF.
    const magic = pdfBytes.subarray(0, 4).toString("utf8")
    const hasMagicBytes = magic === "%PDF"
    report.addEvidence(N, T, `Magic bytes: "${magic}" — valid=${hasMagicBytes}`)

    // 2. Extract text via pdf-parse and run content assertions.
    const parsed = await pdfParse(pdfBytes)
    const text = parsed.text ?? ""

    const checks: Array<[string, boolean]> = [
      ["QUOTATION", text.includes("QUOTATION")],
      [`quote number (${quote!.quote_number})`, text.includes(quote!.quote_number ?? "")],
      ["Valid Until / validity date", /Valid Until/i.test(text)],
      ["numeric line-item content", /\d+/.test(text)],
    ]

    // Deposit estimate (acceptance criteria item — check whether it's present).
    const hasDepositLine = /deposit/i.test(text)
    report.addEvidence(N, T, `Deposit section in PDF text: ${hasDepositLine}`)
    if (!hasDepositLine) {
      report.finding({
        severity: "Minor",
        title: "Quote PDF does not include a deposit estimate",
        repro: "Generate a quote PDF, extract text with pdf-parse",
        expected: "PDF contains a deposit-percentage or deposit-amount row",
        actual: "No deposit-related text found in extracted PDF text (subtotal, VAT, and total present but no deposit line)",
        fixScope: "lib/quotes/pdf/quote-document.tsx — add a deposit row to the totals section",
      })
      report.recommend("Add a deposit estimate row (e.g. '25% Deposit: R...') to the quote PDF totals section. The acceptance criterion explicitly expects a deposit amount in the quote PDF.")
    }

    const passingChecks = checks.filter(([, ok]) => ok)
    const failingChecks = checks.filter(([, ok]) => !ok)
    for (const [label, ok] of checks) {
      report.addEvidence(N, T, `${ok ? "✓" : "✗"} ${label}`)
    }

    if (failingChecks.length > 0) {
      report.finding({
        severity: "Major",
        title: "Quote PDF missing expected structural content",
        repro: "Generate a quote PDF, extract text with pdf-parse",
        expected: `All structural checks pass: ${checks.map(([l]) => l).join(", ")}`,
        actual: `Failing: ${failingChecks.map(([l]) => l).join(", ")}`,
        fixScope: "lib/quotes/pdf/quote-document.tsx",
      })
    }

    await report.shot(page, N, "quote-pdf")
    const pass = hasMagicBytes && passingChecks.length >= 5
    report.record(N, T, pass ? "PASS" : "FAIL", `magic=${hasMagicBytes}; ${passingChecks.length}/${checks.length} content checks passed; depositLine=${hasDepositLine}`)
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// S4. Invoice PDF — BLOCKED.
//     The deposit invoice route (POST /api/invoices/deposit) creates a document
//     row with kind=invoice_pdf and storage_path=`invoices/{invoice_id}` as a
//     metadata placeholder but does NOT store a binary PDF in Supabase storage.
//     The route returns invoice metadata + HTML email via renderInvoiceEmail.
//     There is no binary PDF to download and run content assertions against.
// ---------------------------------------------------------------------------
test("S4 — invoice PDF structural assertions", async ({ page }) => {
  const N = 4
  const T = "Invoice PDF — structural assertions"
  try {
    // Confirm the implementation gap: invoice_pdf document rows have a
    // storage_path of `invoices/{uuid}` (no actual file in storage).
    const { data: invDocs } = await db
      .from("documents")
      .select("id, kind, storage_path, status")
      .eq("kind", "invoice_pdf")
      .limit(3)

    const samples = (invDocs ?? []).map((d) => `${d.id}: path=${d.storage_path}`)
    report.addEvidence(N, T, `invoice_pdf document samples: ${samples.join("; ") || "none found"}`)

    const allPlaceholders = (invDocs ?? []).every((d) => d.storage_path?.startsWith("invoices/"))
    report.addEvidence(N, T, `All invoice_pdf rows use placeholder storage_path (invoices/...): ${allPlaceholders}`)

    // Attempt to retrieve a signed URL for one of the rows — the storage path
    // does not point to a real file so this will likely 404 from Supabase storage.
    if (invDocs && invDocs.length > 0) {
      const docResp = await page.request.get(`/api/documents/${invDocs[0].id}`)
      const docBody = (await docResp.json().catch(() => ({}))) as { signedUrl?: string; error?: string }
      report.addEvidence(N, T, `GET /api/documents/${invDocs[0].id} → HTTP ${docResp.status()}; signedUrl=${!!docBody.signedUrl}; error=${docBody.error ?? "none"}`)

      if (docBody.signedUrl) {
        const fetchResp = await page.request.get(docBody.signedUrl).catch(() => null)
        report.addEvidence(N, T, `Signed URL fetch → HTTP ${fetchResp?.status() ?? "error"}; content-type=${fetchResp?.headers()["content-type"] ?? "n/a"}`)
      }
    }

    report.record(
      N,
      T,
      "BLOCKED",
      "TEST-AFFORDANCE GAP: POST /api/invoices/deposit creates an `invoice_pdf` document row " +
        "(storage_path=`invoices/{id}`) as a metadata placeholder but does NOT render or store " +
        "a binary PDF in Supabase storage. The actual invoice content is returned as HTML email " +
        "via renderInvoiceEmail(). No PDF binary exists to run magic-bytes or text-content " +
        "assertions against. A dedicated /api/invoices/{id}/pdf endpoint or inline PDF rendering " +
        "is needed to make this criterion testable.",
    )
    report.recommend(
      "Add a dedicated invoice PDF rendering path (e.g. POST /api/invoices/{id}/pdf using @react-pdf/renderer) " +
        "so invoices can be downloaded as proper PDF files, verified structurally, and attached as binaries to outbound emails. " +
        "Currently the 'invoice PDF' is an HTML email that looks like an invoice but cannot be opened as a standalone PDF file.",
    )
  } catch (err) {
    report.record(N, T, "BLOCKED", `Investigation error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// S5. Voucher PDF — magic bytes, "TRAVEL VOUCHERS", service blocks,
//     "End of Services" footer (expected by acceptance criteria).
// ---------------------------------------------------------------------------
test("S5 — voucher PDF structural assertions", async ({ page }) => {
  const N = 5
  const T = "Voucher PDF — magic bytes, TRAVEL VOUCHERS, service blocks, End of Services footer"
  try {
    // Find a voucher-ready booking (final_paid/voucher_sent, balance=0, departure set, customer email).
    const { data: bookings } = await db
      .from("bookings")
      .select("id, booking_number, stage, invoice_balance, departure_date, customer:customers(email)")
      .in("stage", ["final_paid", "voucher_sent"])
      .eq("invoice_balance", 0)
      .not("departure_date", "is", null)
      .order("booking_number")
    const target = (bookings ?? []).find((b) => {
      const c = Array.isArray(b.customer) ? b.customer[0] : b.customer
      return Boolean((c as { email?: string } | null)?.email)
    })
    expect(target, "a voucher-ready booking (final_paid/voucher_sent, balance=0, departure+email)").toBeTruthy()
    report.addEvidence(N, T, `Using booking ${target!.booking_number} (stage=${target!.stage})`)

    // Generate the voucher PDF.
    const genResp = await page.request.post("/api/voucher/generate", { data: { jobId: target!.id } })
    expect(genResp.ok(), `POST /api/voucher/generate → HTTP ${genResp.status()}`).toBeTruthy()
    const body = (await genResp.json()) as {
      voucherRecord: { voucherNumber: string; serviceBlockCount: number }
      voucher: { contentBase64: string; contentType: string }
    }
    const pdfBuffer = Buffer.from(body.voucher.contentBase64, "base64")
    report.addEvidence(N, T, `Voucher generated; serviceBlockCount=${body.voucherRecord.serviceBlockCount}; PDF size=${pdfBuffer.length}B`)

    // 1. Magic bytes.
    const magic = pdfBuffer.subarray(0, 4).toString("utf8")
    const hasMagicBytes = magic === "%PDF"
    report.addEvidence(N, T, `Magic bytes: "${magic}" — valid=${hasMagicBytes}`)

    // 2. Content assertions via pdf-parse.
    const parsed = await pdfParse(pdfBuffer)
    const text = parsed.text ?? ""

    const checks: Array<[string, boolean]> = [
      ["TRAVEL VOUCHERS (document title)", text.includes("TRAVEL VOUCHERS")],
      [`voucher number (${body.voucherRecord.voucherNumber})`, text.includes(body.voucherRecord.voucherNumber)],
      ["Luxus / brand text", /Luxus/i.test(text)],
    ]

    // Service block content — only assert when blocks were built.
    if (body.voucherRecord.serviceBlockCount > 0) {
      const hasBlockContent = /Your Reference:|Route:|Departure Date:|Check-In:|Pickup:|Itinerary:/i.test(text)
      checks.push([`service block rows (${body.voucherRecord.serviceBlockCount} blocks present)`, hasBlockContent])
    } else {
      report.addEvidence(N, T, "No service blocks on this booking — service block content check skipped")
    }

    // "End of Services" footer (acceptance criterion item).
    const hasEndOfServices = /End of Services/i.test(text)
    report.addEvidence(N, T, `"End of Services" footer text present: ${hasEndOfServices}`)
    if (!hasEndOfServices) {
      report.finding({
        severity: "Minor",
        title: 'Voucher PDF does not contain "End of Services" footer',
        repro: "Generate a voucher PDF, extract text with pdf-parse",
        expected: '"End of Services" text in the footer area of the PDF',
        actual: "Footer contains contact info (company/phone/email) assembled from voucher_template but no 'End of Services' line",
        fixScope: "lib/voucher/pdf/sections/footer.tsx — add an 'End of Services' heading or divider before the contact info block",
      })
    }

    const passingChecks = checks.filter(([, ok]) => ok)
    const failingChecks = checks.filter(([, ok]) => !ok)
    for (const [label, ok] of checks) {
      report.addEvidence(N, T, `${ok ? "✓" : "✗"} ${label}`)
    }

    if (!hasMagicBytes || failingChecks.length > 0) {
      report.finding({
        severity: "Major",
        title: "Voucher PDF missing expected structural content",
        repro: "Generate a voucher PDF for a final_paid booking, extract text with pdf-parse",
        expected: `magic=%PDF; ${checks.map(([l]) => l).join("; ")}`,
        actual: `magic=${hasMagicBytes}; failing: ${failingChecks.map(([l]) => l).join(", ") || "none"}`,
        fixScope: "lib/voucher/pdf/voucher-document.tsx or relevant section components",
      })
    }

    await report.shot(page, N, "voucher-pdf")
    const pass = hasMagicBytes && passingChecks.length >= Math.min(3, checks.length)
    report.record(N, T, pass ? "PASS" : "FAIL", `magic=${hasMagicBytes}; ${passingChecks.length}/${checks.length} content checks; endOfServices=${hasEndOfServices}`)
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  }
})

// ---------------------------------------------------------------------------
// S6. File upload — small PDF accepted, oversized rejected with clear message,
//     disallowed MIME rejected with clear message.
// ---------------------------------------------------------------------------
test("S6 — file upload: accept/reject by size and MIME type", async ({ page }) => {
  const N = 6
  const T = "File upload — small PDF accepted, oversized rejected, disallowed MIME rejected"
  let uploadedDocId: string | null = null
  try {
    const { data: booking } = await db
      .from("bookings")
      .select("id")
      .order("booking_number")
      .limit(1)
      .maybeSingle()
    expect(booking, "a seeded booking").toBeTruthy()
    const bookingId = booking!.id

    // --- Case A: Small PDF within the 10 MB limit — must be accepted. ---
    const smallResp = await page.request.post("/api/documents/upload", {
      multipart: {
        booking_id: bookingId,
        kind: "other",
        file: { name: "qa-smoke-small.pdf", mimeType: "application/pdf", buffer: MINIMAL_PDF },
      },
    })
    const smallBody = (await smallResp.json().catch(() => ({}))) as { id?: string; error?: string }
    if (smallBody.id) uploadedDocId = smallBody.id
    report.addEvidence(N, T, `Small PDF (${MINIMAL_PDF.length}B): HTTP ${smallResp.status()}; id=${smallBody.id ?? "none"}; error=${smallBody.error ?? "none"}`)

    if (!smallResp.ok()) {
      report.finding({
        severity: "Critical",
        title: "Valid small PDF upload is rejected",
        repro: `POST ${MINIMAL_PDF.length}B application/pdf to /api/documents/upload`,
        expected: "HTTP 200 + document row with signed URL",
        actual: `HTTP ${smallResp.status()}; error: ${smallBody.error}`,
        fixScope: "app/api/documents/upload/route.ts — MIME/size validation or Supabase storage write",
      })
    }

    // --- Case B: Oversized PDF (11 MB > 10 MB default limit) — must be rejected. ---
    const oversize = Buffer.alloc(11 * 1024 * 1024)
    oversize.write("%PDF-1.4\n", "utf8")
    const oversizeResp = await page.request.post("/api/documents/upload", {
      multipart: {
        booking_id: bookingId,
        kind: "other",
        file: { name: "qa-smoke-oversize.pdf", mimeType: "application/pdf", buffer: oversize },
      },
    })
    const oversizeBody = (await oversizeResp.json().catch(() => ({}))) as { error?: string }
    const oversizeRejected = oversizeResp.status() === 400
    const oversizeMsg = oversizeBody.error ?? ""
    const oversizeMsgClear = /exceeds|maximum|size/i.test(oversizeMsg)
    report.addEvidence(N, T, `Oversized PDF (11 MB): HTTP ${oversizeResp.status()}; message="${oversizeMsg}"`)

    if (!oversizeRejected) {
      report.finding({
        severity: "Major",
        title: "Oversized file accepted by the upload endpoint",
        repro: "POST an 11 MB file to /api/documents/upload",
        expected: "HTTP 400 with a size-exceeded error message",
        actual: `HTTP ${oversizeResp.status()}`,
        fixScope: "app/api/documents/upload/route.ts — file.size > maxBytes check",
      })
    } else if (!oversizeMsgClear) {
      report.finding({
        severity: "Minor",
        title: "Oversized file error message is unclear",
        repro: "POST an 11 MB file to /api/documents/upload",
        expected: "Error message mentions 'exceeds', 'maximum', or 'size'",
        actual: `"${oversizeMsg}"`,
        fixScope: "app/api/documents/upload/route.ts — jsonError message copy",
      })
    }

    // --- Case C: Disallowed MIME (.exe) — must be rejected with clear message. ---
    const exeResp = await page.request.post("/api/documents/upload", {
      multipart: {
        booking_id: bookingId,
        kind: "other",
        file: { name: "qa-smoke-malware.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") },
      },
    })
    const exeBody = (await exeResp.json().catch(() => ({}))) as { error?: string }
    const exeRejected = exeResp.status() === 400
    const exeMsg = exeBody.error ?? ""
    const exeMsgClear = /unsupported|file type|mime/i.test(exeMsg)
    report.addEvidence(N, T, `Disallowed MIME (.exe / application/x-msdownload): HTTP ${exeResp.status()}; message="${exeMsg}"`)

    if (!exeRejected) {
      report.finding({
        severity: "Major",
        title: "Disallowed MIME type (.exe) not rejected by upload endpoint",
        repro: "POST application/x-msdownload file to /api/documents/upload",
        expected: "HTTP 400 with a MIME-type error message",
        actual: `HTTP ${exeResp.status()}`,
        fixScope: "app/api/documents/upload/route.ts — allowedMimes.includes(file.type) check",
      })
    } else if (!exeMsgClear) {
      report.finding({
        severity: "Minor",
        title: "Disallowed MIME error message is unclear",
        repro: "POST .exe to /api/documents/upload",
        expected: "Error message mentions 'unsupported', 'file type', or 'MIME'",
        actual: `"${exeMsg}"`,
        fixScope: "app/api/documents/upload/route.ts — jsonError message copy",
      })
    }

    await report.shot(page, N, "upload")
    const pass = smallResp.ok() && oversizeRejected && exeRejected
    report.record(
      N, T, pass ? "PASS" : "FAIL",
      `small=${smallResp.ok() ? "accepted ✓" : `rejected ✗ (${smallResp.status()})`}; oversized=${oversizeRejected ? "rejected ✓" : "accepted ✗"}; exe=${exeRejected ? "rejected ✓" : "accepted ✗"}`,
    )
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  } finally {
    if (uploadedDocId) {
      try { await db.from("documents").delete().eq("id", uploadedDocId) } catch { /* ignore */ }
    }
  }
})

// ---------------------------------------------------------------------------
// S7. Signed URLs — direct fetch returns 200 + application/pdf content-type;
//     fresh URL via /api/documents/{id} also fetchable.
//     Expiry test is BLOCKED (Supabase URLs expire after 3600 s).
// ---------------------------------------------------------------------------
test("S7 — signed URL document access", async ({ page }) => {
  const N = 7
  const T = "Signed URL — 200 + correct content-type; expiry BLOCKED"
  let uploadedDocId: string | null = null
  try {
    const { data: booking } = await db
      .from("bookings")
      .select("id")
      .order("booking_number")
      .limit(1)
      .maybeSingle()
    expect(booking, "a seeded booking").toBeTruthy()

    // Upload a test PDF to obtain a fresh signed URL.
    const uploadResp = await page.request.post("/api/documents/upload", {
      multipart: {
        booking_id: booking!.id,
        kind: "other",
        file: { name: "qa-smoke-signed-url.pdf", mimeType: "application/pdf", buffer: MINIMAL_PDF },
      },
    })
    expect(uploadResp.ok(), "upload for signed-URL test ok").toBeTruthy()
    const uploadBody = (await uploadResp.json()) as { id: string; signedUrl: string }
    uploadedDocId = uploadBody.id
    report.addEvidence(N, T, `Uploaded doc id=${uploadBody.id}`)

    // 1. Fetch the signed URL returned directly by the upload endpoint.
    const directResp = await page.request.get(uploadBody.signedUrl)
    const directStatus = directResp.status()
    const directCT = directResp.headers()["content-type"] ?? ""
    const directOk = directResp.ok()
    const directPdfCT = directCT.includes("application/pdf")
    report.addEvidence(N, T, `Direct signed URL: HTTP ${directStatus}; content-type="${directCT}"`)

    if (!directOk) {
      report.finding({
        severity: "Critical",
        title: "Direct signed URL fetch returns non-200 status",
        repro: "Upload PDF, fetch signedUrl from upload response",
        expected: "HTTP 200 with application/pdf content-type",
        actual: `HTTP ${directStatus}`,
        fixScope: "Supabase storage bucket policy or upload route signed URL generation",
      })
    }
    if (directOk && !directPdfCT) {
      report.finding({
        severity: "Minor",
        title: "Signed URL fetch returns incorrect content-type",
        repro: "Upload PDF, fetch its signed URL",
        expected: "content-type: application/pdf",
        actual: `content-type: ${directCT}`,
        fixScope: "app/api/documents/upload/route.ts — pass contentType: 'application/pdf' to supabase.storage.upload()",
      })
    }

    // 2. Fetch via GET /api/documents/{id} → get a fresh signed URL → fetch that.
    const docApiResp = await page.request.get(`/api/documents/${uploadBody.id}`)
    const docApiBody = (await docApiResp.json().catch(() => ({}))) as { signedUrl?: string; error?: string }
    const freshUrl = docApiBody.signedUrl
    report.addEvidence(N, T, `GET /api/documents/${uploadBody.id}: HTTP ${docApiResp.status()}; freshUrl=${!!freshUrl}`)

    let freshOk = false
    let freshCT = ""
    if (freshUrl) {
      const freshResp = await page.request.get(freshUrl)
      freshOk = freshResp.ok()
      freshCT = freshResp.headers()["content-type"] ?? ""
      report.addEvidence(N, T, `Fresh signed URL fetch: HTTP ${freshResp.status()}; content-type="${freshCT}"`)
    } else {
      report.finding({
        severity: "Major",
        title: "GET /api/documents/{id} does not return a signedUrl",
        repro: "Upload a document, GET /api/documents/{id}",
        expected: "Response body contains { signedUrl: '...' }",
        actual: `Response: ${JSON.stringify(docApiBody)}`,
        fixScope: "app/api/documents/[id]/route.ts",
      })
    }

    // 3. URL expiry — cannot test in-band (3600 s TTL).
    report.addEvidence(N, T, "URL expiry sub-test: BLOCKED — Supabase signed URLs have a 3600 s TTL. Testing expiry would require waiting >1 hour or token-level manipulation, neither feasible in a smoke run.")

    await report.shot(page, N, "signed-url")
    const pass = directOk && directPdfCT && !!freshUrl && freshOk
    report.record(N, T, pass ? "PASS" : "FAIL", `direct=${directStatus}; pdfCT=${directPdfCT}; freshUrl=${!!freshUrl}; freshFetch=${freshOk}; expiry=BLOCKED`)
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  } finally {
    if (uploadedDocId) {
      try { await db.from("documents").delete().eq("id", uploadedDocId) } catch { /* ignore */ }
    }
  }
})

// ---------------------------------------------------------------------------
// S8. Loading skeleton, empty booking state, API error state.
//   8A: Customer with no bookings → "No bookings found for this customer."
//   8B: /api/data delayed → loading skeleton visible before data resolves
//   8C: /api/data → 500 → ConnectionErrorBanner (role="status") visible
// ---------------------------------------------------------------------------
test("S8 — loading skeleton, empty state, API error state", async ({ page }) => {
  const N = 8
  const T = "Loading skeleton / empty state / API error state"
  let createdCustomerId: string | null = null
  try {
    const results: Array<{ name: string; ok: boolean; note: string }> = []

    // ---- 8A: Empty state ----
    const createResp = await page.request.post("/api/customers", {
      data: {
        first_name: "QA",
        last_name: "SmokeMNoBkg",
        email: `qa-smoke-nobkg-${Date.now()}@example.com`,
        phone: null,
        country: "ZA",
      },
    })
    const createBody = (await createResp.json().catch(() => ({}))) as { id?: string; error?: string }
    if (createResp.ok() && createBody.id) {
      createdCustomerId = createBody.id
      await page.goto(`/app/customers/${createBody.id}`)
      await page.waitForLoadState("networkidle").catch(() => undefined)
      const emptyMsg = page.getByText("No bookings found for this customer.")
      const emptyVisible = await emptyMsg.isVisible({ timeout: 12_000 }).catch(() => false)
      report.addEvidence(N, T, `8A — empty state: customer ${createBody.id} (no bookings); message visible=${emptyVisible}`)
      await report.shot(page, N, "empty-state")
      results.push({ name: "8A empty state", ok: emptyVisible, note: `"No bookings found…" visible=${emptyVisible}` })
      if (!emptyVisible) {
        report.finding({
          severity: "Minor",
          title: "Empty booking state message not shown on customer detail page",
          repro: "Create a new customer with no bookings, navigate to /app/customers/{id}",
          expected: '"No bookings found for this customer." visible',
          actual: "Message not found in page",
          fixScope: "components/customer-detail-view.tsx — empty bookings state render",
        })
      }
    } else {
      report.addEvidence(N, T, `8A — customer creation failed: HTTP ${createResp.status()} (${createBody.error ?? "no error"})`)
      results.push({ name: "8A empty state", ok: false, note: `Customer creation failed (HTTP ${createResp.status()})` })
    }

    // ---- 8B: Loading skeleton ----
    // Delay /api/data so the dashboard stays in isLoading=true long enough to observe.
    await page.route("/api/data", async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 4_000))
      await route.continue().catch(() => undefined)
    })
    await page.goto("/app", { waitUntil: "domcontentloaded" })
    const skeleton = page.locator(".animate-pulse").first()
    const skeletonVisible = await skeleton.isVisible({ timeout: 8_000 }).catch(() => false)
    report.addEvidence(N, T, `8B — loading skeleton with 4s delayed /api/data: animate-pulse visible=${skeletonVisible}`)
    await report.shot(page, N, "loading-skeleton")
    results.push({ name: "8B loading skeleton", ok: skeletonVisible, note: `animate-pulse visible=${skeletonVisible}` })
    if (!skeletonVisible) {
      report.finding({
        severity: "Minor",
        title: "Loading skeleton not visible while /api/data is pending",
        repro: "Intercept /api/data with a 4 s delay, navigate to /app immediately",
        expected: "animate-pulse skeleton visible before data resolves",
        actual: "Skeleton not detected within 8 s — may be a timing issue in the test or skeleton is not rendered pre-hydration",
        fixScope: "app/app/page.tsx — ensure loading state renders before SWR resolves; or app/app/loading.tsx for a Next.js Suspense fallback",
      })
    }
    await page.unroute("/api/data")
    await page.waitForLoadState("networkidle").catch(() => undefined)

    // ---- 8C: Error state ----
    await page.route("/api/data", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated server error" }),
      }),
    )
    // Set up the response waiter BEFORE navigation so we don't miss the request.
    const dataResponseP = page.waitForResponse(
      (r) => r.url().includes("/api/data") && !r.url().includes("count=true"),
      { timeout: 15_000 },
    ).catch(() => null)
    await page.goto("/app")
    await dataResponseP // ensure SWR has received and processed the 500 response
    await page.waitForTimeout(500) // let React re-render with the error state
    const errorBanner = page.getByRole("status")
    const errorBannerVisible = await errorBanner.isVisible({ timeout: 10_000 }).catch(() => false)
    const bannerText = errorBannerVisible ? (await errorBanner.textContent() ?? "") : ""
    report.addEvidence(N, T, `8C — error state: ConnectionErrorBanner (role=status) visible=${errorBannerVisible}; text="${bannerText.trim()}"`)
    await report.shot(page, N, "error-state")
    results.push({ name: "8C error state", ok: errorBannerVisible, note: `role=status banner visible=${errorBannerVisible}` })
    if (!errorBannerVisible) {
      report.finding({
        severity: "Major",
        title: "ConnectionErrorBanner not shown when /api/data returns 500",
        repro: "Mock /api/data to return HTTP 500, navigate to /app as manager",
        expected: "ConnectionErrorBanner (role='status') visible: 'Unable to reach the database'",
        actual: "No element with role='status' found in the page",
        fixScope: "app/app/client-layout.tsx — dataError condition check or ConnectionErrorBanner render",
      })
    }
    await page.unroute("/api/data")

    const allOk = results.every((r) => r.ok)
    const summary = results.map((r) => `${r.name}=${r.ok ? "✓" : "✗"}(${r.note})`).join("; ")
    report.record(N, T, allOk ? "PASS" : "FAIL", summary)
  } catch (err) {
    report.record(N, T, "FAIL", `Error: ${(err as Error).message}`)
    await report.shot(page, N, "fail")
  } finally {
    await page.unroute("/api/data").catch(() => undefined)
    if (createdCustomerId) {
      try { await db.from("customers").delete().eq("id", createdCustomerId) } catch { /* ignore */ }
    }
  }
})
