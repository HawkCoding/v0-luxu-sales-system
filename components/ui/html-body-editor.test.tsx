import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HtmlBodyEditor } from "@/components/ui/html-body-editor"
import { normalizeForCompare } from "@/lib/templates/rich-text/serialize"

describe("HtmlBodyEditor", () => {
  it("renders a rich toolbar for representable content", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    expect(screen.getByLabelText("Bold")).toBeInTheDocument()
    expect(screen.getByLabelText("Toggle HTML source")).toBeInTheDocument()
  })

  it("preserves value through rich -> source -> rich", () => {
    const value = "<p>Dear <strong>Sofia</strong>,</p>"
    let current = value
    const { rerender } = render(
      <HtmlBodyEditor
        value={current}
        onChange={(html) => {
          current = html
        }}
      />,
    )
    fireEvent.click(screen.getByLabelText("Toggle HTML source"))
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(normalizeForCompare(textarea.value)).toBe(normalizeForCompare(value))
    fireEvent.click(screen.getByLabelText("Toggle HTML source"))
    rerender(<HtmlBodyEditor value={current} onChange={() => {}} />)
    expect(normalizeForCompare(current)).toBe(normalizeForCompare(value))
  })

  it("opens exotic content in source mode with the rich toggle disabled", () => {
    // Top-level HTML comments cannot be represented and so cannot round-trip.
    render(
      <HtmlBodyEditor value="<p>a</p><!-- keep me --><p>b</p>" onChange={() => {}} />,
    )
    const toggle = screen.getByLabelText("Rich text unavailable")
    expect(toggle).toBeDisabled()
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("emits changes when the source textarea is edited", () => {
    const onChange = vi.fn()
    render(<HtmlBodyEditor value="<p>a</p>" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText("Toggle HTML source"))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "<p>b</p>" } })
    expect(onChange).toHaveBeenCalledWith("<p>b</p>")
  })
})
