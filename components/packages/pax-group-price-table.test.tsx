import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { PaxGroupPriceTable } from "./pax-group-price-table"
import type { PricingSnapshot, QuoteLineItem } from "@/lib/types"
import type { PaxGroupView } from "@/lib/packages/pax-group-toggles"
import { formatMoney } from "@/lib/money"

function view(id: string, position: number, label: string, adults: number): PaxGroupView {
  return {
    id,
    position,
    typedLabel: null,
    autoLabel: label,
    label,
    shortLabel: label.replace(/ \d+$/, ""),
    pax: { adultCount: adults, childCount: 0, infantCount: 0 },
    primaryUnit: null,
  }
}

const groups = [view("g1", 1, "Twin Deluxe Suite 1", 2), view("g2", 2, "Twin Deluxe Suite 2", 2)]

const trainSnapshot = {
  legId: "train",
  supplierKind: "train_operator",
  unit: "per person sharing",
  passengerKind: "adult",
  rateTypeId: "sa",
  paxGroups: [
    { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
    { id: "g2", position: 2, label: "Twin Deluxe Suite 2" },
  ],
  unitRefs: [
    { index: 0, unitId: "t1", adults: 2, children: 0, infants: 0, paxGroupIds: ["g1"] },
    { index: 1, unitId: "t2", adults: 2, children: 0, infants: 0, paxGroupIds: ["g2"] },
  ],
} as unknown as PricingSnapshot

const lines: QuoteLineItem[] = [
  { description: "Rovos Rail", qty: 4, unitPrice: 23800, total: 95200, pricingSnapshot: trainSnapshot },
]

describe("PaxGroupPriceTable", () => {
  it("prints each suite's line and subtotal, adding up to the whole booking", () => {
    render(
      <PaxGroupPriceTable
        lines={lines}
        groups={groups}
        noun="Suite"
        currency="ZAR"
        rateLabels={new Map([["sa", "SA"]])}
        unpriced={false}
        notOnByGroup={new Map([["g2", ["Apogee Spa"]]])}
      />,
    )
    const table = screen.getByRole("table", { name: "Price per suite" })
    expect(within(table).getByText(/Twin Deluxe Suite 1 - 2 Adults x .* per person \(SA\)/)).toBeInTheDocument()
    expect(within(table).getByText("Not on: Apogee Spa")).toBeInTheDocument()
    expect(within(table).getByText("Total for 4 Adults")).toBeInTheDocument()
    // One row per suite, headed by the printed sentence itself.
    const rowHeaders = within(table).getAllByRole("rowheader").map((cell) => cell.textContent)
    expect(rowHeaders).toHaveLength(3)
    expect(rowHeaders[0]).toMatch(/^Twin Deluxe Suite 1 - 2 Adults x /)
    expect(within(table).queryByText(/Suite 1 · 2 adults/)).not.toBeInTheDocument()
    expect(screen.getByText(/These lines print on the quote and invoice exactly as shown/)).toBeInTheDocument()
    // The matcher collapses the money format's non-breaking space, so compare it collapsed too.
    const money = (amount: number) => formatMoney(amount, "ZAR").replace(/\s/g, " ")
    expect(within(table).getAllByText(money(47600))).toHaveLength(2)
    expect(within(table).getByText(money(95200))).toBeInTheDocument()
  })

  it("shows a dash, never R0,00, while a service is unpriced", () => {
    render(
      <PaxGroupPriceTable
        lines={lines}
        groups={groups}
        noun="Suite"
        currency="ZAR"
        rateLabels={new Map()}
        unpriced
        notOnByGroup={new Map()}
      />,
    )
    expect(screen.getAllByLabelText("Not priced")).toHaveLength(3)
    expect(screen.getByText("Twin Deluxe Suite 2 - not priced yet")).toBeInTheDocument()
    expect(screen.getByText(/Suite prices show once every service is priced/)).toBeInTheDocument()
  })

  it("falls back to one muted line when the lines can't be split by suite", () => {
    const legacy: QuoteLineItem[] = [{ description: "Old line", qty: 1, unitPrice: 100, total: 100, pricingSnapshot: null }]
    render(
      <PaxGroupPriceTable
        lines={legacy}
        groups={groups}
        noun="Suite"
        currency="ZAR"
        rateLabels={new Map()}
        unpriced={false}
        notOnByGroup={new Map()}
      />,
    )
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText(/Per-suite prices aren't available/)).toBeInTheDocument()
  })
})
