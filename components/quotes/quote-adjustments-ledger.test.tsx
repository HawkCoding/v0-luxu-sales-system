import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { QuoteAdjustmentsLedger } from "./quote-adjustments-ledger"
import { currencySymbol, formatMoney } from "@/lib/money"
import { PER_PERSON_NEEDS_HEADCOUNT_ERROR } from "@/lib/quotes/quote-adjustments"
import type { CommissionBreakdown, Quote, QuoteLineItem } from "@/lib/types"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const QUOTE_ID = "00000000-0000-4000-8000-000000000001"

/** The ledger's own currency formatting, with en-ZA's non-breaking group separators collapsed to
 *  plain spaces — Testing Library normalises the rendered text the same way. */
function money(...args: Parameters<typeof formatMoney>): string {
  return formatMoney(...args).replace(/\s/g, " ")
}

const SERVICE_LINE: QuoteLineItem = {
  description: "Blue Train - Pretoria to Cape Town",
  supplierDescription: null,
  qty: 4,
  unitPrice: 50_000,
  total: 200_000,
  pricingSnapshot: null,
}

function commissionLine(commission: CommissionBreakdown): QuoteLineItem {
  const perPerson = commission.type === "per_person"
  return {
    description: "Commission",
    supplierDescription: null,
    qty: perPerson ? (commission.passengerCount ?? 1) : 1,
    unitPrice: perPerson ? commission.value : commission.amount,
    total: commission.amount,
    pricingSnapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      packageId: "",
      packageName: "",
      legId: null,
      legLabel: null,
      supplierId: null,
      supplierName: null,
      supplierKind: null,
      routeId: null,
      routeName: null,
      suiteTypeId: null,
      suiteTypeName: null,
      rateCardId: null,
      travelDate: "",
      passengerKind: "service",
      baseUnitPrice: perPerson ? commission.value : commission.amount,
      markupPct: 0,
      singleSupplementPct: null,
      serviceType: null,
      commission,
      unit: perPerson ? "per person" : null,
    },
  }
}

function buildQuote(overrides: Partial<Quote> = {}): Quote {
  const lineItems = overrides.lineItems ?? [SERVICE_LINE]
  const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0)
  return {
    id: QUOTE_ID,
    itineraryId: "",
    jobId: "job-1",
    status: "draft",
    validityUntil: "2026-10-13",
    updatedAt: "2026-09-29T00:00:00.000Z",
    lineItems,
    subtotal,
    total: subtotal,
    currency: "ZAR",
    commissionBonus: 0,
    agentCommission: 0,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    discountVisible: true,
    ...overrides,
  }
}

function commissionRow(): HTMLElement {
  const group = screen.getByRole("radiogroup", { name: "Commission type" })
  const row = group.parentElement
  if (!row) throw new Error("Commission row not found")
  return row
}

