import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { RateTypeSelect } from "./rate-type-select"
import type { RateType } from "@/lib/types"

function rateType(id: string, name: string, overrides: Partial<RateType> = {}): RateType {
  return {
    id,
    code: id.toUpperCase(),
    name,
    sortOrder: 0,
    isDefault: false,
    isStandard: false,
    audience: null,
    clientLabel: null,
    shortLabel: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

const rateTypes = [
  rateType("rac", "Rack Rate", { isDefault: true }),
  rateType("sto", "STO Rate"),
  rateType("sadc", "Rovos Rail SADC"),
]

/** Radix opens on keydown, which jsdom handles -- pointer events on the trigger do not. */
function openMenu() {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
}

describe("RateTypeSelect", () => {
  it("lists only the rates the supplier prices at", () => {
    render(
      <RateTypeSelect
        rateTypes={rateTypes}
        allowedRateTypeIds={["rac", "sadc"]}
        value={null}
        onChange={vi.fn()}
        inheritLabel="Supplier default (Rack Rate)"
      />,
    )
    openMenu()

    expect(screen.getByRole("option", { name: "Rack Rate (default)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Rovos Rail SADC" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "STO Rate" })).not.toBeInTheDocument()
  })

  it("lists every rate when the supplier's set is unknown", () => {
    render(<RateTypeSelect rateTypes={rateTypes} value={null} onChange={vi.fn()} />)
    openMenu()

    expect(screen.getAllByRole("option")).toHaveLength(3)
  })

  it("keeps an already-chosen rate listed even when it falls outside the set", () => {
    // Dropping it would blank the trigger and hide what the leg is actually quoting at.
    render(
      <RateTypeSelect
        rateTypes={rateTypes}
        allowedRateTypeIds={["rac"]}
        value="sto"
        onChange={vi.fn()}
      />,
    )
    openMenu()

    expect(screen.getByRole("option", { name: "STO Rate" })).toBeInTheDocument()
  })

  it("leaves out excluded rates, but never the one already picked", () => {
    const { unmount } = render(
      <RateTypeSelect
        rateTypes={rateTypes}
        value={null}
        onChange={vi.fn()}
        inheritLabel="Suite rate (Rovos Rail SADC)"
        excludeRateTypeIds={["sadc"]}
      />,
    )
    openMenu()
    expect(screen.getByRole("option", { name: "Suite rate (Rovos Rail SADC)" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Rovos Rail SADC" })).not.toBeInTheDocument()
    unmount()

    render(<RateTypeSelect rateTypes={rateTypes} value="sadc" onChange={vi.fn()} excludeRateTypeIds={["sadc"]} />)
    openMenu()
    expect(screen.getByRole("option", { name: "Rovos Rail SADC" })).toBeInTheDocument()
  })

  it("can say what each rate prints as", () => {
    const labelled = [rateType("sto", "STO Rate", { shortLabel: "TW" }), rateType("rac", "Rack Rate")]
    render(<RateTypeSelect rateTypes={labelled} value={null} onChange={vi.fn()} showShortLabel />)
    openMenu()
    expect(screen.getByRole("option", { name: "STO Rate · prints (TW)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Rack Rate" })).toBeInTheDocument()
  })
})
