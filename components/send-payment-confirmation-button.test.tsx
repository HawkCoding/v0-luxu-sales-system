import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { SendPaymentConfirmationButton } from "./send-payment-confirmation-button"

vi.mock("@/components/preview-and-send-dialog", () => ({
  PreviewAndSendDialog: (props: { open: boolean; bodyHtml: string }) =>
    props.open ? <div data-testid="preview">{props.bodyHtml}</div> : null,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

function prepared(bodyHtml: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        email: { to: "client@example.com", subject: "Payment received", bodyHtml },
      }),
  }
}

function controlled(open: boolean) {
  return (
    <SendPaymentConfirmationButton
      jobId="booking-1"
      hasPayments
      mutate={() => {}}
      open={open}
      onOpenChange={() => {}}
      trigger={false}
    />
  )
}

describe("SendPaymentConfirmationButton (controlled)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("prepares a fresh email on every open and never shows the previous one", async () => {
    let resolveSecond: (value: ReturnType<typeof prepared>) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(prepared("deposit R289 500,00 due"))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)))
    vi.stubGlobal("fetch", fetchMock)

    const { rerender } = render(controlled(true))
    await waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent("R289 500,00"))

    rerender(controlled(false))
    rerender(controlled(true))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // Second prepare still in flight: the stale deposit email must not show.
    expect(screen.queryByTestId("preview")).toBeNull()

    resolveSecond(prepared("final R0,00 due"))
    await waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent("R0,00"))
  })
})