describe("QuoteAdjustmentsLedger", () => {
  it("labels the per-person toggle in words, not just 'pp'", () => {
    render(<QuoteAdjustmentsLedger quote={buildQuote()} editable bookingHeadcount={4} onSaved={vi.fn()} />)

    const perPerson = within(screen.getByRole("radiogroup", { name: "Commission type" })).getByRole("radio", {
      name: "Per person",
    })
    expect(perPerson).toHaveAttribute("title", "Per person")
  })

  it("previews a new per-person commission against the booking headcount, not 1", () => {
    render(<QuoteAdjustmentsLedger quote={buildQuote()} editable bookingHeadcount={4} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("radio", { name: "Per person" }))
    fireEvent.change(document.getElementById(`quote-adjustments-${QUOTE_ID}-commission-value`) as HTMLElement, {
      target: { value: "5000" },
    })

    const row = commissionRow()
    expect(within(row).getByText("per person")).toBeInTheDocument()
    expect(within(row).getByText(`${money(5000, "ZAR", { decimals: false })} × 4 people`)).toBeInTheDocument()
    expect(within(row).getByText(`+ ${money(20_000, "ZAR")}`)).toBeInTheDocument()
    expect(screen.queryByText("/ pax")).not.toBeInTheDocument()
  })

  it("counts a typed commission straight away, without touching the type toggle", () => {
    render(<QuoteAdjustmentsLedger quote={buildQuote()} editable bookingHeadcount={4} onSaved={vi.fn()} />)

    fireEvent.change(document.getElementById(`quote-adjustments-${QUOTE_ID}-commission-value`) as HTMLElement, {
      target: { value: "10" },
    })

    // 10% of R200 000 — the toggle shows "%" by default, so typing alone activates it.
    expect(within(commissionRow()).getByText(`+ ${money(20_000, "ZAR")}`)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
  })

  it("picking a type without a value is not a change", () => {
    render(<QuoteAdjustmentsLedger quote={buildQuote()} editable bookingHeadcount={4} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("radio", { name: "Fixed amount" }))

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument()
  })

  it("re-counts a saved per-person commission with the current headcount and offers Save", () => {
    // Saved when the booking held 1 traveller; it now holds 5.
    const quote = buildQuote({
      lineItems: [
        SERVICE_LINE,
        commissionLine({ type: "per_person", value: 5000, amount: 5000, source: "line", passengerCount: 1 }),
      ],
    })
    render(<QuoteAdjustmentsLedger quote={quote} editable bookingHeadcount={5} onSaved={vi.fn()} />)

    const row = commissionRow()
    expect(within(row).getByText(`${money(5000, "ZAR", { decimals: false })} × 5 people`)).toBeInTheDocument()
    expect(within(row).getByText(`+ ${money(25_000, "ZAR")}`)).toBeInTheDocument()
    expect(screen.getByText(/number of travellers changed/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
  })

  it("does not nag to save when the saved per-person commission already matches the headcount", () => {
    const quote = buildQuote({
      lineItems: [
        SERVICE_LINE,
        commissionLine({ type: "per_person", value: 5000, amount: 20_000, source: "line", passengerCount: 4 }),
      ],
    })
    render(<QuoteAdjustmentsLedger quote={quote} editable bookingHeadcount={4} onSaved={vi.fn()} />)

    expect(screen.queryByText(/number of travellers changed/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument()
  })

  it("shows the per-person working for a Discount too", () => {
    const quote = buildQuote({ discountType: "per_person", discountValue: 1000, discountAmount: 4000 })
    render(<QuoteAdjustmentsLedger quote={quote} editable bookingHeadcount={4} onSaved={vi.fn()} />)

    const discountRow = screen.getByRole("radiogroup", { name: "Discount type" }).parentElement as HTMLElement
    expect(within(discountRow).getByText(`${money(1000, "ZAR", { decimals: false })} × 4 people`)).toBeInTheDocument()
    expect(within(discountRow).getByText(`− ${money(4000, "ZAR")}`)).toBeInTheDocument()
  })

  it("warns inline when a per-person amount is used on a booking with no travellers", () => {
    render(<QuoteAdjustmentsLedger quote={buildQuote()} editable bookingHeadcount={0} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("radio", { name: "Per person" }))
    fireEvent.change(document.getElementById(`quote-adjustments-${QUOTE_ID}-commission-value`) as HTMLElement, {
      target: { value: "5000" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent(PER_PERSON_NEEDS_HEADCOUNT_ERROR)
  })

  it("shows the saved working on a read-only quote", () => {
    const quote = buildQuote({
      status: "sent",
      lineItems: [
        SERVICE_LINE,
        commissionLine({ type: "per_person", value: 5000, amount: 20_000, source: "line", passengerCount: 4 }),
      ],
    })
    render(<QuoteAdjustmentsLedger quote={quote} editable={false} bookingHeadcount={4} onSaved={vi.fn()} />)

    expect(screen.getByText(`${money(5000, "ZAR", { decimals: false })} × 4 people`)).toBeInTheDocument()
  })
})

describe("QuoteAdjustmentsLedger — currency and wording", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(toast.success).mockClear()
  })

  it.each([
    ["ZAR", currencySymbol("ZAR")],
    ["USD", currencySymbol("USD")],
    ["EUR", currencySymbol("EUR")],
  ])("labels the fixed-amount option with the %s symbol, not a hard-coded R", (currency, symbol) => {
    render(<QuoteAdjustmentsLedger quote={buildQuote({ currency })} editable bookingHeadcount={2} onSaved={vi.fn()} />)

    const fixed = within(screen.getByRole("radiogroup", { name: "Commission type" })).getByRole("radio", {
      name: "Fixed amount",
    })
    expect(fixed).toHaveTextContent(symbol)
    if (currency !== "ZAR") expect(fixed).not.toHaveTextContent("R")
  })

  it("keeps the % and pp options as they were", () => {
    render(<QuoteAdjustmentsLedger quote={buildQuote({ currency: "USD" })} editable bookingHeadcount={2} onSaved={vi.fn()} />)

    const group = screen.getByRole("radiogroup", { name: "Commission type" })
    expect(within(group).getByRole("radio", { name: "Percentage" })).toHaveTextContent("%")
    expect(within(group).getByRole("radio", { name: "Per person" })).toHaveTextContent("pp")
  })

  async function saveACommission(status: Quote["status"]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    const onSaved = vi.fn()
    render(<QuoteAdjustmentsLedger quote={buildQuote({ status })} editable bookingHeadcount={2} onSaved={onSaved} />)

    fireEvent.change(document.getElementById(`quote-adjustments-${QUOTE_ID}-commission-value`) as HTMLElement, {
      target: { value: "10" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  }

  it.each(["sent", "accepted", "expired"] as const)(
    "tells the salesperson to send an updated quote after saving on a %s quote",
    async (status) => {
      await saveACommission(status)
      expect(toast.success).toHaveBeenCalledWith(
        "Pricing saved. Send the client an updated quote so they have the new total.",
      )
    },
  )

  it.each(["draft", "pricing_incomplete", "ready"] as const)(
    "keeps the plain saved message on a %s quote",
    async (status) => {
      await saveACommission(status)
      expect(toast.success).toHaveBeenCalledWith("Pricing adjustments saved.")
    },
  )

  it("explains how a change reaches a client who already has the quote", async () => {
    // Radix measures the tooltip with ResizeObserver, which jsdom does not have.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    render(<QuoteAdjustmentsLedger quote={buildQuote()} editable bookingHeadcount={2} onSaved={vi.fn()} />)

    fireEvent.focus(screen.getByRole("button", { name: "Commission info" }))

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip).toHaveTextContent(
      "Applied once to the booking's total. On a quote the client already has, save the change, then send them an updated quote.",
    )
    expect(tooltip).not.toHaveTextContent("Editable any time before the quote is sent")
  })

  it("gives the small icon buttons a visible keyboard focus ring", () => {
    render(
      <QuoteAdjustmentsLedger
        quote={buildQuote({ commissionBonus: 500 })}
        editable
        bookingHeadcount={2}
        onSaved={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Commission info" })).toHaveClass("focus-visible:ring-2")
    expect(screen.getByRole("button", { name: "Remove rounding" })).toHaveClass("focus-visible:ring-2")
  })
})
