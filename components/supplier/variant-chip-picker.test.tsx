import { describe, it, expect, vi, beforeAll } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { VariantChipPicker } from "./variant-chip-picker"

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
      MockResizeObserver
  }
  // Radix Popover relies on HTMLElement.hasPointerCapture, which jsdom omits.
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {}
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
})

describe("VariantChipPicker", () => {
  it("renders the trigger placeholder when nothing is selected", () => {
    render(
      <VariantChipPicker
        label="Bedroom Types"
        available={[{ id: "a", name: "Twin" }]}
        selectedIds={[]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText("Select...")).toBeInTheDocument()
  })

  it("invokes onCreate and adds the new option to the selection", async () => {
    const created = { id: "new-1", name: "Cherry" }
    const onCreate = vi.fn(async () => created)
    const onChange = vi.fn()

    render(
      <VariantChipPicker
        label="Bedroom Types"
        available={[]}
        selectedIds={[]}
        onChange={onChange}
        onCreate={onCreate}
      />,
    )

    fireEvent.click(screen.getByTestId("variant-chip-picker-trigger"))
    const input = await screen.findByPlaceholderText(/search bedroom types/i)
    fireEvent.change(input, { target: { value: "Cherry" } })

    const createItem = await screen.findByTestId("variant-chip-picker-create")
    fireEvent.click(createItem)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("Cherry")
      expect(onChange).toHaveBeenCalledWith([created.id])
    })
  })
})
