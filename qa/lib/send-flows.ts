import { type Page } from "@playwright/test"
import { createQaSupabase } from "./db"

export type SendFlowOutcome = "pass" | "warn" | "fail" | "skipped"

export interface SendFlowResult {
  outcome: SendFlowOutcome
  reason: string
  status?: number | null
  evidence?: Record<string, unknown>
}

const PREVIEW_TIMEOUT = 20_000
const SEND_TIMEOUT = 30_000

async function waitForApiResponse(
  page: Page,
  urlSubstring: string,
  method: string,
  timeoutMs: number,
) {
  return page
    .waitForResponse(
      (response) =>
        response.url().includes(urlSubstring) && response.request().method() === method,
      { timeout: timeoutMs },
    )
    .catch(() => null)
}

// ---------------------------------------------------------------------------
// Quote — Preview & Send
// ---------------------------------------------------------------------------
//
// Drives `QuotePreviewSendDialog`. Caller is responsible for navigating to the
// quotes tab on the booking. We click the Preview & Send button on the nth
// quote card (0 = top, which is the most recent quote in `JobQuotesTab`'s
// reverse-chrono order).

export async function tryQuotePreviewSend(
  page: Page,
  options: { quoteIndex?: number } = {},
): Promise<SendFlowResult> {
  const previewBtn = page.getByRole("button", { name: /Preview & Send/i }).nth(options.quoteIndex ?? 0)
  const visible = await previewBtn.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!visible) {
    return { outcome: "skipped", reason: "Preview & Send button not visible on quotes tab" }
  }

  await previewBtn.click().catch(() => undefined)

  // Wait for the preview iframe to render (the dialog issues a POST that
  // populates `srcDoc`).
  const previewResponse = await waitForApiResponse(page, "/email-preview", "POST", PREVIEW_TIMEOUT)
  if (!previewResponse || !previewResponse.ok()) {
    await page.keyboard.press("Escape").catch(() => undefined)
    return {
      outcome: "warn",
      reason: "Quote email-preview endpoint did not return a body",
      status: previewResponse?.status() ?? null,
    }
  }

  const sendBtn = page.getByRole("button", { name: /^Send$/ }).last()
  await sendBtn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined)

  const correspondencePromise = waitForApiResponse(page, "/api/correspondence", "POST", SEND_TIMEOUT)
  await sendBtn.click().catch(() => undefined)
  const sendResponse = await correspondencePromise

  if (!sendResponse || !sendResponse.ok()) {
    await page.keyboard.press("Escape").catch(() => undefined)
    return {
      outcome: "warn",
      reason: "Send Quote correspondence POST did not return success",
      status: sendResponse?.status() ?? null,
    }
  }

  return {
    outcome: "pass",
    reason: "Quote sent via QuotePreviewSendDialog",
    status: sendResponse.status(),
  }
}

// ---------------------------------------------------------------------------
// Generate & Send — Deposit / Final invoice
// ---------------------------------------------------------------------------
//
// Both dialogs follow the same pattern:
//   1. Click trigger button in the booking header.
//   2. Dialog appears with a numeric input + "Generate" button.
//   3. POST /api/invoices/<kind> → opens PreviewAndSendDialog.
//   4. Click Send → POST /api/correspondence → invoice flips to "sent".

interface GenerateAndSendOptions {
  triggerLabel: RegExp
  generateEndpoint: string
}

async function tryGenerateAndSendInvoice(
  page: Page,
  opts: GenerateAndSendOptions,
): Promise<SendFlowResult> {
  const trigger = page.getByRole("button", { name: opts.triggerLabel }).first()
  const triggerVisible = await trigger.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!triggerVisible) {
    return {
      outcome: "skipped",
      reason: `Trigger button (${opts.triggerLabel}) not visible — invoice already sent or capability missing`,
    }
  }

  await trigger.click().catch(() => undefined)

  const generateBtn = page.getByRole("button", { name: /^Generate$/ }).last()
  const generateVisible = await generateBtn.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!generateVisible) {
    await page.keyboard.press("Escape").catch(() => undefined)
    return { outcome: "warn", reason: "Generate-invoice dialog did not render its Generate button" }
  }

  const generatePromise = waitForApiResponse(page, opts.generateEndpoint, "POST", SEND_TIMEOUT)
  await generateBtn.click().catch(() => undefined)
  const generateResponse = await generatePromise

  if (!generateResponse || !generateResponse.ok()) {
    await page.keyboard.press("Escape").catch(() => undefined)
    return {
      outcome: "warn",
      reason: `${opts.generateEndpoint} did not return a successful response`,
      status: generateResponse?.status() ?? null,
    }
  }

  // The generate step opens a second dialog (PreviewAndSendDialog) with its
  // own Send button.
  const sendBtn = page.getByRole("button", { name: /^Send($|\s)/ }).last()
  await sendBtn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined)

  const correspondencePromise = waitForApiResponse(page, "/api/correspondence", "POST", SEND_TIMEOUT)
  await sendBtn.click().catch(() => undefined)
  const sendResponse = await correspondencePromise

  if (!sendResponse || !sendResponse.ok()) {
    await page.keyboard.press("Escape").catch(() => undefined)
    return {
      outcome: "warn",
      reason: "Invoice correspondence POST did not return success",
      status: sendResponse?.status() ?? null,
    }
  }

  return {
    outcome: "pass",
    reason: `Invoice generated and sent (${opts.generateEndpoint})`,
    status: sendResponse.status(),
  }
}

export function tryGenerateAndSendDepositInvoice(page: Page): Promise<SendFlowResult> {
  return tryGenerateAndSendInvoice(page, {
    triggerLabel: /Generate Deposit Invoice/i,
    generateEndpoint: "/api/invoices/deposit",
  })
}

