import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { GenerateVoucherDialog } from "./generate-voucher-dialog"

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerMocks.push }),
}))

const legReferencesMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/use-data", () => ({
  useJobLegReferences: (bookingId: string | null) => legReferencesMock(bookingId),
}))

vi.mock("@/components/preview-and-send-dialog", () => ({
  PreviewAndSendDialog: (props: { open: boolean; bodyHtml: string; title: string }) =>
    props.open ? (
      <div data-testid="voucher-preview" data-title={props.title}>
        {props.bodyHtml}
      </div>
    ) : null,
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

function completeReferences() {
  legReferencesMock.mockReturnValue({
    data: { rows: [{ label: "Pretoria → Cape Town", supplierReference: "BT-1234" }] },
    error: undefined,
  })
}

function missingReferences() {
  legReferencesMock.mockReturnValue({
    data: { rows: [{ label: "Pretoria → Cape Town", supplierReference: "" }] },
    error: undefined,
  })
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) }
}

function renderDialog(open = true) {
  return render(
    <GenerateVoucherDialog
      open={open}
      onOpenChange={() => {}}
      jobId="booking-1"
      bookingNumber="LTT-2026-0001"
      onSent={() => {}}
    />,
  )
}

describe("GenerateVoucherDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    legReferencesMock.mockReset()
    routerMocks.push.mockReset()
  })

  it("blocks on missing supplier references instead of calling generate", async () => {
    missingReferences()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    renderDialog()

    expect(await screen.findByText(/missing a supplier/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /preview & send voucher/i }),
    ).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rebuilds the PDF, prepares the email, then opens the send preview with any warnings", async () => {
    completeReferences()
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) => {
        if (url === "/api/voucher/generate") {
          return Promise.resolve(
            jsonResponse({
              voucherRecord: { id: "voucher-1", voucherNumber: "180226-01" },
              voucher: { filename: "voucher.pdf", contentBase64: "AA==" },
              readinessWarnings: [
                { code: "no_contact", message: "No named contact for Pretoria leg", fixHint: "Add one on Voucher Details" },
              ],
            }),
          )
        }
        if (url === "/api/vouchers/voucher-1/prepare-send") {
          return Promise.resolve(
            jsonResponse({
              voucher: { id: "voucher-1", voucherNumber: "180226-01", jobId: "booking-1" },
              email: { to: "client@example.test", subject: "Your Travel Voucher", bodyHtml: "<p>voucher</p>" },
              attachments: [{ filename: "voucher.pdf", contentBase64: "AA==" }],
            }),
          )
        }
        throw new Error(`unexpected fetch: ${url}`)
      })
    vi.stubGlobal("fetch", fetchMock)

    renderDialog()

    // Opening the dialog is the send action: no separate Generate click.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/voucher/generate",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vouchers/voucher-1/prepare-send",
        expect.objectContaining({ method: "POST" }),
      ),
    )

    const preview = await screen.findByTestId("voucher-preview")
    expect(preview).toHaveAttribute("data-title", "Send travel voucher")
    expect(preview).toHaveTextContent("voucher")
  })

  it("shows a retry state when generation fails, without opening a preview", async () => {
    completeReferences()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "Voucher could not be generated" }, false))
    vi.stubGlobal("fetch", fetchMock)

    renderDialog()

    expect(await screen.findByText(/couldn.t be prepared/i)).toBeInTheDocument()
    expect(screen.queryByTestId("voucher-preview")).toBeNull()
    expect(
      screen.getByRole("button", { name: /preview & send voucher/i }),
    ).not.toBeDisabled()
  })
})
