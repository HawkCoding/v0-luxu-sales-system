// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/use-data", () => ({ usePaymentMethods: () => ({ data: undefined }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/components/preview-and-send-dialog", () => ({
  PreviewAndSendDialog: (props: { open: boolean; title: string; description: string; kind: string; moveStage?: string }) =>
    props.open ? (
      <div role="dialog" data-kind={props.kind} data-move-stage={props.moveStage}>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
    ) : null,
}))

import { billingQuote, GenerateDepositInvoiceDialog } from "./generate-deposit-invoice-dialog"
import type { Invoice, Quote } from "@/lib/types"

function quote(overrides: Partial<Quote>): Quote {
  return {
    id: "q",
    itineraryId: "i",
    jobId: "j",
    status: "draft",
    validityUntil: "2026-12-31",
    lineItems: [],
    subtotal: 0,
    total: 0,
    currency: "ZAR",
    ...overrides,
  }
}

describe("billingQuote", () => {
  it("bills the accepted revision even when its superseded parent was updated later", () => {
    const parent = quote({ id: "q1", status: "superseded", total: 129_530, updatedAt: "2026-10-07T12:00:05Z" })
    const revision = quote({ id: "q2", status: "accepted", total: 121_020, updatedAt: "2026-10-07T12:00:00Z" })
    expect(billingQuote([parent, revision])?.id).toBe("q2")
  })

  it("falls back to the latest priced quote when none is accepted", () => {
    const older = quote({ id: "q1", status: "sent", total: 100, updatedAt: "2026-10-01T00:00:00Z" })
    const newer = quote({ id: "q2", status: "sent", total: 200, updatedAt: "2026-10-02T00:00:00Z" })
    const unpriced = quote({ id: "q3", status: "draft", total: 0, updatedAt: "2026-10-03T00:00:00Z" })
    expect(billingQuote([older, newer, unpriced])?.id).toBe("q2")
  })

  it("returns null with no priced quote", () => {
    expect(billingQuote([quote({ total: 0 })])).toBeNull()
  })
})

function sentInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    jobId: "job-1",
    quoteId: "q1",
    kind: "deposit",
    status: "sent",
    invoiceNumber: "244453",
    depositPercentage: 30,
    amount: 300,
    currency: "ZAR",
    dueDate: "2026-12-04",
    sentAt: "2026-11-01T10:00:00.000Z",
    createdAt: "2026-11-01T09:00:00.000Z",
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof GenerateDepositInvoiceDialog>>) {
  return render(
    <GenerateDepositInvoiceDialog
      jobId="job-1"
      bookingNumber="LTT-26-0039"
      customerName="Ada Lovelace"
      quotes={[quote({ id: "q1", status: "accepted", total: 1000 })]}
      defaultDepositPercentage={25}
      onSent={() => undefined}
      {...props}
    />,
  )
}

const generated = {
  invoice: sentInvoice(),
  email: { to: "ada@example.test", subject: "Invoice", bodyHtml: "<p>hi</p>" },
  attachment: { filename: "Invoice-244453.pdf", contentBase64: "JVBERg==", contentType: "application/pdf" },
}

describe("GenerateDepositInvoiceDialog — sending an updated invoice", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => generated })),
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("offers 'Send Updated Invoice' for an invoice that has already gone out", () => {
    renderDialog({ resendInvoice: sentInvoice() })
    expect(screen.getByRole("button", { name: "Send Updated Invoice" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Generate Invoice/ })).not.toBeInTheDocument()
  })

  it("re-issues the invoice at ITS deposit percentage, not the default, and goes straight to the preview", async () => {
    renderDialog({ resendInvoice: sentInvoice({ depositPercentage: 30 }), open: true, trigger: false })

    await waitFor(() => expect(screen.getByText("Preview and send updated invoice")).toBeInTheDocument())

    const fetchMock = vi.mocked(fetch)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe("/api/invoices/deposit")
    expect(JSON.parse(init.body)).toEqual({ jobId: "job-1", mode: "deposit", depositPercentage: 30 })
    // Sent as an invoice email; a resend never moves a booking backwards because the server ignores
    // an earlier target stage.
    expect(document.querySelector('[data-kind="invoice"]')).not.toBeNull()
  })

  it("keeps a full-payment invoice in full mode", async () => {
    renderDialog({
      resendInvoice: sentInvoice({ kind: "full", depositPercentage: null }),
      open: true,
      trigger: false,
    })

    await waitFor(() => expect(screen.getByText("Preview and send updated invoice")).toBeInTheDocument())
    const [, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body)).toMatchObject({ mode: "full", depositPercentage: 100 })
  })

  it("still labels an unsent draft the way it always did", () => {
    renderDialog({ draftInvoice: sentInvoice({ status: "draft" }) })
    expect(screen.getByRole("button", { name: "Preview & Send Deposit Invoice" })).toBeInTheDocument()
  })
})
