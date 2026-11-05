import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PreviewAndSendDialog } from "./preview-and-send-dialog"

const toastMocks = vi.hoisted(() => ({ warning: vi.fn() }))

vi.mock("sonner", () => ({
  toast: { warning: toastMocks.warning, success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/components/email-attachment-picker", () => ({
  EmailAttachmentPicker: () => null,
}))
vi.mock("@/components/signature-picker", () => ({
  SignaturePicker: () => null,
}))
vi.mock("@/components/payment-method-picker", () => ({
  PaymentMethodPicker: () => null,
}))
vi.mock("@/components/save-without-sending-button", () => ({
  SaveWithoutSendingButton: () => null,
}))
vi.mock("@/components/ui/html-body-editor", () => ({
  HtmlBodyEditor: () => null,
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
vi.mock("@/lib/use-data", () => ({
  useEmailAppearanceSettings: () => ({ data: undefined }),
}))

function wrap(content: string): string {
  return `<div>wrapper<!--CONTENT-->${content}<!--/CONTENT--></div>`
}

function renderDialog(props: { open: boolean; content: string; subject?: string }) {
  return (
    <PreviewAndSendDialog
      open={props.open}
      onOpenChange={() => {}}
      title="Payment received"
      description="Confirms the payment"
      bookingId="booking-1"
      initialSubject={props.subject ?? "Rovos Rail | le Roux"}
      bodyHtml={wrap(props.content)}
      bodyContentHtml={props.content}
      kind="payment_received"
      to="client@example.com"
      onSent={() => {}}
    />
  )
}

function previewHtml(): string {
  return screen.getByTitle("Email preview").getAttribute("srcdoc") ?? ""
}

describe("PreviewAndSendDialog", () => {
  it("shows the freshly prepared body when the same instance is re-prepared", () => {
    const deposit = "Amount received: R96 500,00. Final amount due: R289 500,00"
    const final = "Amount received: R386 000,00. Final amount due: R0,00"

    const { rerender } = render(renderDialog({ open: true, content: deposit }))
    expect(previewHtml()).toContain("R289 500,00")

    // Sent and closed; the caller keeps the dialog mounted.
    rerender(renderDialog({ open: false, content: deposit }))
    // Final payment recorded, confirmation prepared again into the same instance.
    rerender(renderDialog({ open: true, content: final }))

    expect(previewHtml()).toContain("R386 000,00")
    expect(previewHtml()).toContain("R0,00")
    expect(previewHtml()).not.toContain("R289 500,00")
  })

  it("previews the content with the spacing the send writes inline, so Outlook's view is what's shown", () => {
    render(
      <PreviewAndSendDialog
        open
        onOpenChange={() => {}}
        title="Payment received"
        description="Confirms the payment"
        bookingId="booking-1"
        initialSubject="Hi"
        bodyHtml={`<div><p>Masthead</p><!--LUXUS_CONTENT_START--><p>Old</p><!--LUXUS_CONTENT_END--></div>`}
        bodyContentHtml="<p>Dear Jane,</p><p><br></p>"
        kind="payment_received"
        onSent={() => {}}
      />,
    )

    expect(previewHtml()).toContain('<p style="margin:0 0 8px;">Dear Jane,</p><p style="margin:0 0 8px;">&nbsp;</p>')
    expect(previewHtml()).toContain("<p>Masthead</p>")
  })

  it("resets the subject to the new prepared email", () => {
    const { rerender } = render(renderDialog({ open: true, content: "a", subject: "First" }))
    expect(screen.getByLabelText("Subject")).toHaveValue("First")

    rerender(renderDialog({ open: false, content: "a", subject: "First" }))
    rerender(renderDialog({ open: true, content: "b", subject: "Second" }))

    expect(screen.getByLabelText("Subject")).toHaveValue("Second")
  })

  describe("when the email goes out", () => {
    const WARNING =
      "Email sent, but a copy of the PDF could not be kept for the booking history. Tell your administrator."

    afterEach(() => {
      vi.unstubAllGlobals()
      toastMocks.warning.mockReset()
    })

    async function sendAndWait(response: { ok: boolean; body: unknown }) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: response.ok, json: async () => response.body })),
      )
      const onSent = vi.fn()
      render(
        <PreviewAndSendDialog
          open
          onOpenChange={() => {}}
          title="Invoice"
          description="Sends the invoice"
          bookingId="booking-1"
          initialSubject="Invoice"
          bodyHtml={wrap("<p>Hi</p>")}
          bodyContentHtml="<p>Hi</p>"
          kind="invoice"
          onSent={onSent}
        />,
      )
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      await waitFor(() => expect(fetch).toHaveBeenCalled())
      // Let the send's own continuation (the warning, then onSent) run.
      await new Promise((resolve) => setTimeout(resolve, 0))
      return onSent
    }

    it("warns that no copy was kept, and still finishes the send, when documentCopyKept is false", async () => {
      const onSent = await sendAndWait({ ok: true, body: { id: "cor-1", documentCopyKept: false } })

      expect(toastMocks.warning).toHaveBeenCalledTimes(1)
      expect(toastMocks.warning).toHaveBeenCalledWith(WARNING)
      expect(onSent).toHaveBeenCalledTimes(1)
    })

    it("shows no warning when the copy was kept", async () => {
      const onSent = await sendAndWait({ ok: true, body: { id: "cor-1", documentCopyKept: true } })

      expect(toastMocks.warning).not.toHaveBeenCalled()
      expect(onSent).toHaveBeenCalledTimes(1)
    })

    it("shows no warning when the response does not say (an older server)", async () => {
      await sendAndWait({ ok: true, body: { id: "cor-1" } })

      expect(toastMocks.warning).not.toHaveBeenCalled()
    })

    it("shows no copy warning when the send itself failed", async () => {
      const onSent = await sendAndWait({ ok: false, body: { error: "smtp 535", documentCopyKept: false } })

      expect(toastMocks.warning).not.toHaveBeenCalled()
      expect(onSent).not.toHaveBeenCalled()
    })
  })
})
