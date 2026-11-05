// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IssuedDocumentVersion } from "@/lib/documents/issued-documents"

const dataMocks = vi.hoisted(() => ({ useJobDocumentVersions: vi.fn(), mutate: vi.fn() }))
vi.mock("@/lib/use-data", () => ({ useJobDocumentVersions: dataMocks.useJobDocumentVersions }))
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: toastMocks.success, error: toastMocks.error } }))

import { SaveWithoutSendingButton } from "./save-without-sending-button"

function version(docType: IssuedDocumentVersion["docType"], issueKind: IssuedDocumentVersion["issueKind"] = "sent"): IssuedDocumentVersion {
  return {
    id: `v-${docType}-${issueKind}`,
    docType,
    versionNo: 1,
    fileName: "File.pdf",
    sizeBytes: 1000,
    issuedAt: "2026-11-01T10:00:00.000Z",
    issueKind,
    quoteNumber: null,
    contentChanged: null,
    sends: [],
  }
}

const attachments = [{ filename: "Invoice-1.pdf", contentBase64: "JVBERg==", contentType: "application/pdf" }]

function mockVersions(versions: IssuedDocumentVersion[], emailedDocTypes?: IssuedDocumentVersion["docType"][]) {
  dataMocks.useJobDocumentVersions.mockReturnValue({ data: { versions, emailedDocTypes }, mutate: dataMocks.mutate })
}

describe("SaveWithoutSendingButton", () => {
  beforeEach(() => {
    dataMocks.useJobDocumentVersions.mockReset()
    dataMocks.mutate.mockReset()
    dataMocks.mutate.mockResolvedValue(undefined)
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("is hidden for the first send of a document: that one has to be emailed", () => {
    mockVersions([])
    const { container } = render(
      <SaveWithoutSendingButton bookingId="b1" kind="invoice" attachments={attachments} onSaved={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("is hidden when only a different document type has been sent", () => {
    mockVersions([version("quote")])
    const { container } = render(
      <SaveWithoutSendingButton bookingId="b1" kind="invoice" attachments={attachments} onSaved={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("does not count a copy that was only saved as having been emailed", () => {
    mockVersions([version("invoice", "saved")])
    const { container } = render(
      <SaveWithoutSendingButton bookingId="b1" kind="invoice" attachments={attachments} onSaved={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("appears when the document was emailed before copies were kept, with a note that nothing is emailed", () => {
    mockVersions([], ["invoice"])
    const onEmailedBeforeChange = vi.fn()
    render(
      <SaveWithoutSendingButton
        bookingId="b1"
        kind="invoice"
        attachments={attachments}
        onSaved={vi.fn()}
        onEmailedBeforeChange={onEmailedBeforeChange}
      />,
    )

    expect(screen.getByRole("button", { name: "Save without sending" })).toBeEnabled()
    expect(screen.getByText("Keeps this version on the booking. The client is not emailed.")).toBeTruthy()
    expect(onEmailedBeforeChange).toHaveBeenLastCalledWith(true)
  })

  it("stays hidden, with no note, when only a different document type was emailed before", () => {
    mockVersions([], ["quote"])
    const { container } = render(
      <SaveWithoutSendingButton bookingId="b1" kind="invoice" attachments={attachments} onSaved={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("is hidden for email kinds that carry no saveable document", () => {
    mockVersions([version("invoice")])
    for (const kind of ["payment_reminder", "reservation_received"]) {
      const { container, unmount } = render(
        <SaveWithoutSendingButton bookingId="b1" kind={kind} attachments={attachments} onSaved={vi.fn()} />,
      )
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it("posts the prepared document and closes the dialog once it has been emailed before", async () => {
    mockVersions([version("invoice")])
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ versionId: "ver-new" }) }))
    vi.stubGlobal("fetch", fetchMock)
    const onSaved = vi.fn()

    render(<SaveWithoutSendingButton bookingId="b1" kind="payment_received" attachments={attachments} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole("button", { name: "Save without sending" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/b1/document-versions",
      expect.objectContaining({ method: "POST" }),
    )
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body).toMatchObject({ kind: "payment_received", attachments })
    expect(dataMocks.mutate).toHaveBeenCalled()
    expect(toastMocks.success).toHaveBeenCalledWith(expect.stringContaining("Nothing was emailed"))
  })

  it("lets a quote be saved without sending its own PDF, because the server renders it", async () => {
    mockVersions([version("quote")])
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ versionId: "ver-new" }) }))
    vi.stubGlobal("fetch", fetchMock)

    render(<SaveWithoutSendingButton bookingId="b1" kind="quote" quoteId="q1" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Save without sending" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body).toMatchObject({ kind: "quote", quoteId: "q1" })
  })

  it("stays open and says why when the server refuses", async () => {
    mockVersions([version("invoice")])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "A copy of the document could not be kept" }) })),
    )
    const onSaved = vi.fn()

    render(<SaveWithoutSendingButton bookingId="b1" kind="invoice" attachments={attachments} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole("button", { name: "Save without sending" }))

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("A copy of the document could not be kept"))
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Save without sending" })).toBeEnabled()
  })

  it("can be disabled by the dialog while it is busy", () => {
    mockVersions([version("invoice")])
    render(<SaveWithoutSendingButton bookingId="b1" kind="invoice" attachments={attachments} disabled onSaved={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Save without sending" })).toBeDisabled()
  })
})
