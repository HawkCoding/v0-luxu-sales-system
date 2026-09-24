import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SendPaymentConfirmationButton } from "./send-payment-confirmation-button"

vi.mock("@/components/preview-and-send-dialog", () => ({
  PreviewAndSendDialog: (props: { open: boolean; bodyHtml: string; title: string }) =>
    props.open ? (
      <div data-testid="preview" data-title={props.title}>
        {props.bodyHtml}
      </div>
    ) : null,
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

describe("SendPaymentConfirmationButton (trigger)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("labels the trigger as a payment confirmation while a balance is owing", () => {
    render(<SendPaymentConfirmationButton jobId="booking-1" hasPayments mutate={() => {}} />)
    expect(screen.getByRole("button", { name: "Send payment confirmation" })).toBeInTheDocument()
  })

  it("labels the trigger and dialog for a full payment once the balance is zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            paidInFull: true,
            email: { to: "client@example.com", subject: "Full payment received", bodyHtml: "paid" },
          }),
      }),
    )
    render(<SendPaymentConfirmationButton jobId="booking-1" hasPayments paidInFull mutate={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: "Send full payment confirmation" }))

    await waitFor(() =>
      expect(screen.getByTestId("preview")).toHaveAttribute("data-title", "Full payment received"),
    )
  })

  it("titles the dialog from the server's answer, not the page's copy of the balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            paidInFull: false,
            email: { to: "client@example.com", subject: "Payment received", bodyHtml: "owing" },
          }),
      }),
    )
    render(<SendPaymentConfirmationButton jobId="booking-1" hasPayments paidInFull mutate={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: "Send full payment confirmation" }))

    await waitFor(() => expect(screen.getByTestId("preview")).toHaveAttribute("data-title", "Payment received"))
  })
})
