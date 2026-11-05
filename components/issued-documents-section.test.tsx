// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IssuedDocumentVersion } from "@/lib/documents/issued-documents"

const dataMocks = vi.hoisted(() => ({ useJobDocumentVersions: vi.fn() }))
vi.mock("@/lib/use-data", () => ({ useJobDocumentVersions: dataMocks.useJobDocumentVersions }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { IssuedDocumentsSection } from "./issued-documents-section"

function version(overrides: Partial<IssuedDocumentVersion> & Pick<IssuedDocumentVersion, "id" | "docType" | "versionNo">): IssuedDocumentVersion {
  return {
    fileName: "File.pdf",
    sizeBytes: 90_000,
    issuedAt: "2026-11-01T10:00:00.000Z",
    issueKind: "sent",
    quoteNumber: null,
    sends: [
      { correspondenceId: `cor-${overrides.id}`, subject: "Sent", sentAt: "2026-11-01T10:00:00.000Z", recipients: ["ada@example.test"] },
    ],
    ...overrides,
  }
}

describe("IssuedDocumentsSection", () => {
  beforeEach(() => {
    dataMocks.useJobDocumentVersions.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders nothing until a document has gone out", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({ data: { versions: [] }, error: undefined })
    const { container } = render(<IssuedDocumentsSection bookingId="b1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing while loading or when the lookup failed", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({ data: undefined, error: undefined })
    const loading = render(<IssuedDocumentsSection bookingId="b1" />)
    expect(loading.container).toBeEmptyDOMElement()
    loading.unmount()

    dataMocks.useJobDocumentVersions.mockReturnValue({ data: undefined, error: new Error("boom") })
    const failed = render(<IssuedDocumentsSection bookingId="b1" />)
    expect(failed.container).toBeEmptyDOMElement()
  })

  it("shows the latest copy per document and tucks earlier copies behind a toggle", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({
      data: {
        versions: [
          version({ id: "q1", docType: "quote", versionNo: 1, quoteNumber: "LTT-26-0039-Q1" }),
          version({ id: "q2", docType: "quote", versionNo: 2, quoteNumber: "LTT-26-0039-Q2" }),
          version({ id: "i1", docType: "invoice", versionNo: 1 }),
        ],
      },
      error: undefined,
    })

    render(<IssuedDocumentsSection bookingId="b1" />)

    expect(screen.getByText("Sent to client")).toBeTruthy()
    expect(screen.getAllByText(/Latest sent: copy/)).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Download Quote copy 2" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Download Quote copy 1" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /1 earlier copy/ }))
    expect(screen.getByRole("button", { name: "Download Quote copy 1" })).toBeTruthy()
  })

  it("opens the stored copy through a signed link when downloading", async () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({
      data: { versions: [version({ id: "i1", docType: "invoice", versionNo: 1 })] },
      error: undefined,
    })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ signedUrl: "https://signed.example/i1.pdf" }) }))
    vi.stubGlobal("fetch", fetchMock)
    const open = vi.fn()
    vi.stubGlobal("open", open)

    render(<IssuedDocumentsSection bookingId="b1" />)
    fireEvent.click(screen.getByRole("button", { name: "Download Invoice copy 1" }))

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://signed.example/i1.pdf", "_blank", "noopener,noreferrer"))
    expect(fetchMock).toHaveBeenCalledWith("/api/document-versions/i1")
  })
})
