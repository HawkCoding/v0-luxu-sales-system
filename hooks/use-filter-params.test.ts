import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  pathname: "/app/bookings",
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}))

import { useFilterParams } from "./use-filter-params"

const DEFAULTS = { q: "", supplier: "all" }

describe("useFilterParams", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    nav.replace.mockReset()
    nav.searchParams = new URLSearchParams()
  })

  it("reads defaults when nothing is in the URL", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULTS))
    expect(result.current.values).toEqual(DEFAULTS)
    expect(result.current.hasActive).toBe(false)
  })

  it("commits a non-debounced change immediately and omits default keys from the URL", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULTS))

    act(() => {
      result.current.setValue("supplier", "Rovos Rail")
    })

    expect(nav.replace).toHaveBeenCalledWith("/app/bookings?supplier=Rovos+Rail", { scroll: false })
  })

  it("resetting a filter back to its default deletes the URL key", () => {
    nav.searchParams = new URLSearchParams("supplier=Rovos+Rail")
    const { result } = renderHook(() => useFilterParams(DEFAULTS))

    act(() => {
      result.current.setValue("supplier", "all")
    })

    expect(nav.replace).toHaveBeenCalledWith("/app/bookings", { scroll: false })
  })

  it("debounces a search change and reflects it in values before the URL commits", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULTS))

    act(() => {
      result.current.setValue("q", "Jacomien", { debounceMs: 250 })
    })

    // Reflected immediately in `values` for a responsive input...
    expect(result.current.values.q).toBe("Jacomien")
    // ...but not yet written to the URL.
    expect(nav.replace).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(nav.replace).toHaveBeenCalledWith("/app/bookings?q=Jacomien", { scroll: false })
  })

  it("a later keystroke resets the debounce timer instead of stacking commits", () => {
    const { result } = renderHook(() => useFilterParams(DEFAULTS))

    act(() => {
      result.current.setValue("q", "Jaco", { debounceMs: 250 })
    })
    act(() => {
      vi.advanceTimersByTime(150)
      result.current.setValue("q", "Jacomien", { debounceMs: 250 })
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(nav.replace).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith("/app/bookings?q=Jacomien", { scroll: false })
  })

  it("keeps the typed search text after the debounce fires until the URL catches up", () => {
    const { result, rerender } = renderHook(() => useFilterParams(DEFAULTS))

    act(() => {
      result.current.setValue("q", "Jaco", { debounceMs: 250 })
    })
    act(() => {
      vi.advanceTimersByTime(250)
    })

    // router.replace has been called but the URL has not landed yet: no revert to "".
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(result.current.values.q).toBe("Jaco")

    nav.searchParams = new URLSearchParams("q=Jaco")
    rerender()
    expect(result.current.values.q).toBe("Jaco")
  })

  it("keeps newer keystrokes typed while an earlier commit is still navigating", () => {
    const { result, rerender } = renderHook(() => useFilterParams(DEFAULTS))

    act(() => {
      result.current.setValue("q", "Jaco", { debounceMs: 250 })
    })
    act(() => {
      vi.advanceTimersByTime(250)
    })
    act(() => {
      result.current.setValue("q", "Jacom", { debounceMs: 250 })
    })

    // Old navigation lands with "Jaco" while "Jacom" is still pending.
    nav.searchParams = new URLSearchParams("q=Jaco")
    rerender()
    expect(result.current.values.q).toBe("Jacom")
  })

  it("clear() resets every key and writes the bare pathname", () => {
    nav.searchParams = new URLSearchParams("supplier=Rovos+Rail&q=Jaco")
    const { result } = renderHook(() => useFilterParams(DEFAULTS))
    expect(result.current.hasActive).toBe(true)

    act(() => {
      result.current.clear()
    })

    expect(nav.replace).toHaveBeenCalledWith("/app/bookings", { scroll: false })
  })

  it("hasActive is true only when a value differs from its default", () => {
    nav.searchParams = new URLSearchParams("supplier=all")
    const { result } = renderHook(() => useFilterParams(DEFAULTS))
    expect(result.current.hasActive).toBe(false)
  })
})
