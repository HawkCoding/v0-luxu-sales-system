import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ListFilterBar } from "./list-filter-bar"

function renderBar(overrides: Partial<React.ComponentProps<typeof ListFilterBar>> = {}) {
  const props: React.ComponentProps<typeof ListFilterBar> = {
    searchValue: "",
    onSearchChange: vi.fn(),
    searchPlaceholder: "Search bookings...",
    chips: [],
    onClearAll: vi.fn(),
    resultCount: 10,
    totalCount: 10,
    noun: "booking",
    hasActiveFilters: false,
    ...overrides,
  }
  render(<ListFilterBar {...props} />)
  return props
}

describe("ListFilterBar", () => {
  it("hides the summary row when nothing is active", () => {
    renderBar({ hasActiveFilters: false })
    expect(screen.queryByText(/of 10 booking/)).not.toBeInTheDocument()
  })

  it("shows the summary row and chips once a filter is active", () => {
    renderBar({
      hasActiveFilters: true,
      resultCount: 3,
      chips: [{ key: "supplier", label: "Supplier: Rovos Rail", onRemove: vi.fn() }],
    })
    expect(screen.getByText("3 of 10 bookings")).toBeInTheDocument()
    expect(screen.getByText("Supplier: Rovos Rail")).toBeInTheDocument()
  })

  it("removing a chip calls its onRemove, not onClearAll", () => {
    const onRemove = vi.fn()
    const onClearAll = vi.fn()
    renderBar({
      hasActiveFilters: true,
      resultCount: 3,
      onClearAll,
      chips: [{ key: "supplier", label: "Supplier: Rovos Rail", onRemove }],
    })

    fireEvent.click(screen.getByLabelText("Remove filter Supplier: Rovos Rail"))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onClearAll).not.toHaveBeenCalled()
  })

  it("Clear all calls onClearAll", () => {
    const onClearAll = vi.fn()
    renderBar({ hasActiveFilters: true, onClearAll })
    fireEvent.click(screen.getByText("Clear all"))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it("typing in search calls onSearchChange", () => {
    const onSearchChange = vi.fn()
    renderBar({ onSearchChange })
    fireEvent.change(screen.getByPlaceholderText("Search bookings..."), {
      target: { value: "Jacomien" },
    })
    expect(onSearchChange).toHaveBeenCalledWith("Jacomien")
  })

  it("pressing '/' anywhere on the page focuses the search input", () => {
    renderBar()
    const input = screen.getByPlaceholderText("Search bookings...") as HTMLInputElement
    expect(input).not.toHaveFocus()

    fireEvent.keyDown(window, { key: "/" })

    expect(input).toHaveFocus()
  })

  it("does not steal focus for '/' typed inside another field", () => {
    render(
      <div>
        <input aria-label="other field" />
        <ListFilterBar
          searchValue=""
          onSearchChange={vi.fn()}
          searchPlaceholder="Search bookings..."
          chips={[]}
          onClearAll={vi.fn()}
          resultCount={10}
          totalCount={10}
          noun="booking"
          hasActiveFilters={false}
        />
      </div>,
    )
    const other = screen.getByLabelText("other field")
    other.focus()
    fireEvent.keyDown(other, { key: "/" })
    expect(other).toHaveFocus()
  })

  it("Escape clears a non-empty search box", () => {
    const onSearchChange = vi.fn()
    renderBar({ searchValue: "Jaco", onSearchChange })
    fireEvent.keyDown(screen.getByPlaceholderText("Search bookings..."), { key: "Escape" })
    expect(onSearchChange).toHaveBeenCalledWith("")
  })
})
