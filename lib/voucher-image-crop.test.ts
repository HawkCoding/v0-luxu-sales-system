import { describe, expect, it } from "vitest"

import { getVoucherCropOutput } from "./voucher-image-crop"

describe("getVoucherCropOutput", () => {
  it("returns a square transparent logo output", () => {
    expect(getVoucherCropOutput("logo")).toEqual({
      width: 512,
      height: 512,
      mimeType: "image/png",
      fileName: "voucher-logo.png",
    })
  })

  it("returns the fixed banner output dimensions and web format", () => {
    expect(getVoucherCropOutput("banner")).toEqual({
      width: 1200,
      height: 300,
      mimeType: "image/webp",
      fileName: "voucher-banner.webp",
      quality: 0.92,
    })
  })
})
