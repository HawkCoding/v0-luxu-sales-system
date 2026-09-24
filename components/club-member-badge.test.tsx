import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ClubMemberBadge } from "./club-member-badge"

describe("ClubMemberBadge", () => {
  it("renders nothing without memberships", () => {
    const { container: empty } = render(<ClubMemberBadge memberships={[]} />)
    expect(empty).toBeEmptyDOMElement()
    const { container: missing } = render(<ClubMemberBadge memberships={undefined} />)
    expect(missing).toBeEmptyDOMElement()
  })

  it("ignores blank entries", () => {
    const { container } = render(<ClubMemberBadge memberships={[{ club: " ", number: "" }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a focusable badge labelled with the club and number", () => {
    render(<ClubMemberBadge memberships={[{ club: "Golden Club", number: "GC-10293" }]} />)
    const badge = screen.getByLabelText("Club member: Golden Club GC-10293")
    expect(badge).toHaveTextContent("Club member")
    expect(badge).toHaveAttribute("tabindex", "0")
  })

  it("lists every membership in the accessible label", () => {
    render(
      <ClubMemberBadge
        memberships={[
          { club: "Golden Club", number: "GC-1" },
          { club: "Rovos Rail", number: "RR-2" },
        ]}
      />,
    )
    expect(screen.getByLabelText("Club member: Golden Club GC-1, Rovos Rail RR-2")).toBeInTheDocument()
  })
})
