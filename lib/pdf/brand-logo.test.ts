import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}))

vi.mock("fs", () => ({
  default: { readFileSync: fsMocks.readFileSync },
  readFileSync: fsMocks.readFileSync,
}))

async function loadModule() {
  vi.resetModules()
  return import("./brand-logo")
}

describe("loadBrandLogo", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    fsMocks.readFileSync.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it("falls back to the committed asset when no URL is supplied", async () => {
    fsMocks.readFileSync.mockReturnValue(Buffer.from("disk-bytes"))
    const { loadBrandLogo } = await loadModule()

    const result = await loadBrandLogo(null)

    expect(result).toEqual({ data: Buffer.from("disk-bytes"), format: "png" })
    expect(fsMocks.readFileSync).toHaveBeenCalledTimes(1)
  })

  it("fetches the uploaded logo when a URL is supplied", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes })
    const { loadBrandLogo } = await loadModule()

    const result = await loadBrandLogo("https://example.com/logo.png")

    expect(result).toEqual({ data: Buffer.from([1, 2, 3]), format: "png" })
    expect(fsMocks.readFileSync).not.toHaveBeenCalled()
  })

  it("falls back to the committed asset when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    fsMocks.readFileSync.mockReturnValue(Buffer.from("disk-bytes"))
    const { loadBrandLogo } = await loadModule()

    const result = await loadBrandLogo("https://example.com/missing.png")

    expect(result).toEqual({ data: Buffer.from("disk-bytes"), format: "png" })
  })

  it("degrades to null when both the fetch and the disk read fail", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"))
    fsMocks.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT")
    })
    const { loadBrandLogo } = await loadModule()

    const result = await loadBrandLogo("https://example.com/logo.png")

    expect(result).toBeNull()
  })

  it("caches a resolved URL so a second call does not re-fetch", async () => {
    const bytes = new Uint8Array([9]).buffer
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes })
    global.fetch = fetchSpy
    const { loadBrandLogo } = await loadModule()

    await loadBrandLogo("https://example.com/logo.png")
    await loadBrandLogo("https://example.com/logo.png")

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
