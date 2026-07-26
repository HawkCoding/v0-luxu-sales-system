import { describe, expect, it } from "vitest"
import { readPngDimensions, signatureAssetObjectPath } from "./signature-assets"

function makePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  bytes.set(sig, 0)
  // length (unused by the reader)
  bytes.set([0, 0, 0, 13], 8)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  return bytes
}

describe("readPngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(readPngDimensions(makePng(480, 120))).toEqual({ width: 480, height: 120 })
  })

  it("returns null for a non-PNG file", () => {
    expect(readPngDimensions(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]))).toBeNull()
  })

  it("returns null for a truncated buffer", () => {
    expect(readPngDimensions(new Uint8Array(10))).toBeNull()
  })

  it("returns null for zero dimensions", () => {
    expect(readPngDimensions(makePng(0, 0))).toBeNull()
  })
})

describe("signatureAssetObjectPath", () => {
  it("produces a stable, content-hashed path under the brand's slug", () => {
    const bytes = new Uint8Array([1, 2, 3])
    const path1 = signatureAssetObjectPath("banner", "sa-rail", bytes)
    const path2 = signatureAssetObjectPath("banner", "sa-rail", bytes)
    expect(path1).toBe(path2)
    expect(path1).toMatch(/^signature\/sa-rail\/banner-[0-9a-f]{16}\.png$/)
  })

  it("produces a different path for different content", () => {
    const path1 = signatureAssetObjectPath("badge", "sa-rail", new Uint8Array([1]))
    const path2 = signatureAssetObjectPath("badge", "sa-rail", new Uint8Array([2]))
    expect(path1).not.toBe(path2)
  })
})
