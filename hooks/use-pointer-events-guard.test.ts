import { afterEach, describe, expect, it, vi } from "vitest"
import { createErrorReporter, releaseStuckPointerEvents } from "./use-pointer-events-guard"

afterEach(() => {
  document.body.innerHTML = ""
  document.body.style.removeProperty("pointer-events")
  vi.restoreAllMocks()
})

describe("releaseStuckPointerEvents", () => {
  it("clears a stuck lock when no modal layer is mounted", () => {
    document.body.style.pointerEvents = "none"

    expect(releaseStuckPointerEvents()).toBe(true)
    expect(document.body.style.pointerEvents).toBe("")
  })

  it("leaves the lock alone while a dialog is open", () => {
    document.body.style.pointerEvents = "none"
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    document.body.appendChild(dialog)

    expect(releaseStuckPointerEvents()).toBe(false)
    expect(document.body.style.pointerEvents).toBe("none")
  })

  it("leaves the lock alone while an alertdialog is open", () => {
    document.body.style.pointerEvents = "none"
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "alertdialog")
    document.body.appendChild(dialog)

    expect(releaseStuckPointerEvents()).toBe(false)
  })

  it("is a no-op when pointer events are not locked", () => {
    expect(releaseStuckPointerEvents()).toBe(false)
    expect(document.body.style.pointerEvents).toBe("")
  })

  it("clears the lock once the dialog unmounts", () => {
    document.body.style.pointerEvents = "none"
    const dialog = document.createElement("div")
    dialog.setAttribute("data-slot", "dialog-content")
    document.body.appendChild(dialog)
    expect(releaseStuckPointerEvents()).toBe(false)

    dialog.remove()
    expect(releaseStuckPointerEvents()).toBe(true)
    expect(document.body.style.pointerEvents).toBe("")
  })
})

describe("createErrorReporter", () => {
  it("posts the error to the client-error sink", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const report = createErrorReporter(() => 0)
    report("boom", { url: "http://localhost/app" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/client-errors")
    expect(JSON.parse(init.body as string)).toEqual({
      message: "boom",
      url: "http://localhost/app",
    })
  })

  it("throttles repeats of the same message within a minute", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    let now = 0

    const report = createErrorReporter(() => now)
    report("boom", {})
    report("boom", {})
    now = 59_000
    report("boom", {})

    expect(fetchMock).toHaveBeenCalledTimes(1)

    now = 61_000
    report("boom", {})
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not throttle distinct messages", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const report = createErrorReporter(() => 0)
    report("boom", {})
    report("bang", {})

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("ignores empty messages", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    createErrorReporter(() => 0)("", {})

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("swallows a failing report", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    expect(() => createErrorReporter(() => 0)("boom", {})).not.toThrow()
    await Promise.resolve()
  })
})
