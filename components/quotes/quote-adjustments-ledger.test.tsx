import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { QuoteAdjustmentsLedger } from "./quote-adjustments-ledger"
import { formatMoney } from "@/lib/money"
import { PER_PERSON_NEEDS_HEADCOUNT_ERROR } from "@/lib/quotes/quote-adjustments"
import type { CommissionBreakdown, Quote, QuoteLineItem } from "@/lib/types"

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
