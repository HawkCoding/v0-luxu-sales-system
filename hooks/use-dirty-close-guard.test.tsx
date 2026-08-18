import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useDirtyCloseGuard } from "./use-dirty-close-guard"

function makeEvent() {
  return { preventDefault: vi.fn() }
}

describe("useDirtyCloseGuard", () => {
  it("closes immediately on every dismissal path when clean", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: false, onConfirmedClose }))

    const event = makeEvent()
    act(() => result.current.contentProps.onEscapeKeyDown(event))
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(result.current.confirming).toBe(false)

    act(() => result.current.handleOpenChange(false))
    expect(onConfirmedClose).toHaveBeenCalledTimes(1)
  })

  it("prevents default and opens the confirm on outside interaction when dirty", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: true, onConfirmedClose }))

    const event = makeEvent()
    act(() => result.current.contentProps.onInteractOutside(event))
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(result.current.confirming).toBe(true)
    expect(onConfirmedClose).not.toHaveBeenCalled()
  })

  it("prevents default and opens the confirm on Escape when dirty", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: true, onConfirmedClose }))

    const event = makeEvent()
    act(() => result.current.contentProps.onEscapeKeyDown(event))
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(result.current.confirming).toBe(true)
  })

  it("routes onOpenChange(false) through the same confirm when dirty", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: true, onConfirmedClose }))

    act(() => result.current.handleOpenChange(false))
    expect(result.current.confirming).toBe(true)
    expect(onConfirmedClose).not.toHaveBeenCalled()
  })

  it("does not guard opening (onOpenChange(true))", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: true, onConfirmedClose }))

    act(() => result.current.handleOpenChange(true))
    expect(result.current.confirming).toBe(false)
    expect(onConfirmedClose).not.toHaveBeenCalled()
  })

  it("confirmDiscard closes the confirm and runs onConfirmedClose", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: true, onConfirmedClose }))

    act(() => result.current.handleOpenChange(false))
    expect(result.current.confirming).toBe(true)
    act(() => result.current.confirmDiscard())
    expect(result.current.confirming).toBe(false)
    expect(onConfirmedClose).toHaveBeenCalledTimes(1)
  })

  it("cancelDiscard closes the confirm without closing the form", () => {
    const onConfirmedClose = vi.fn()
    const { result } = renderHook(() => useDirtyCloseGuard({ isDirty: true, onConfirmedClose }))

    act(() => result.current.handleOpenChange(false))
    act(() => result.current.cancelDiscard())
    expect(result.current.confirming).toBe(false)
    expect(onConfirmedClose).not.toHaveBeenCalled()
  })
})
