import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { PreviewAndSendDialog } from "./preview-and-send-dialog"

vi.mock("@/components/email-attachment-picker", () => ({
  EmailAttachmentPicker: () => null,
}))
vi.mock("@/components/signature-picker", () => ({
  SignaturePicker: () => null,
}))
vi.mock("@/components/payment-method-picker", () => ({
  PaymentMethodPicker: () => null,
}))
vi.mock("@/components/ui/html-body-editor", () => ({
  HtmlBodyEditor: () => null,
}))
vi.mock("@/hooks/use-optimistic-send", () => ({
  useOptimisticSend: () => vi.fn(),
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

  it("resets the subject to the new prepared email", () => {
    const { rerender } = render(renderDialog({ open: true, content: "a", subject: "First" }))
    expect(screen.getByLabelText("Subject")).toHaveValue("First")

    rerender(renderDialog({ open: false, content: "a", subject: "First" }))
    rerender(renderDialog({ open: true, content: "b", subject: "Second" }))

    expect(screen.getByLabelText("Subject")).toHaveValue("Second")
  })
})
