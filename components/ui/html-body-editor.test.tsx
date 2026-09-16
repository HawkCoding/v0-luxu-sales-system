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

  it("renders a font size control alongside the rich toolbar, defaulted to 'Default'", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    expect(screen.getByLabelText("Font size")).toHaveTextContent("Default")
  })

  it("applies a base font size to the editable area", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} baseFontSize="18px" />)
    const editorEl = document.querySelector(".ProseMirror") as HTMLElement
    expect(editorEl.style.fontSize).toBe("18px")
  })

  it("renders text color and highlight controls, each opening a swatch grid with a Default option", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)

    const textColorButton = screen.getByLabelText("Text color")
    expect(textColorButton).toBeInTheDocument()
    fireEvent.click(textColorButton)
    expect(screen.getByLabelText("Near-black")).toBeInTheDocument()
    expect(screen.getByLabelText("Navy")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Default" })).toBeInTheDocument()
    fireEvent.click(textColorButton) // close

    const highlightButton = screen.getByLabelText("Highlight color")
    expect(highlightButton).toBeInTheDocument()
    fireEvent.click(highlightButton)
    expect(screen.getByLabelText("Yellow")).toBeInTheDocument()
    expect(screen.getByLabelText("Grey")).toBeInTheDocument()
  })

  it("applies a custom hex text color typed into the swatch popover", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)

    fireEvent.click(screen.getByLabelText("Text color"))
    const hexInput = screen.getByLabelText("Custom text color hex")
    fireEvent.change(hexInput, { target: { value: "4a90d9" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    // Popover closes on a successful apply — the swatch grid is gone.
    expect(screen.queryByLabelText("Near-black")).not.toBeInTheDocument()
  })

  it("rejects an invalid custom hex without applying it", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)

    fireEvent.click(screen.getByLabelText("Text color"))
    const hexInput = screen.getByLabelText("Custom text color hex")
    fireEvent.change(hexInput, { target: { value: "notahex" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(screen.getByText(/enter a valid hex/i)).toBeInTheDocument()
    // Popover stays open on rejection.
    expect(screen.getByLabelText("Near-black")).toBeInTheDocument()
  })

  it("renders a font family control alongside the rich toolbar, defaulted to 'Default'", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    expect(screen.getByLabelText("Font family")).toHaveTextContent("Default")
  })

  it("hides the bullet/ordered list buttons in the compact variant", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} variant="compact" />)
    expect(screen.queryByLabelText("Bullet list")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Ordered list")).not.toBeInTheDocument()
  })

  it("shows the bullet/ordered list buttons in the default (full) variant", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    expect(screen.getByLabelText("Bullet list")).toBeInTheDocument()
    expect(screen.getByLabelText("Ordered list")).toBeInTheDocument()
  })

  it("omits the Insert field control when no insertTokens are given", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    expect(screen.queryByText("Insert field")).not.toBeInTheDocument()
  })

  it("inserts a {{token}} at the cursor when a field is picked from Insert field", () => {
    const onChange = vi.fn()
    render(
      <HtmlBodyEditor
        value="<p>Hello</p>"
        onChange={onChange}
        insertTokens={[{ token: "fullName", label: "Full name" }]}
      />,
    )
    fireEvent.click(screen.getByText("Insert field"))
    fireEvent.click(screen.getByText("Full name"))
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("{{fullName}}"))
  })

  it("calls onBlur when the editable area loses focus", () => {
    const onBlur = vi.fn()
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} onBlur={onBlur} />)
    const editable = document.querySelector(".ProseMirror") as HTMLElement
    fireEvent.blur(editable)
    expect(onBlur).toHaveBeenCalled()
  })
})
