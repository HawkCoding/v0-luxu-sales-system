import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const fxState = vi.hoisted(() => ({ stale: false }))

vi.mock("@/lib/fx/use-fx-rates", () => ({
  useFxRates: () => ({
    rates: { ZAR: 1, USD: 17.25 },
    asOf: "2026-10-01",
    stale: fxState.stale,
    loading: false,
    canEdit: true,
    refresh: vi.fn(),
    setRate: vi.fn(),
  }),
}))
// The real picker is a Radix Select; this test is only about the words around it.
vi.mock("@/components/currency-select", () => ({
  CurrencySelect: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange("USD")}>
      Pick USD
    </button>
  ),
}))

import { ConvertQuoteCurrencyDialog } from "./convert-quote-currency-dialog"

function openDialogWithUsdPicked(stale: boolean) {
  fxState.stale = stale
  render(
    <ConvertQuoteCurrencyDialog
      quoteId="q1"
      currency="ZAR"
      lineItems={[
        { description: "Package Total", supplierDescription: null, qty: 1, unitPrice: 24800, total: 24800, pricingSnapshot: null },
      ]}
      total={24800}
      alreadySent={false}
      onConverted={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Change currency" }))
  fireEvent.click(screen.getByRole("button", { name: "Pick USD" }))
}

describe("ConvertQuoteCurrencyDialog", () => {
  it("names its button for what it does", () => {
    render(
      <ConvertQuoteCurrencyDialog
        quoteId="q1"
        currency="ZAR"
        lineItems={[]}
        total={0}
        alreadySent={false}
        onConverted={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Change currency" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Currency" })).not.toBeInTheDocument()
  })

  it("says plainly when the rate may be out of date", () => {
    openDialogWithUsdPicked(true)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("· rate may be out of date")
    expect(dialog).not.toHaveTextContent("· stale")
  })

  it("says nothing about the rate when it is current", () => {
    openDialogWithUsdPicked(false)

    expect(screen.getByRole("dialog")).not.toHaveTextContent("out of date")
  })
})
