import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QuotePreviewSendDialog } from "./quote-preview-send-dialog"
import type { Quote } from "@/lib/types"

// The picker/editor children each do their own SWR/network work that is
// irrelevant to what's under test here (the email composer never persisting
// to localStorage). Stubbed out so the dialog's own preview-load logic is
// what's exercised.
vi.mock("@/components/email-attachment-picker", () => ({
  EmailAttachmentPicker: (props: { onSelectedChange: (ids: string[]) => void }) => (
    <button type="button" data-testid="tick-attachment" onClick={() => props.onSelectedChange(["lib-1"])} />
  ),
}))
vi.mock("@/components/signature-picker", () => ({
  SignaturePicker: () => null,
}))
vi.mock("@/components/ui/html-body-editor", () => ({
  HtmlBodyEditor: (props: { value: string }) => <div data-testid="body-editor">{props.value}</div>,
}))

const quote: Quote = {
  id: "quote-1",
  itineraryId: "itin-1",
  jobId: "booking-1",
  status: "sent",
  quoteNumber: "LTT-2026-0019-Q2",
  validityUntil: "2026-09-01",
  lineItems: [],
  subtotal: 1000,
  total: 1000,
  currency: "ZAR",
}

function jsonResponse<T>(body: T): { ok: true; json: () => Promise<T> } {
  return { ok: true, json: () => Promise.resolve(body) }
}

const previewPayload = {
  html: "<div>wrapper<!--CONTENT-->rendered content<!--/CONTENT--></div>",
  bodyContentHtml: "rendered content",
  subject: "Quote LTT-2026-0019",
  quoteNumber: "LTT-2026-0019-Q2",
  warnings: [],
  signatureProfileId: null,
  signatureBrandId: null,
}

describe("QuotePreviewSendDialog", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("never writes anything to localStorage, even after edits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(previewPayload)))

    render(
      <QuotePreviewSendDialog
        quote={quote}
        bookingNumber="LTT-2026-0019"
        customerName="Mr Test"
        open
        onOpenChange={() => {}}
        onSent={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("body-editor")).toHaveTextContent("rendered content")
    })

    screen.getByTestId("tick-attachment").click()
    // No debounce/autosave timer exists any more -- a real wait here would just be waiting on
    // nothing, so a short settle is enough to prove no localStorage write follows the edit.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(window.localStorage.length).toBe(0)
  })

  it("always starts from a clean server render, ignoring anything from a previous session", async () => {
    // Seed localStorage the way the old autosave used to -- proves a leftover key from before
    // this feature was removed has no effect on what the dialog shows.
    window.localStorage.setItem(
      "draft:email-quote:quote-1",
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        recordUpdatedAt: null,
        data: { subject: "Stale subject", content: null, libraryAttachmentIds: ["stale-lib"] },
      }),
    )
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(previewPayload)))

    render(
      <QuotePreviewSendDialog
        quote={quote}
        bookingNumber="LTT-2026-0019"
        customerName="Mr Test"
        open
        onOpenChange={() => {}}
        onSent={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("body-editor")).toHaveTextContent("rendered content")
    })
    expect(screen.getByLabelText("Subject")).toHaveValue(previewPayload.subject)
  })
})
