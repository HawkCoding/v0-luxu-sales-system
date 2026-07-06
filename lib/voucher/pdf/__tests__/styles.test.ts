import { describe, expect, it } from "vitest"

import { voucherStyles } from "../styles"

const styles = voucherStyles({
  accentColour: "#0B2A3A",
  sectionBg: "#1a3a4a",
  fonts: { display: "Playfair Display", sans: "Montserrat", body: "Playfair Display" },
})

describe("voucherStyles", () => {
  // react-pdf drops `fixed` render-prop text (the footer page number) when a
  // Page ancestor carries lineHeight. Keep lineHeight off the page style.
  it("does not set lineHeight on the page style", () => {
    expect("lineHeight" in styles.page).toBe(false)
  })

  it("keeps the page number pinned inside the frame", () => {
    expect(styles.pageNumber.position).toBe("absolute")
    expect(styles.pageNumber.bottom).toBeGreaterThanOrEqual(24)
  })
})
