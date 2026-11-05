import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import type { Quote, QuoteLineItem } from "@/lib/types"
import { formatDisplayDateTime } from "@/lib/date-format"

vi.mock("@/lib/role-context", () => ({
  useRole: () => ({ can: () => true }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The real dialogs pull in SWR, FX and presence hooks; this test is only about which quote gets the
// Amend entry point, so each stands in as a button that says which mode it was rendered in.
vi.mock("@/components/build-booking-dialog", () => ({
  BuildBookingDialog: ({
    quoteId,
    amend,
    editBookingWording,
  }: {
    quoteId: string
    amend?: { currentTotal: number; bookingStage?: string | null }
    editBookingWording?: boolean
  }) => (
    <button
      type="button"
      data-quote-id={quoteId}
      data-mode={amend ? "amend" : "replace"}
      data-current-total={amend?.currentTotal}
      data-booking-stage={amend?.bookingStage ?? undefined}
    >
      {amend || editBookingWording ? "Edit Booking" : "Edit Quote"}
    </button>
  ),
}))
vi.mock("@/components/quotes/convert-quote-currency-dialog", () => ({ ConvertQuoteCurrencyDialog: () => null }))
vi.mock("@/components/create-quote-dialog", () => ({
  CreateQuoteDialog: () => <button type="button">Create New Quote</button>,
}))
vi.mock("@/components/quote-preview-send-dialog", () => ({ QuotePreviewSendDialog: () => null }))
vi.mock("@/components/quotes/quote-adjustments-ledger", () => ({
  QuoteAdjustmentsLedger: ({ quote, editable }: { quote: { id: string }; editable: boolean }) => (
    <div data-testid={`ledger-${quote.id}`} data-editable={String(editable)} />
  ),
}))

import { JobQuotesTab } from "./job-quotes-tab"

function buildQuote(overrides: Partial<Quote>): Quote {
  return {
    id: "q1",
    itineraryId: "",
    jobId: "job-1",
    status: "draft",
    quoteNumber: "LTT-26-0001-Q1",
    validityUntil: "2026-10-21",
    updatedAt: "2026-10-07T00:00:00.000Z",
    lineItems: [
      { description: "Package Total", supplierDescription: null, qty: 1, unitPrice: 24800, total: 24800, pricingSnapshot: null },
    ],
    subtotal: 24800,
    total: 24800,
    currency: "ZAR",
    ...overrides,
  }
}

function renderTab(
  quotes: Quote[],
  booking: { stage?: string | null; cancelledAt?: string | null } = { stage: "deposit_paid", cancelledAt: null },
  extraProps: Partial<ComponentProps<typeof JobQuotesTab>> = {},
) {
  return render(
    <JobQuotesTab
      quotes={quotes}
      jobId="job-1"
      bookingNumber="LTT-26-0001"
      travelDate={null}
      customerName="Jane Doe"
      bookingHeadcount={2}
      bookingStage={booking.stage}
      bookingCancelledAt={booking.cancelledAt}
      mutate={() => undefined}
      {...extraProps}
    />,
  )
}

const SENT_AT = "2026-10-08T09:30:00.000Z"

/** A line with no price, which is what makes a quote "Provisional (Incomplete)". */
const UNPRICED_LINES: QuoteLineItem[] = [
  { description: "Rovos Rail suite", supplierDescription: null, qty: 2, unitPrice: 0, total: 0, pricingSnapshot: null },
]

describe("JobQuotesTab — Edit Booking", () => {
  it("offers Edit Booking on the accepted quote through the in-place engine", () => {
    renderTab([buildQuote({ id: "accepted-1", status: "accepted", total: 21800 })])

    const edit = screen.getByRole("button", { name: "Edit Booking" })
    expect(edit).toHaveAttribute("data-quote-id", "accepted-1")
    expect(edit).toHaveAttribute("data-mode", "amend")
    expect(edit).toHaveAttribute("data-current-total", "21800")
    expect(screen.queryByRole("button", { name: "Edit Quote" })).not.toBeInTheDocument()
  })

  it.each(["sent", "expired"] as const)("offers Edit Booking on a %s quote through the normal builder", (status) => {
    renderTab([buildQuote({ id: "q-1", status })])

    const edit = screen.getByRole("button", { name: "Edit Booking" })
    expect(edit).toHaveAttribute("data-quote-id", "q-1")
    expect(edit).toHaveAttribute("data-mode", "replace")
  })

  it.each(["draft", "pricing_incomplete", "ready"] as const)(
    "keeps the first-time builder wording on a %s quote",
    (status) => {
      renderTab([buildQuote({ status })])
      expect(screen.queryByRole("button", { name: "Edit Booking" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Edit Quote" })).toBeInTheDocument()
    },
  )

  it.each(["superseded", "cancelled"] as const)("does not offer Edit Booking on a %s quote", (status) => {
    renderTab([buildQuote({ status })])
    expect(screen.queryByRole("button", { name: "Edit Booking" })).not.toBeInTheDocument()
  })

  it.each(["draft", "sent", "accepted", "expired", "superseded", "cancelled"] as const)(
    "never shows Revise on a %s quote",
    (status) => {
      renderTab([buildQuote({ status })])
      expect(screen.queryByRole("button", { name: /revise/i })).not.toBeInTheDocument()
    },
  )

  it.each([
    ["closed", { stage: "closed", cancelledAt: null }],
    ["lost", { stage: "lost", cancelledAt: null }],
    ["cancelled", { stage: "deposit_paid", cancelledAt: "2026-10-01T00:00:00Z" }],
  ])("hides Edit Booking on a %s booking for sent, expired and accepted quotes", (_label, booking) => {
    for (const status of ["sent", "expired", "accepted"] as const) {
      const view = renderTab([buildQuote({ status })], booking)
      expect(screen.queryByRole("button", { name: "Edit Booking" })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it("passes the booking stage through so the confirmation can warn after the voucher", () => {
    renderTab([buildQuote({ status: "accepted" })], { stage: "voucher_sent", cancelledAt: null })

    expect(screen.getByRole("button", { name: "Edit Booking" })).toHaveAttribute("data-booking-stage", "voucher_sent")
  })

  it("only puts Edit Booking on the accepted quote when superseded versions sit beside it", () => {
    renderTab([
      buildQuote({ id: "old", status: "superseded", quoteNumber: "LTT-26-0001-Q1" }),
      buildQuote({ id: "current", status: "accepted", quoteNumber: "LTT-26-0001-Q2" }),
    ])

    const buttons = screen.getAllByRole("button", { name: "Edit Booking" })
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAttribute("data-quote-id", "current")
  })
})

describe("JobQuotesTab — Create New Quote", () => {
  it.each(["draft", "sent", "expired"] as const)("is shown while the quote is %s", (status) => {
    renderTab([buildQuote({ status })])
    expect(screen.getByRole("button", { name: "Create New Quote" })).toBeInTheDocument()
  })

  it("is hidden once a quote is accepted, even beside superseded ones", () => {
    renderTab([buildQuote({ id: "old", status: "superseded" }), buildQuote({ id: "cur", status: "accepted" })])
    expect(screen.queryByRole("button", { name: "Create New Quote" })).not.toBeInTheDocument()
  })
})

describe("JobQuotesTab — price adjustments", () => {
  function ledgerEditable(id: string): string | null {
    return screen.getByTestId(`ledger-${id}`).getAttribute("data-editable")
  }

  it.each(["draft", "pricing_incomplete", "ready", "sent", "accepted", "expired"] as const)(
    "lets Commission, Rounding and Discount be changed on a %s quote",
    (status) => {
      renderTab([buildQuote({ id: "q", status })])
      expect(ledgerEditable("q")).toBe("true")
    },
  )

  it.each(["superseded", "cancelled"] as const)("keeps a %s quote's adjustments read-only", (status) => {
    renderTab([buildQuote({ id: "q", status })])
    expect(ledgerEditable("q")).toBe("false")
  })

  it("keeps a sent or accepted quote read-only once the booking is closed or cancelled", () => {
    for (const booking of [
      { stage: "closed", cancelledAt: null },
      { stage: "lost", cancelledAt: null },
      { stage: "deposit_paid", cancelledAt: "2026-10-01T00:00:00Z" },
    ]) {
      const view = renderTab([buildQuote({ id: "q", status: "accepted" })], booking)
      expect(ledgerEditable("q")).toBe("false")
      view.unmount()
    }
  })

  it("still lets a provisional quote be adjusted whatever the booking stage", () => {
    renderTab([buildQuote({ id: "q", status: "draft" })], { stage: "closed", cancelledAt: null })
    expect(ledgerEditable("q")).toBe("true")
  })
})

describe("JobQuotesTab — sending", () => {
  it("sends the draft when there is one", () => {
    renderTab([buildQuote({ status: "draft" })])
    expect(screen.getByRole("button", { name: "Preview & Send" })).toBeEnabled()
  })

  it.each(["sent", "accepted"] as const)(
    "lets the %s quote the client holds be sent again, as an update, once nothing else is waiting",
    (status) => {
      renderTab([buildQuote({ status, lastSentAt: SENT_AT })])
      expect(screen.getByRole("button", { name: "Preview & Send Updated Quote" })).toBeEnabled()
    },
  )

  it.each(["sent", "accepted"] as const)(
    "does not call a %s quote with no email behind it an update",
    (status) => {
      renderTab([buildQuote({ status })])
      expect(screen.getByRole("button", { name: "Preview & Send" })).toBeEnabled()
      expect(screen.queryByRole("button", { name: "Preview & Send Updated Quote" })).not.toBeInTheDocument()
    },
  )

  it("calls a new draft beside an emailed quote an updated quote", () => {
    renderTab([
      buildQuote({ id: "q1", status: "superseded", quoteNumber: "LTT-26-0001-Q1", lastSentAt: SENT_AT }),
      buildQuote({ id: "q2", status: "draft", quoteNumber: "LTT-26-0001-Q2" }),
    ])
    expect(screen.getByRole("button", { name: "Preview & Send Updated Quote" })).toBeEnabled()
  })

  it("reads Updated Quote when the booking says a quote email went out, whatever the statuses", () => {
    renderTab([buildQuote({ status: "accepted" })], undefined, { quoteEmailedBefore: true })
    expect(screen.getByRole("button", { name: "Preview & Send Updated Quote" })).toBeEnabled()
  })

  it("does not read Updated Quote when there is nothing to send, even if an email went out", () => {
    renderTab([buildQuote({ status: "cancelled" })], undefined, { quoteEmailedBefore: true })
    expect(screen.getByRole("button", { name: "Preview & Send" })).toBeDisabled()
  })

  it("does not offer to resend a superseded or cancelled quote", () => {
    renderTab([buildQuote({ status: "superseded" }), buildQuote({ id: "q2", status: "cancelled" })])
    expect(screen.getByRole("button", { name: "Preview & Send" })).toBeDisabled()
  })

  it("prefers a waiting draft over resending the issued quote", () => {
    renderTab([buildQuote({ id: "issued", status: "accepted" }), buildQuote({ id: "draft", status: "draft" })])
    expect(screen.getByRole("button", { name: "Preview & Send" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Preview & Send Updated Quote" })).not.toBeInTheDocument()
  })

  it("keeps the send button the main action unless the booking is known to be unchanged", () => {
    const sent = [buildQuote({ status: "sent", lastSentAt: SENT_AT })]

    const unknown = renderTab(sent)
    expect(screen.getByRole("button", { name: "Preview & Send Updated Quote" })).toHaveClass("bg-primary")
    unknown.unmount()

    const changed = renderTab(sent, undefined, { quoteChangedSinceSent: true })
    expect(screen.getByRole("button", { name: "Preview & Send Updated Quote" })).toHaveClass("bg-primary")
    changed.unmount()

    renderTab(sent, undefined, { quoteChangedSinceSent: false })
    expect(screen.getByRole("button", { name: "Preview & Send Updated Quote" })).not.toHaveClass("bg-primary")
  })
})

describe("JobQuotesTab — what the send button does", () => {
  it("says which quote it sends", () => {
    renderTab([
      buildQuote({ id: "q1", status: "superseded", quoteNumber: "LTT-26-0001-Q1" }),
      buildQuote({ id: "q2", status: "draft", quoteNumber: "LTT-26-0001-Q2" }),
    ])
    expect(screen.getByText("Sends Quote 2 to the client.")).toBeInTheDocument()
  })

  it("names the quote the client holds when it is sent again", () => {
    renderTab([buildQuote({ status: "sent", quoteNumber: "LTT-26-0001-Q3", lastSentAt: SENT_AT })])
    expect(screen.getByText("Sends Quote 3 to the client.")).toBeInTheDocument()
  })

  it("explains why the button is off when every quote is cancelled or replaced", () => {
    renderTab([buildQuote({ status: "superseded" }), buildQuote({ id: "q2", status: "cancelled" })])
    expect(
      screen.getByText("Nothing to send: every quote here is cancelled or replaced. Create a new quote to send one."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Preview & Send" })).not.toHaveAttribute("title")
  })

  it("does not call an expired quote cancelled or replaced", () => {
    renderTab([buildQuote({ status: "expired" })])
    expect(
      screen.getByText(
        "Nothing to send: every quote here is expired, cancelled or replaced. Create a new quote to send one.",
      ),
    ).toBeInTheDocument()
  })
})

describe("JobQuotesTab — empty", () => {
  it("tells the salesperson what to do first", () => {
    renderTab([])
    expect(
      screen.getByText("No quotes yet. Create one, add the services, then preview and send it to the client."),
    ).toBeInTheDocument()
  })
})

describe("JobQuotesTab — order", () => {
  function cardTitles(): string[] {
    return Array.from(document.querySelectorAll('[data-slot="card-title"]')).map((node) => node.textContent ?? "")
  }

  it("lists the newest quote first without reordering the quotes it was given", () => {
    const quotes = [
      buildQuote({ id: "q1", status: "superseded", quoteNumber: "LTT-26-0001-Q1" }),
      buildQuote({ id: "q2", status: "sent", quoteNumber: "LTT-26-0001-Q2" }),
      buildQuote({ id: "q3", status: "draft", quoteNumber: "LTT-26-0001-Q3" }),
    ]
    renderTab(quotes)

    expect(cardTitles()).toEqual(["Quote 3", "Quote 2", "Quote 1"])
    expect(quotes.map((quote) => quote.id)).toEqual(["q1", "q2", "q3"])
  })
})

describe("JobQuotesTab — next step on each card", () => {
  const PRICE_GAP_EDITABLE = "Some services have no price yet. Use Edit Quote to price them before sending."

  it.each(["pricing_incomplete", "draft", "ready"] as const)(
    "tells the salesperson to price the unpriced services on a %s quote",
    (status) => {
      renderTab([buildQuote({ status, lineItems: UNPRICED_LINES })])
      expect(screen.getByText(PRICE_GAP_EDITABLE)).toBeInTheDocument()
      expect(screen.queryByText(/Not sent yet/)).not.toBeInTheDocument()
    },
  )

  it("says the same on a pricing-incomplete quote even when the lines look priced", () => {
    renderTab([buildQuote({ status: "pricing_incomplete" })])
    expect(screen.getByText(PRICE_GAP_EDITABLE)).toBeInTheDocument()
  })

  it("points at Edit Booking, the button a sent quote really has, for an unpriced line", () => {
    renderTab([buildQuote({ status: "sent", lineItems: UNPRICED_LINES })])
    expect(screen.getByText("Some services have no price yet. Use Edit Booking to price them.")).toBeInTheDocument()
  })

  it("says nothing about prices on a cancelled or replaced quote", () => {
    for (const status of ["cancelled", "superseded"] as const) {
      const view = renderTab([buildQuote({ status, lineItems: UNPRICED_LINES })])
      expect(screen.queryByText(/no price yet/)).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it("tells the salesperson to send the quote that is waiting to go", () => {
    renderTab([buildQuote({ status: "draft" })])
    expect(screen.getByText("Not sent yet. Check the services, then use Preview & Send.")).toBeInTheDocument()
  })

  it("names the updated-quote button when the waiting quote is an update", () => {
    renderTab([
      buildQuote({ id: "q1", status: "superseded", quoteNumber: "LTT-26-0001-Q1", lastSentAt: SENT_AT }),
      buildQuote({ id: "q2", status: "draft", quoteNumber: "LTT-26-0001-Q2" }),
    ])
    expect(
      screen.getByText("Not sent yet. Check the services, then use Preview & Send Updated Quote."),
    ).toBeInTheDocument()
  })

  it("only gives the send instruction to the quote the button sends", () => {
    renderTab([
      buildQuote({ id: "older", status: "draft", quoteNumber: "LTT-26-0001-Q1" }),
      buildQuote({ id: "newer", status: "ready", quoteNumber: "LTT-26-0001-Q2" }),
    ])
    expect(screen.getAllByText(/Not sent yet\. Check the services/)).toHaveLength(1)
  })

  it("tells the salesperson a sent quote is waiting and how to change it", () => {
    renderTab([buildQuote({ status: "sent", lastSentAt: SENT_AT })])
    expect(
      screen.getByText(
        "Waiting for the client. To change services, dates or guests, use Edit Booking, then send them an updated quote.",
      ),
    ).toBeInTheDocument()
  })

  it("tells the salesperson how to change an accepted quote", () => {
    renderTab([buildQuote({ status: "accepted", lastSentAt: SENT_AT })])
    expect(
      screen.getByText(
        "Accepted. To change services, dates or guests, use Edit Booking. Nothing is emailed until you send an update.",
      ),
    ).toBeInTheDocument()
  })

  it("does not point at Edit Booking once the booking is closed", () => {
    renderTab([buildQuote({ status: "sent", lastSentAt: SENT_AT })], { stage: "closed", cancelledAt: null })
    expect(screen.getByText("Waiting for the client.")).toBeInTheDocument()
    expect(screen.queryByText(/Edit Booking/)).not.toBeInTheDocument()
  })

  it("has no next step for an expired, replaced or cancelled quote", () => {
    for (const status of ["expired", "superseded", "cancelled"] as const) {
      const view = renderTab([buildQuote({ status })])
      expect(screen.queryByText(/Waiting for the client|Accepted\.|Not sent yet|no price yet/)).not.toBeInTheDocument()
      view.unmount()
    }
  })

  describe("when the booking has changed since the quote was sent", () => {
    const WARNING =
      "The booking has changed since this was sent. The client may still have the old version. Use Preview & Send Updated Quote, or save it without sending from the send window."

    it.each(["sent", "accepted"] as const)("warns on the %s quote the client holds", (status) => {
      renderTab([buildQuote({ status, lastSentAt: SENT_AT })], undefined, { quoteChangedSinceSent: true })

      expect(screen.getByRole("status")).toHaveTextContent(WARNING)
      expect(screen.queryByText(/Waiting for the client/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Nothing is emailed until you send an update/)).not.toBeInTheDocument()
    })

    it.each([[false], [undefined]])("shows no warning when the prop is %s", (changed) => {
      renderTab([buildQuote({ status: "sent", lastSentAt: SENT_AT })], undefined, {
        quoteChangedSinceSent: changed,
      })

      expect(screen.queryByRole("status")).not.toBeInTheDocument()
      expect(screen.getByText(/Waiting for the client/)).toBeInTheDocument()
    })

    it("does not put the warning on a draft waiting beside the quote the client holds", () => {
      renderTab(
        [
          buildQuote({ id: "issued", status: "sent", quoteNumber: "LTT-26-0001-Q1", lastSentAt: SENT_AT }),
          buildQuote({ id: "draft", status: "draft", quoteNumber: "LTT-26-0001-Q2" }),
        ],
        undefined,
        { quoteChangedSinceSent: true },
      )

      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })
  })
})

describe("JobQuotesTab — header", () => {
  it("shows when the client was sent the quote", () => {
    renderTab([buildQuote({ status: "sent", lastSentAt: SENT_AT })])
    expect(screen.getByText(`Sent to the client ${formatDisplayDateTime(SENT_AT)}`)).toBeInTheDocument()
    expect(screen.queryByText(/Last sent/)).not.toBeInTheDocument()
  })

  it.each(["draft", "pricing_incomplete", "ready"] as const)(
    "says a %s quote has not gone to the client yet",
    (status) => {
      renderTab([buildQuote({ status })])
      expect(screen.getByText("Not sent to the client yet")).toBeInTheDocument()
    },
  )

  it("shows the send date on a working quote that was sent before", () => {
    renderTab([buildQuote({ status: "draft", lastSentAt: SENT_AT })])
    expect(screen.getByText(`Sent to the client ${formatDisplayDateTime(SENT_AT)}`)).toBeInTheDocument()
    expect(screen.queryByText("Not sent to the client yet")).not.toBeInTheDocument()
  })

  it.each(["superseded", "cancelled"] as const)("hides the sent line on a %s quote", (status) => {
    renderTab([buildQuote({ status, lastSentAt: SENT_AT })])
    expect(screen.queryByText(/Sent to the client/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Not sent to the client/)).not.toBeInTheDocument()
  })

  it("hides the sent line on an accepted quote with no send date", () => {
    renderTab([buildQuote({ status: "accepted" })])
    expect(screen.queryByText(/Sent to the client/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Not sent to the client/)).not.toBeInTheDocument()
  })

  it("calls a superseded quote Replaced", () => {
    renderTab([buildQuote({ status: "superseded" })])
    expect(screen.getByText("Replaced")).toBeInTheDocument()
    expect(screen.queryByText("Superseded")).not.toBeInTheDocument()
  })

  it("keeps the Provisional label as it is", () => {
    renderTab([buildQuote({ status: "draft" })])
    expect(screen.getByText("Provisional")).toBeInTheDocument()
  })

  it("does not add a Missing pricing badge beside Provisional (Incomplete)", () => {
    renderTab([buildQuote({ status: "pricing_incomplete", lineItems: UNPRICED_LINES })])
    expect(screen.getByText("Provisional (Incomplete)")).toBeInTheDocument()
    expect(screen.queryByText("Missing pricing")).not.toBeInTheDocument()
  })

  it("still adds the Missing pricing badge on any other quote with an unpriced line", () => {
    renderTab([buildQuote({ status: "draft", lineItems: UNPRICED_LINES })])
    expect(screen.getByText("Missing pricing")).toBeInTheDocument()
  })

  it("labels the PDF button View PDF", () => {
    renderTab([buildQuote({ status: "draft" })])
    expect(screen.getByRole("button", { name: "View PDF" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument()
  })
})

describe("JobQuotesTab — cancelling a quote", () => {
  const fetchMock = vi.fn()

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  function stubCancelRequest() {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
  }

  it.each(["draft", "pricing_incomplete", "ready", "sent"] as const)(
    "offers Cancel Quote on a %s quote",
    (status) => {
      renderTab([buildQuote({ status })])
      expect(screen.getByRole("button", { name: "Cancel Quote" })).toBeInTheDocument()
    },
  )

  it.each(["accepted", "expired", "superseded", "cancelled"] as const)("offers no Cancel Quote on a %s quote", (status) => {
    renderTab([buildQuote({ status })])
    expect(screen.queryByRole("button", { name: "Cancel Quote" })).not.toBeInTheDocument()
  })

  it("asks before cancelling and cancels nothing yet", () => {
    stubCancelRequest()
    renderTab([buildQuote({ status: "draft", quoteNumber: "LTT-26-0001-Q2" })])

    fireEvent.click(screen.getByRole("button", { name: "Cancel Quote" }))

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent("Cancel Quote 2?")
    expect(dialog).toHaveTextContent("A cancelled quote cannot be reopened.")
    expect(dialog).not.toHaveTextContent("not told it was cancelled")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("warns that the client is not told when the quote was already sent", () => {
    stubCancelRequest()
    renderTab([buildQuote({ status: "sent", lastSentAt: SENT_AT })])

    fireEvent.click(screen.getByRole("button", { name: "Cancel Quote" }))

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "The client has already received this quote and is not told it was cancelled. A cancelled quote cannot be reopened.",
    )
  })

  it("leaves the quote alone on Keep quote", async () => {
    stubCancelRequest()
    renderTab([buildQuote({ status: "draft" })])

    fireEvent.click(screen.getByRole("button", { name: "Cancel Quote" }))
    fireEvent.click(screen.getByRole("button", { name: "Keep quote" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cancels only the confirmed quote, and only when confirmed", async () => {
    stubCancelRequest()
    const mutate = vi.fn()
    renderTab(
      [
        buildQuote({ id: "older", status: "draft", quoteNumber: "LTT-26-0001-Q1" }),
        buildQuote({ id: "newer", status: "draft", quoteNumber: "LTT-26-0001-Q2" }),
      ],
      undefined,
      { mutate },
    )

    // Newest first, so the first Cancel Quote button belongs to "newer".
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel Quote" })[0])
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel quote" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith("/api/quotes/newer/cancel", { method: "POST" })
    await waitFor(() => expect(mutate).toHaveBeenCalled())
  })
})

describe("JobQuotesTab — line dates", () => {
  it("shows a dash for a line with no pricing snapshot", () => {
    renderTab([buildQuote({})])

    expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument()
    expect(screen.getAllByTestId("quote-line-date").map((cell) => cell.textContent)).toEqual(["—"])
  })

  it("shows each dated line's range", () => {
    const trainSnapshot = {
      supplierKind: "train_operator",
      travelDate: "2027-07-09",
      serviceEndDate: "2027-07-12",
    } as QuoteLineItem["pricingSnapshot"]
    renderTab([
      buildQuote({
        lineItems: [
          { description: "Rovos Rail — Adult", supplierDescription: null, qty: 2, unitPrice: 1000, total: 2000, pricingSnapshot: trainSnapshot },
          { description: "Manual line", supplierDescription: null, qty: 1, unitPrice: 50, total: 50, pricingSnapshot: null },
        ],
      }),
    ])

    expect(screen.getAllByTestId("quote-line-date").map((cell) => cell.textContent)).toEqual([
      "09–12 Jul 2027",
      "—",
    ])
  })
})
