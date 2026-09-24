import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ClubMemberNumbersEditor } from "./club-member-numbers-editor"
import type { ClubMembership } from "@/lib/club-memberships"

function Harness({ initial = [], onChange }: { initial?: ClubMembership[]; onChange?: (v: ClubMembership[]) => void }) {
  const [value, setValue] = useState<ClubMembership[]>(initial)
  return (
    <ClubMemberNumbersEditor
      idPrefix="test"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      suggestions={["Rovos Rail"]}
      heading="Club member numbers"
    />
  )
}

describe("ClubMemberNumbersEditor", () => {
  it("shows only a small add link while empty", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: /club member number/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Club / programme")).not.toBeInTheDocument()
  })

  it("expands into a focused row when the link is clicked", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: /club member number/i }))
    const club = screen.getByPlaceholderText("Club / programme")
    expect(club).toHaveFocus()
    expect(screen.getByPlaceholderText("Member number")).toBeInTheDocument()
    expect(screen.getByText("Club member numbers")).toBeInTheDocument()
  })

  it("adds more rows and collapses back once the last one is removed", () => {
    render(<Harness initial={[{ club: "Rovos Rail", number: "RR-1" }]} />)
    fireEvent.click(screen.getByRole("button", { name: /add another/i }))
    expect(screen.getAllByPlaceholderText("Club / programme")).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: "Remove club member number 2" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove club member number 1" }))
    expect(screen.queryByPlaceholderText("Club / programme")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /club member number/i })).toBeInTheDocument()
  })

  it("flags a row that has a club but no number once focus leaves the row", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /club member number/i }))
    const club = screen.getByPlaceholderText("Club / programme")
    fireEvent.change(club, { target: { value: "Rovos Rail" } })

    expect(screen.queryByText("Add both the club and the member number.")).not.toBeInTheDocument()

    fireEvent.focusOut(club, { relatedTarget: null })

    expect(screen.getByText("Add both the club and the member number.")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Member number")).toHaveAttribute("aria-invalid", "true")
    expect(onChange).toHaveBeenLastCalledWith([{ club: "Rovos Rail", number: "" }])
  })

  it("offers saved club names as suggestions", () => {
    render(<Harness initial={[{ club: "", number: "" }]} />)
    expect(screen.getByPlaceholderText("Club / programme")).toHaveAttribute("list", "test-club-options")
    expect(document.querySelector('#test-club-options option[value="Rovos Rail"]')).not.toBeNull()
  })

  it("renders a plain list when read-only", () => {
    render(
      <ClubMemberNumbersEditor
        idPrefix="ro"
        readOnly
        value={[{ club: "Rovos Rail", number: "RR-1" }]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText("Rovos Rail")).toBeInTheDocument()
    expect(screen.getByText("RR-1")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("says none recorded when read-only and empty", () => {
    render(<ClubMemberNumbersEditor idPrefix="ro" readOnly value={[]} onChange={vi.fn()} />)
    expect(screen.getByText("None recorded")).toBeInTheDocument()
  })
})
