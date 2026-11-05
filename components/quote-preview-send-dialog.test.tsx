import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QuotePreviewSendDialog } from "./quote-preview-send-dialog"
import type { Quote } from "@/lib/types"

const toastMocks = vi.hoisted(() => ({ warning: vi.fn() }))
// What the real save button reports once it has seen the booking's document history.
const saveButtonState = vi.hoisted(() => ({ emailedBefore: false }))

vi.mock("sonner", () => ({
  toast: { warning: toastMocks.warning, success: vi.fn(), error: vi.fn() },
}))
vi.mock("@/components/save-without-sending-button", () => ({
  SaveWithoutSendingButton: (props: { onEmailedBeforeChange?: (emailedBefore: boolean) => void }) => {
    const { onEmailedBeforeChange } = props
    useEffect(() => {
      onEmailedBeforeChange?.(saveButtonState.emailedBefore)
    }, [onEmailedBeforeChange])
    return null
  },
}))
// Runs the send straight away (no undo delay) and reports it the way the real hook does.
vi.mock("@/hooks/use-optimistic-send", () => ({
  useOptimisticSend: () => async (options: { perform: () => Promise<unknown> }) => {
    try {
      return { ok: true, data: await options.perform() }
    } catch (error) {
      return { ok: false, error }
    }
  },
}))

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
    saveButtonState.emailedBefore = false
    toastMocks.warning.mockReset()
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

  function renderDialog() {
    return render(
      <QuotePreviewSendDialog
        quote={quote}
        bookingNumber="LTT-2026-0019"
        customerName="Mr Test"
        open
        onOpenChange={() => {}}
        onSent={() => {}}
      />,
    )
  }

  it("titles the dialog as an updated quote only once a quote has been emailed before", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(previewPayload)))

    const { unmount } = renderDialog()
    expect(screen.getByRole("heading", { name: "Preview & Send Quote" })).toBeInTheDocument()
    unmount()

    saveButtonState.emailedBefore = true
    renderDialog()
    expect(await screen.findByRole("heading", { name: "Preview & Send Updated Quote" })).toBeInTheDocument()
  })

  it("says the quote settings save straight away, and marks the chosen option as pressed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...previewPayload,
          config: {
            primarySupplierId: "supplier-1",
            primarySupplierName: "Rovos Rail",
            journeyClass: "short",
            rateAudience: "international",
            trainOnly: false,
            auto: { journeyClass: false, rateAudience: true, trainOnly: true },
            unresolved: [],
          },
        }),
      ),
    )

    renderDialog()

    expect(await screen.findByText("Changing these updates the quote straight away.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Short" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Long" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Intl" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Local" })).toHaveAttribute("aria-pressed", "false")
  })

  describe("when the quote email goes out", () => {
    const WARNING =
      "Email sent, but a copy of the PDF could not be kept for the booking history. Tell your administrator."

    async function sendWith(sendBody: unknown, sendOk = true) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url === "/api/correspondence"
            ? { ok: sendOk, json: async () => sendBody }
            : jsonResponse(previewPayload),
        ),
      )
      const onSent = vi.fn()
      render(
        <QuotePreviewSendDialog
          quote={quote}
          bookingNumber="LTT-2026-0019"
          customerName="Mr Test"
          open
          onOpenChange={() => {}}
          onSent={onSent}
        />,
      )
      await waitFor(() => expect(screen.getByTestId("body-editor")).toHaveTextContent("rendered content"))
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/correspondence", expect.anything()))
      // Let the send's own continuation (the warning, then onSent) run.
      await new Promise((resolve) => setTimeout(resolve, 0))
      return onSent
    }

    it("warns that no copy was kept, and still finishes the send, when documentCopyKept is false", async () => {
      const onSent = await sendWith({ id: "cor-1", documentCopyKept: false })

      expect(toastMocks.warning).toHaveBeenCalledTimes(1)
      expect(toastMocks.warning).toHaveBeenCalledWith(WARNING)
      expect(onSent).toHaveBeenCalledTimes(1)
    })

    it("shows no warning when the copy was kept", async () => {
      const onSent = await sendWith({ id: "cor-1", documentCopyKept: true })

      expect(toastMocks.warning).not.toHaveBeenCalled()
      expect(onSent).toHaveBeenCalledTimes(1)
    })

    it("shows no warning when the response does not say (an older server)", async () => {
      await sendWith({ id: "cor-1" })

      expect(toastMocks.warning).not.toHaveBeenCalled()
    })

    it("shows no copy warning when the send itself failed", async () => {
      const onSent = await sendWith({ error: "smtp 535", documentCopyKept: false }, false)

      expect(toastMocks.warning).not.toHaveBeenCalled()
      expect(onSent).not.toHaveBeenCalled()
    })
  })
})