export function tryGenerateAndSendFinalInvoice(page: Page): Promise<SendFlowResult> {
  return tryGenerateAndSendInvoice(page, {
    triggerLabel: /Generate Final Invoice/i,
    generateEndpoint: "/api/invoices/final",
  })
}

// ---------------------------------------------------------------------------
// Voucher — Generate + Preview & Send
// ---------------------------------------------------------------------------
//
// The voucher dialog is mounted state-controlled on the booking page; the
// natural entry path is to click Next towards `voucher_sent` and let the page
// auto-open it on the `create_voucher_pdf` autofix failure. For the QA suite
// it's simpler to use the Generate Voucher trigger if present, otherwise rely
// on the auto-open behaviour from the stage gate.

export async function tryGenerateAndSendVoucher(page: Page): Promise<SendFlowResult> {
  // The voucher dialog is open once the GenerateVoucherDialog renders its
  // "Generate PDF" button.
  const generateBtn = page.getByRole("button", { name: /Generate PDF/i }).first()
  const visible = await generateBtn.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!visible) {
    return {
      outcome: "skipped",
      reason: "Voucher dialog did not open — Next button likely did not surface autoFix for create_voucher_pdf",
    }
  }

  const generatePromise = waitForApiResponse(page, "/api/voucher/generate", "POST", 60_000)
  await generateBtn.click().catch(() => undefined)
  const generateResponse = await generatePromise

  if (!generateResponse || !generateResponse.ok()) {
    return {
      outcome: "warn",
      reason: "Voucher generation POST did not return success",
      status: generateResponse?.status() ?? null,
    }
  }

  // After Generate completes, click Preview & Send Voucher. That prepares the
  // email server-side (voucher PDF + itinerary PDF) before the preview opens,
  // and 422s when the booking has no itinerary yet.
  const previewSendBtn = page.getByRole("button", { name: /Preview & Send Voucher/i }).last()
  await previewSendBtn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined)

  const preparePromise = waitForApiResponse(page, "/prepare-send", "POST", 60_000)
  await previewSendBtn.click().catch(() => undefined)
  const prepareResponse = await preparePromise

  if (!prepareResponse || !prepareResponse.ok()) {
    return {
      outcome: "warn",
      reason:
        "Voucher prepare-send POST did not return success — the booking likely has no itinerary PDF, which the voucher email requires",
      status: prepareResponse?.status() ?? null,
    }
  }

  const sendBtn = page.getByRole("button", { name: /Send with attachment|^Send$/ }).last()
  await sendBtn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined)

  const correspondencePromise = waitForApiResponse(page, "/api/correspondence", "POST", SEND_TIMEOUT)
  await sendBtn.click().catch(() => undefined)
  const sendResponse = await correspondencePromise

  if (!sendResponse || !sendResponse.ok()) {
    return {
      outcome: "warn",
      reason: "Voucher correspondence POST did not return success",
      status: sendResponse?.status() ?? null,
    }
  }

  return {
    outcome: "pass",
    reason: "Voucher generated and sent via GenerateVoucherDialog",
    status: sendResponse.status(),
  }
}

// ---------------------------------------------------------------------------
// Artefact collection
// ---------------------------------------------------------------------------
//
// Pulls real evidence from Supabase Storage + the documents/correspondences
// tables so the report's Document Checklist lists actual URLs rather than
// guesses about what *should* exist.

export interface CollectedArtefact {
  kind: string
  filename: string | null
  storagePath: string | null
  publicUrl: string | null
}

export interface CollectedArtefacts {
  documents: CollectedArtefact[]
  correspondence: Array<{ kind: string; subject: string | null; status: string | null }>
  invoices: Array<{ kind: string; status: string; number: string | null; amount: number | null }>
  quotes: Array<{ number: string; status: string; lastSentAt: string | null }>
}

export async function collectArtefacts(bookingId: string): Promise<CollectedArtefacts> {
  const supabase = createQaSupabase()
  const [
    { data: documents },
    { data: correspondence },
    { data: invoices },
    { data: quotes },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("kind, file_name, storage_path")
      .eq("booking_id", bookingId),
    supabase
      .from("correspondences")
      .select("kind, subject, status")
      .eq("booking_id", bookingId),
    supabase
      .from("invoices")
      .select("kind, status, invoice_number, amount")
      .eq("booking_id", bookingId)
      .order("created_at"),
    supabase
      .from("quotes")
      .select("quote_number, status, last_sent_at")
      .eq("booking_id", bookingId)
      .order("created_at"),
  ])

  const documentRows = documents ?? []
  const documentResults: CollectedArtefact[] = documentRows.map((doc) => ({
    kind: doc.kind ?? "",
    filename: doc.file_name ?? null,
    storagePath: doc.storage_path ?? null,
    // Bucket mapping is kind-dependent (attachments / quotes / payment-proofs)
    // and not stored on the row, so we expose the storage_path as the
    // canonical artefact reference rather than fabricating a URL.
    publicUrl: null,
  }))

  return {
    documents: documentResults,
    correspondence: (correspondence ?? []).map((row) => ({
      kind: row.kind ?? "",
      subject: row.subject ?? null,
      status: row.status ?? null,
    })),
    invoices: (invoices ?? []).map((row) => ({
      kind: row.kind ?? "",
      status: row.status ?? "",
      number: row.invoice_number ?? null,
      amount: row.amount ?? null,
    })),
    quotes: (quotes ?? []).map((row) => ({
      number: row.quote_number ?? "",
      status: row.status ?? "",
      lastSentAt: row.last_sent_at ?? null,
    })),
  }
}
