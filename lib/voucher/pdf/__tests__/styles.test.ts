import { describe, expect, it } from "vitest"

import { DESIGN_COLORS } from "@/lib/pdf/sarail-design"
import { voucherStyles } from "../styles"

const styles = voucherStyles()

describe("voucherStyles", () => {
  // react-pdf drops `fixed` render-prop text (the last-page footer) when a Page ancestor carries
  // lineHeight. Keep lineHeight off the page style.
  it("does not set lineHeight on the page style", () => {
    expect("lineHeight" in styles.page).toBe(false)
  })

  it("paints the Angora page and the Swirl boxes from the design palette", () => {
    expect(styles.page.backgroundColor).toBe(DESIGN_COLORS.page)
    expect(styles.box.backgroundColor).toBe(DESIGN_COLORS.box)
  })
})
