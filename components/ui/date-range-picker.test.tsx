import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DateRangePicker } from "./date-range-picker"

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

describe("DateRangePicker", () => {
  beforeEach(() => {
    // Noon UTC keeps the local calendar day at the 24th regardless of the runner's timezone.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the placeholder when no range is set", () => {
    render(<DateRangePicker value={{}} onChange={() => {}} placeholder="Created date" />)
    expect(screen.getByText("Created date")).toBeInTheDocument()
  })

  it("emits the ISO pair for the 'Last 7 days' preset", () => {
    const onChange = vi.fn()
    render(<DateRangePicker value={{}} onChange={onChange} placeholder="Date range" />)

    fireEvent.click(screen.getByRole("button", { name: /date range/i }))
    fireEvent.click(screen.getByText("Last 7 days"))

    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-18", to: "2026-08-24" })
  })

  it("emits the ISO pair for the 'This month' preset", () => {
    const onChange = vi.fn()
    render(<DateRangePicker value={{}} onChange={onChange} placeholder="Date range" />)

    fireEvent.click(screen.getByRole("button", { name: /date range/i }))
    fireEvent.click(screen.getByText("This month"))

    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-01", to: "2026-08-31" })
  })

  it("disables Clear when no range is active", () => {
    render(<DateRangePicker value={{}} onChange={() => {}} placeholder="Date range" />)
    fireEvent.click(screen.getByRole("button", { name: /date range/i }))
    expect(screen.getByText("Clear").closest("button")).toBeDisabled()
  })

  it("Clear emits an empty range when one was active", () => {
    const onChange = vi.fn()
    render(
      <DateRangePicker
        value={{ from: "2026-08-01", to: "2026-08-10" }}
        onChange={onChange}
        placeholder="Date range"
      />,
    )

    fireEvent.click(screen.getByText(/01 Aug 2026 – 10 Aug 2026/))
    fireEvent.click(screen.getByText("Clear"))

    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: undefined })
  })
})
