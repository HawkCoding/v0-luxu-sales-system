import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FxRateBanner } from "./fx-rate-banner"

// Amend prefills the accepted quote's rates into `rates`; the banner itself is the same either way.
function renderBanner(onRateChange = vi.fn(), onRefresh = vi.fn()) {
  render(
    <FxRateBanner
      foreignCurrencies={["EUR", "USD"]}
      quoteCurrency="ZAR"
      rates={{ ZAR: 1, USD: 17.25, EUR: 20.5 }}
      asOf="2026-10-07"
      stale={false}
      onRefresh={onRefresh}
      onRateChange={onRateChange}
    />,
  )
  return { onRateChange, onRefresh }
}

describe("FxRateBanner", () => {
  it("shows the given (e.g. prefilled) rates in editable boxes, with no extra note", () => {
    renderBanner()

    expect(screen.getByLabelText("USD to ZAR exchange rate")).toHaveValue(17.25)
    expect(screen.getByLabelText("EUR to ZAR exchange rate")).toHaveValue(20.5)
    expect(screen.queryByText(/accepted quote/i)).not.toBeInTheDocument()
  })

  it("lets any rate be changed and still offers the refresh-to-today control", () => {
    const { onRateChange, onRefresh } = renderBanner()

    fireEvent.change(screen.getByLabelText("USD to ZAR exchange rate"), { target: { value: "18.1" } })
    fireEvent.blur(screen.getByLabelText("USD to ZAR exchange rate"))
    expect(onRateChange).toHaveBeenCalledWith("USD", 18.1)

    fireEvent.click(screen.getByRole("button", { name: "Refresh exchange rates" }))
    expect(onRefresh).toHaveBeenCalled()
  })
})
