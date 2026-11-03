import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { PaxGroupPicker } from "./pax-group-picker"
import type { PaxGroupView } from "@/lib/packages/pax-group-toggles"

function view(id: string, position: number, shortLabel: string): PaxGroupView {
  return {
    id,
    position,
    typedLabel: null,
    autoLabel: `${shortLabel} ${position}`,
    label: `${shortLabel} ${position}`,
    shortLabel,
    pax: { adultCount: 2, childCount: 0, infantCount: 0 },
    primaryUnit: null,
  }
}

const groups = [view("g1", 1, "Twin Deluxe Suite"), view("g2", 2, "Twin Deluxe Suite"), view("g3", 3, "Double Deluxe Suite")]

function Harness({ initial, onChange }: { initial: string[]; onChange: (ids: string[]) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <PaxGroupPicker
      groups={groups}
      value={value}
      onChange={(ids) => {
        setValue(ids)
        onChange(ids)
      }}
      activeGroupId={null}
      noun="Suite"
      itemNoun="room"
      itemNumber={2}
      legName="12 Apostles Hotel & Spa"
    />
  )
}

describe("PaxGroupPicker", () => {
  it("names the trigger after the unit, the leg and its suites", () => {
    render(<Harness initial={["g2", "g3"]} onChange={vi.fn()} />)
    expect(
      screen.getByRole("button", { name: "Choose suites for room 2 on 12 Apostles Hotel & Spa, now Suites 2 & 3" }),
    ).toHaveTextContent("For: Suites 2 & 3")
  })

  it("narrows to some suites, and keeps the last one ticked", () => {
    const onChange = vi.fn()
    render(<Harness initial={["g2", "g3"]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Choose suites/ }))

    expect(screen.getByRole("group", { name: "Who is in room 2?" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Suite 3 · Double Deluxe Suite/ }))
    expect(onChange).toHaveBeenLastCalledWith(["g2"])
    // The last ticked box can't be unticked; the hint says why.
    expect(screen.getByRole("checkbox", { name: /Suite 2 · Twin Deluxe Suite/ })).toBeDisabled()
    expect(screen.getByText("Keep at least one suite ticked, or delete this room.")).toBeInTheDocument()
  })

  it("switches to every suite, which writes []", () => {
    const onChange = vi.fn()
    render(<Harness initial={["g2"]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Choose suites/ }))
    fireEvent.click(screen.getByRole("radio", { name: "All suites" }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.getByRole("checkbox", { name: /Suite 1/ })).toBeDisabled()
  })
})
