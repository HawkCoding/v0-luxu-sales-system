import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Tabs } from "@/components/ui/tabs"
import { PaxGroupBar } from "./pax-group-bar"
import type { PaxGroupProblem, PaxGroupView } from "@/lib/packages/pax-group-toggles"

function view(id: string, position: number, adults: number, children = 0): PaxGroupView {
  return {
    id,
    position,
    typedLabel: null,
    autoLabel: `Twin Deluxe Suite ${position}`,
    label: `Twin Deluxe Suite ${position}`,
    shortLabel: "Twin Deluxe Suite",
    pax: { adultCount: adults, childCount: children, infantCount: 0 },
    primaryUnit: null,
  }
}

const groups = [view("g1", 1, 2), view("g2", 2, 1, 1), view("g3", 3, 0)]
const problems = new Map<string, PaxGroupProblem | null>([
  ["g3", { level: "blocking", reasons: ["no guests in this suite"] }],
  ["g2", { level: "warning", reasons: ["no rate card"] }],
])

function setup(overrides: Partial<Parameters<typeof PaxGroupBar>[0]> = {}) {
  const onActiveGroupChange = vi.fn()
  const onAddGroup = vi.fn()
  render(
    <Tabs value="all" onValueChange={(value) => onActiveGroupChange(value === "all" ? null : value)}>
      <PaxGroupBar
        groups={groups}
        problems={problems}
        activeGroupId={null}
        onActiveGroupChange={onActiveGroupChange}
        onAddGroup={onAddGroup}
        noun="Suite"
        placed={4}
        total={6}
        announcement="Suite 3 added."
        {...overrides}
      />
    </Tabs>,
  )
  return { onActiveGroupChange, onAddGroup }
}

describe("PaxGroupBar", () => {
  it("shows a tab per suite with its type, guests and any problem in words", () => {
    setup()
    expect(screen.getByRole("tab", { name: /All suites/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /Suite 1 Twin Deluxe Suite · 2 adults/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Suite 2 .*1 adult, 1 child.*Check.*needs attention: no rate card/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Suite 3 .*No guests.*needs attention: no guests in this suite/ })).toBeInTheDocument()
  })

  it("summarises placed guests and flags a gap with a word, not colour alone", () => {
    setup()
    expect(screen.getByText(/3 suites · 4 of 6 guests placed/)).toBeInTheDocument()
    expect(screen.getByText("check")).toBeInTheDocument()
  })

  it("switches suites from a tab and adds a suite", () => {
    const { onActiveGroupChange, onAddGroup } = setup()
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Suite 2/ }), { button: 0 })
    expect(onActiveGroupChange).toHaveBeenCalledWith("g2")
    fireEvent.click(screen.getAllByRole("button", { name: "Add suite" })[0])
    expect(onAddGroup).toHaveBeenCalled()
  })

  it("offers previous and next suite on phones, disabled at the ends", () => {
    const { onActiveGroupChange } = setup()
    expect(screen.getByRole("button", { name: "Previous suite" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Next suite" }))
    expect(onActiveGroupChange).toHaveBeenCalledWith("g1")
  })

  it("puts Add suite in the phone select row as an icon button", () => {
    const { onAddGroup } = setup()
    const buttons = screen.getAllByRole("button", { name: "Add suite" })
    expect(buttons).toHaveLength(2)
    expect(buttons[1]).not.toHaveTextContent("Add suite")
    fireEvent.click(buttons[1])
    expect(onAddGroup).toHaveBeenCalled()
  })

  it("shows the how-it-works helper in All suites only", () => {
    setup()
    expect(screen.getByText(/Each suite starts with every service/)).toBeInTheDocument()
  })

  it("drops the helper in a suite's own view", () => {
    setup({ activeGroupId: "g2" })
    expect(screen.queryByText(/Each suite starts with every service/)).not.toBeInTheDocument()
  })

  it("announces through a polite live region", () => {
    setup()
    expect(screen.getByRole("status")).toHaveTextContent("Suite 3 added.")
  })
})
