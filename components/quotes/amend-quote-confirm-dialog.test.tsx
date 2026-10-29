import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AmendQuoteConfirmDialog } from "./amend-quote-confirm-dialog"
import { AMEND_CONFIRM_MESSAGE } from "@/lib/quotes/amend-quote"
import { formatMoney } from "@/lib/money"

function money(amount: number): string {
  return formatMoney(amount, "ZAR").replace(/\s/g, " ")
}

function renderDialog(overrides: Partial<Parameters<typeof AmendQuoteConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <AmendQuoteConfirmDialog
      open
      onOpenChange={onOpenChange}
      currentTotal={21800}
      newTotal={25800}
      currency="ZAR"
      saving={false}
      onConfirm={onConfirm}
      {...overrides}
    />,
  )
  return { onConfirm, onOpenChange }
}

describe("AmendQuoteConfirmDialog", () => {
  it("states plainly that the price changes and no emails are sent", () => {
    renderDialog()

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(AMEND_CONFIRM_MESSAGE)
    expect(AMEND_CONFIRM_MESSAGE).toContain("Make sure the client knows about this change and the new price.")
    expect(AMEND_CONFIRM_MESSAGE).toContain("No emails are sent.")
  })

  it("shows the current and new totals with the difference", () => {
    renderDialog()

    expect(screen.getByText(money(21800))).toBeInTheDocument()
    expect(screen.getByText(money(25800))).toBeInTheDocument()
    expect(screen.getByText(`+${money(4000)}`)).toBeInTheDocument()
  })

  it("doesn't promise the stage never moves — the balance sync can change Paid in Full", () => {
    renderDialog()

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(
      "The booking keeps its stage, unless the new total changes whether it is paid in full.",
    )
    expect(dialog).not.toHaveTextContent("stays at its current stage")
  })

  it.each(["voucher_sent", "trip_active"])(
    "says the difference becomes an outstanding balance when the total rises at %s",
    (bookingStage) => {
      renderDialog({ bookingStage })

      expect(screen.getByRole("alertdialog")).toHaveTextContent(
        `The voucher has already been sent. The extra ${money(4000)} becomes an outstanding balance the client still has to pay.`,
      )
    },
  )

  it("says nothing about an outstanding balance before the voucher has gone out", () => {
    renderDialog({ bookingStage: "deposit_paid" })
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("outstanding balance")
  })

  it("says nothing about an outstanding balance when the total falls after the voucher", () => {
    renderDialog({ bookingStage: "voucher_sent", newTotal: 20000 })
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("outstanding balance")
  })

  it("lists an existing item whose price changed", () => {
    renderDialog({ changedLines: [{ description: "Blue Train fare", before: 50000, after: 51200 }] })

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent("1 existing item changed price:")
    expect(dialog).toHaveTextContent(`Blue Train fare: ${money(50000)} → ${money(51200)}`)
  })

  it("shows the first five changed items and summarises the rest", () => {
    const changedLines = Array.from({ length: 7 }, (_, index) => ({
      description: `Item ${index + 1}`,
      before: 100,
      after: 110,
    }))
    renderDialog({ changedLines })

    const list = screen.getByRole("list", { name: "Existing items that changed price" })
    expect(screen.getByRole("alertdialog")).toHaveTextContent("7 existing items changed price:")
    expect(list).toHaveTextContent("Item 5")
    expect(list).not.toHaveTextContent("Item 6")
    expect(list).toHaveTextContent("+2 more")
  })

  it("shows no changed-price list when every existing item kept its price", () => {
    renderDialog({ changedLines: [] })
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("changed price")
  })

  it("saves nothing until the salesperson explicitly confirms", () => {
    const { onConfirm, onOpenChange } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("passes the optional note through on confirm, trimmed", () => {
    const { onConfirm } = renderDialog()

    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "  Client asked for an extra night  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm amendment" }))

    expect(onConfirm).toHaveBeenCalledWith("Client asked for an extra night")
  })

  it("confirms without a note", () => {
    const { onConfirm } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "Confirm amendment" }))

    expect(onConfirm).toHaveBeenCalledWith(undefined)
  })

  it("locks both buttons while the save is in flight", () => {
    renderDialog({ saving: true })

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Confirm amendment/ })).toBeDisabled()
  })
})
