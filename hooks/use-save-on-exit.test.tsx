import { fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { useSaveOnExit } from "./use-save-on-exit"

function Harness({ onExit, enabled }: { onExit: () => void; enabled: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useSaveOnExit(ref, onExit, enabled)
  return (
    <div>
      <div data-testid="section" ref={ref}>
        <input data-testid="inside-input" />
      </div>
      <button data-testid="outside-button">outside</button>
      <div role="listbox" data-testid="portal-listbox">
        <div data-testid="portal-option">option</div>
      </div>
    </div>
  )
}

describe("useSaveOnExit", () => {
  it("fires onExit when a pointerdown lands outside the watched element", () => {
    const onExit = vi.fn()
    const { getByTestId } = render(<Harness onExit={onExit} enabled />)
    fireEvent.pointerDown(getByTestId("outside-button"))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it("does not fire when the pointerdown stays inside the watched element", () => {
    const onExit = vi.fn()
    const { getByTestId } = render(<Harness onExit={onExit} enabled />)
    fireEvent.pointerDown(getByTestId("inside-input"))
    expect(onExit).not.toHaveBeenCalled()
  })

  it("does not fire for a pointerdown inside a portalled listbox/menu/dialog", () => {
    const onExit = vi.fn()
    const { getByTestId } = render(<Harness onExit={onExit} enabled />)
    fireEvent.pointerDown(getByTestId("portal-option"))
    expect(onExit).not.toHaveBeenCalled()
  })

  it("does not fire on an outside pointerdown when disabled", () => {
    const onExit = vi.fn()
    const { getByTestId } = render(<Harness onExit={onExit} enabled={false} />)
    fireEvent.pointerDown(getByTestId("outside-button"))
    expect(onExit).not.toHaveBeenCalled()
  })

  it("fires on focusin moving outside the watched element", () => {
    const onExit = vi.fn()
    const { getByTestId } = render(<Harness onExit={onExit} enabled />)
    fireEvent.focusIn(getByTestId("outside-button"))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
