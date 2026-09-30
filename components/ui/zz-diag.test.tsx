import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { HtmlBodyEditor } from "@/components/ui/html-body-editor"

const CASES = [
  "",
  "<p>Hello</p>",
  "Plain text",
  '<p><span style="color:rgb(68, 80, 90)">x</span></p>',
  '<span style="color:rgb(68, 80, 90)">SA Rail</span>',
  "<strong>{{fullName}}</strong><br>{{jobTitle}}",
  "Line one<br>Line two",
]

describe("diag", () => {
  for (const value of CASES) {
    it(`init emit for ${JSON.stringify(value)}`, async () => {
      const onChange = vi.fn()
      render(<HtmlBodyEditor value={value} onChange={onChange} variant="compact" />)
      await new Promise((r) => setTimeout(r, 50))
      console.log(JSON.stringify(value), "=>", JSON.stringify(onChange.mock.calls))
      expect(true).toBe(true)
    })
  }
})
