import { describe, expect, it } from "vitest"
import {
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_IMAGE_BYTES,
  pngLogoUploadError,
  uploadErrorMessage,
} from "./upload-limits"

describe("MAX_IMAGE_BYTES", () => {
  it("stays under Vercel's 4.5 MB request body limit", () => {
    expect(MAX_IMAGE_BYTES).toBeLessThan(4.5 * 1000 * 1000)
  })
})

describe("pngLogoUploadError", () => {
  it("accepts a PNG at the size limit", () => {
    expect(pngLogoUploadError({ type: "image/png", size: MAX_IMAGE_BYTES })).toBeNull()
  })

  it("rejects a file that is not a PNG", () => {
    expect(pngLogoUploadError({ type: "image/jpeg", size: 1000 })).toBe("The logo must be a PNG image.")
  })

  it("rejects a PNG over the limit and names its size", () => {
    expect(pngLogoUploadError({ type: "image/png", size: 4.7 * 1024 * 1024 })).toBe(
      "This file is 4.7 MB. The maximum image size is 4 MB.",
    )
  })
})

describe("uploadErrorMessage", () => {
  it("returns the API's own error message", async () => {
    const res = new Response(JSON.stringify({ error: "Logo uploads must be a PNG image." }), { status: 400 })
    await expect(uploadErrorMessage(res, "fallback")).resolves.toBe("Logo uploads must be a PNG image.")
  })

  it("reads Vercel's plain-text 413 as a size error", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 })
    await expect(uploadErrorMessage(res, "fallback")).resolves.toBe(IMAGE_TOO_LARGE_MESSAGE)
  })

  it("falls back when the body has no message", async () => {
    const res = new Response("", { status: 500 })
    await expect(uploadErrorMessage(res, "Failed to upload logo")).resolves.toBe("Failed to upload logo")
  })
})
