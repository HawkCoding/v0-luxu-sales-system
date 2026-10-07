import { beforeAll, describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
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

  it("labels the font size default option with the real base size, not the word 'Default'", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} baseFontSize="14px" />)
    expect(screen.getByLabelText("Font size")).toHaveTextContent("14px")
  })

  it("labels the font family default option with the real base family, not the word 'Default'", () => {
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} baseFontFamily="Arial, sans-serif" />)
    expect(screen.getByLabelText("Font family")).toHaveTextContent("Arial")
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

  describe("line spacing", () => {
    beforeAll(() => {
      // Radix Select relies on pointer-capture and scrollIntoView, which jsdom omits.
      if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false
      if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {}
      if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {}
      // The editor's focus() scrolls the caret into view on the next frame, which measures a
      // Range — jsdom implements neither measuring method.
      if (!Range.prototype.getClientRects) {
        Range.prototype.getClientRects = () => [] as unknown as DOMRectList
      }
      if (!Range.prototype.getBoundingClientRect) {
        Range.prototype.getBoundingClientRect = () =>
          ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
      }
    })

    it("renders a line spacing control in the full variant, defaulted to 'Default'", () => {
      render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
      expect(screen.getByLabelText("Line spacing")).toHaveTextContent("Default")
    })

    it("hides the line spacing control in the compact (signature) variant", () => {
      render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} variant="compact" />)
      expect(screen.queryByLabelText("Line spacing")).not.toBeInTheDocument()
    })

    it("shows the spacing of the paragraph at the cursor", async () => {
      render(<HtmlBodyEditor value='<p style="line-height: 1.5;">Hello</p>' onChange={() => {}} />)
      await waitFor(() => expect(screen.getByLabelText("Line spacing")).toHaveTextContent("1.5"))
    })

    it("previews a full body at the sent email's default line height, but leaves signature fields alone", () => {
      const { unmount } = render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
      expect((document.querySelector(".ProseMirror") as HTMLElement).style.lineHeight).toBe("1.4")
      unmount()
      render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} variant="compact" />)
      expect((document.querySelector(".ProseMirror") as HTMLElement).style.lineHeight).toBe("")
    })

    it("applies a chosen spacing from the keyboard and emits it inline on the paragraph, then resets it", async () => {
      const onChange = vi.fn()
      render(<HtmlBodyEditor value="<p>Hello</p>" onChange={onChange} />)

      const trigger = screen.getByLabelText("Line spacing")
      fireEvent.keyDown(trigger, { key: "Enter" })
      for (const label of ["Default", "Single", "1.15", "1.5", "Double"]) {
        expect(screen.getByRole("option", { name: label })).toBeInTheDocument()
      }
      fireEvent.click(screen.getByRole("option", { name: "Double" }))

      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('<p style="line-height: 2;">Hello</p>'))
      await waitFor(() => expect(screen.getByLabelText("Line spacing")).toHaveTextContent("Double"))

      fireEvent.keyDown(screen.getByLabelText("Line spacing"), { key: "Enter" })
      fireEvent.click(screen.getByRole("option", { name: "Default" }))
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("<p>Hello</p>"))
    })

    it("offers the in-between 11px, 13px and 15px font sizes", () => {
      render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
      fireEvent.keyDown(screen.getByLabelText("Font size"), { key: "Enter" })
      for (const size of ["11px", "12px", "13px", "14px", "15px", "16px"]) {
        expect(screen.getByRole("option", { name: size })).toBeInTheDocument()
      }
    })
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

  it("adopts an external value change while the editor is not focused", async () => {
    const { rerender } = render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    rerender(<HtmlBodyEditor value="<p>Server copy</p>" onChange={() => {}} />)
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toHaveTextContent("Server copy"))
  })

  it("does not replace the document under an active caret; applies the change on blur", async () => {
    const { rerender } = render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} />)
    const editable = document.querySelector(".ProseMirror") as HTMLElement
    await waitFor(() => expect(editable).toHaveTextContent("Hello"))

    editable.focus()
    expect(document.activeElement).toBe(editable)

    rerender(<HtmlBodyEditor value="<p>Server copy</p>" onChange={() => {}} />)
    await Promise.resolve()
    await Promise.resolve()
    expect(editable).toHaveTextContent("Hello")

    editable.blur()
    await waitFor(() => expect(editable).toHaveTextContent("Server copy"))
  })

  it("focuses the rich editor when its <label for> is clicked, and takes the label as its name", async () => {
    render(
      <>
        <label htmlFor="company-line">Company line</label>
        <HtmlBodyEditor id="company-line" value="<p>Hello</p>" onChange={() => {}} />
      </>,
    )
    const editable = document.querySelector(".ProseMirror") as HTMLElement
    await waitFor(() => expect(editable).toHaveAttribute("aria-label", "Company line"))
    expect(screen.getByRole("textbox", { name: "Company line" })).toBe(editable)

    fireEvent.click(screen.getByText("Company line"))

    await waitFor(() => expect(editable).toHaveFocus())
  })

  describe("never emits without a user edit", () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

    it.each([
      ["an empty value", ""],
      ["a plain paragraph", "<p>Hello</p>"],
      ["bare text the editor wraps in <p>", "Plain text"],
      ["a style the editor re-serialises", '<p><span style="color:rgb(68, 80, 90)">SA Rail</span></p>'],
    ])("does not emit on mount for %s", async (_label, value) => {
      const onChange = vi.fn()
      render(<HtmlBodyEditor value={value} onChange={onChange} variant="compact" />)
      await settle()
      expect(onChange).not.toHaveBeenCalled()
    })

    it("does not emit when disabled is toggled", async () => {
      const onChange = vi.fn()
      const { rerender } = render(<HtmlBodyEditor value="<p>Hello</p>" onChange={onChange} />)
      rerender(<HtmlBodyEditor value="<p>Hello</p>" onChange={onChange} disabled />)
      rerender(<HtmlBodyEditor value="<p>Hello</p>" onChange={onChange} />)
      await settle()
      expect(onChange).not.toHaveBeenCalled()
    })

    it("does not emit when an external value is applied, and leaves nothing to undo", async () => {
      const onChange = vi.fn()
      const { rerender } = render(<HtmlBodyEditor value="" onChange={onChange} />)
      rerender(<HtmlBodyEditor value="<p>Loaded</p>" onChange={onChange} />)
      await waitFor(() => expect(document.querySelector(".ProseMirror")).toHaveTextContent("Loaded"))
      await settle()
      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByLabelText("Undo")).toBeDisabled()
    })
  })

  describe("HTML source mode", () => {
    function renderInSource(initial: string, onChange: (html: string) => void = () => {}) {
      const view = render(<HtmlBodyEditor value={initial} onChange={onChange} />)
      fireEvent.click(screen.getByLabelText("Toggle HTML source"))
      return view
    }

    it("adopts an external value (a Discard, a save adopting the server copy) while not focused", () => {
      const { rerender } = renderInSource("<p>Draft</p>")
      rerender(<HtmlBodyEditor value="<p>Saved</p>" onChange={() => {}} />)
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("<p>Saved</p>")
    })

    it("does not re-emit the discarded HTML when switching back to rich", () => {
      const onChange = vi.fn()
      const { rerender } = renderInSource("<p>Draft</p>", onChange)
      rerender(<HtmlBodyEditor value="<p>Saved</p>" onChange={onChange} />)
      onChange.mockClear()

      fireEvent.click(screen.getByLabelText("Toggle HTML source"))

      expect(onChange).toHaveBeenCalledWith("<p>Saved</p>")
      expect(onChange).not.toHaveBeenCalledWith("<p>Draft</p>")
    })

    it("does not replace the textarea under an active caret; applies the change on blur", () => {
      const { rerender } = renderInSource("<p>Draft</p>")
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
      textarea.focus()
      expect(document.activeElement).toBe(textarea)

      rerender(<HtmlBodyEditor value="<p>Saved</p>" onChange={() => {}} />)
      expect(textarea.value).toBe("<p>Draft</p>")

      fireEvent.blur(textarea)
      textarea.blur()
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("<p>Saved</p>")
    })

    it("keeps what the user typed when they type after a parked external change", () => {
      const { rerender } = renderInSource("<p>Draft</p>")
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
      textarea.focus()
      rerender(<HtmlBodyEditor value="<p>Saved</p>" onChange={() => {}} />)

      fireEvent.change(textarea, { target: { value: "<p>Typed</p>" } })
      fireEvent.blur(textarea)

      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("<p>Typed</p>")
    })
  })

  it("calls onBlur when the editable area loses focus", () => {
    const onBlur = vi.fn()
    render(<HtmlBodyEditor value="<p>Hello</p>" onChange={() => {}} onBlur={onBlur} />)
    const editable = document.querySelector(".ProseMirror") as HTMLElement
    fireEvent.blur(editable)
    expect(onBlur).toHaveBeenCalled()
  })
})
