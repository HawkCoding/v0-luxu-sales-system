// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IssuedDocumentVersion } from "@/lib/documents/issued-documents"

const dataMocks = vi.hoisted(() => ({ useJobDocumentVersions: vi.fn() }))
vi.mock("@/lib/use-data", () => ({ useJobDocumentVersions: dataMocks.useJobDocumentVersions }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { IssuedDocumentsSection } from "./issued-documents-section"

function version(overrides: Partial<IssuedDocumentVersion> & Pick<IssuedDocumentVersion, "id" | "docType" | "versionNo">): IssuedDocumentVersion {
  return {
    fileName: "File.pdf",
    sizeBytes: 90_000,
    issuedAt: "2026-11-01T10:00:00.000Z",
    issueKind: "sent",
    quoteNumber: null,
    contentChanged: null,
    sends: [
      { correspondenceId: `cor-${overrides.id}`, subject: "Sent", sentAt: "2026-11-01T10:00:00.000Z", recipients: ["ada@example.test"] },
    ],
    ...overrides,
  }
}

function legacyVersion(docType: IssuedDocumentVersion["docType"]): IssuedDocumentVersion {
  return {
    id: `legacy-${docType}`,
    docType,
    versionNo: 0,
    fileName: "",
    sizeBytes: 0,
    issuedAt: "2026-09-01T08:00:00.000Z",
    issueKind: "sent",
    quoteNumber: null,
    // Nothing was ever compared for a document sent before copies were kept.
    contentChanged: null,
    legacy: true,
    sends: [
      { correspondenceId: "cor-old", subject: "Your quote", sentAt: "2026-09-01T08:00:00.000Z", recipients: ["ada@example.test"] },
    ],
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

  it("shows the newest version per document and tucks earlier versions behind a toggle", () => {
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

    expect(screen.getByText("Sent to the client")).toBeTruthy()
    expect(screen.queryByText(/Latest: copy/)).toBeNull()
    // Only the quote has earlier versions, so only it says "Version n" and "Newest".
    expect(screen.getAllByText("Newest")).toHaveLength(1)
    expect(screen.getByText(/Quote . Version 2 . LTT-26-0039-Q2/)).toBeTruthy()
    expect(screen.queryByText(/Version 1/)).toBeNull()
    expect(screen.getByRole("button", { name: /^Download Quote version 2 from / })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Download Quote version 1/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Show earlier versions (1)" }))
    expect(screen.getByRole("button", { name: /^Download Quote version 1 from / })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Hide earlier versions" })).toBeTruthy()
  })

  it("does not show the file size or the old 'copy' wording", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({
      data: { versions: [version({ id: "i1", docType: "invoice", versionNo: 1 })] },
      error: undefined,
    })
    render(<IssuedDocumentsSection bookingId="b1" />)

    expect(screen.queryByText(/KB|MB/)).toBeNull()
    expect(screen.queryByText(/copy/i)).toBeNull()
    expect(screen.queryByText("Newest")).toBeNull()
  })

  it("says a version that was saved but never emailed is not emailed", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({
      data: { versions: [version({ id: "i1", docType: "invoice", versionNo: 1, issueKind: "saved", sends: [] })] },
      error: undefined,
    })
    render(<IssuedDocumentsSection bookingId="b1" />)
    expect(screen.getByText(/Saved, not emailed/)).toBeTruthy()
  })

  it("flags a latest version the booking has moved on from, shows a quiet 'Up to date' for a current one, and neither for unknown", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({
      data: {
        versions: [
          version({ id: "q1", docType: "quote", versionNo: 1, contentChanged: true }),
          version({ id: "i1", docType: "invoice", versionNo: 1, contentChanged: false }),
          version({ id: "v1", docType: "voucher", versionNo: 1, contentChanged: null }),
        ],
      },
      error: undefined,
    })

    render(<IssuedDocumentsSection bookingId="b1" />)

    expect(screen.getAllByText("Out of date")).toHaveLength(1)
    expect(screen.getAllByText("Up to date")).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(
      "The booking has changed since this was sent. The client may still have the old version.",
    )
    expect(screen.getByText("Not ready to send? Open it, save it without sending, or leave it as is.")).toBeTruthy()
  })

  describe("when the booking has changed since a document was sent", () => {
    function mockChanged(docType: "quote" | "invoice" | "voucher") {
      const mutate = vi.fn(async () => undefined)
      dataMocks.useJobDocumentVersions.mockReturnValue({
        data: { versions: [version({ id: "latest-1", docType, versionNo: 2, contentChanged: true })] },
        error: undefined,
        mutate,
      })
      return mutate
    }

    it("offers to update and send, handing the document type to the page", () => {
      mockChanged("invoice")
      const onReview = vi.fn()
      render(<IssuedDocumentsSection bookingId="b1" onReview={onReview} />)

      fireEvent.click(screen.getByRole("button", { name: /Update and send invoice/ }))
      expect(onReview).toHaveBeenCalledWith("invoice")
    })

    it("offers nothing to update for a document that has not changed", () => {
      dataMocks.useJobDocumentVersions.mockReturnValue({
        data: { versions: [version({ id: "v1", docType: "quote", versionNo: 1, contentChanged: false })] },
        error: undefined,
      })
      render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)

      expect(screen.queryByRole("button", { name: /Update and send/ })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Leave as is" })).not.toBeInTheDocument()
    })

    it("records 'Leave as is' against the newest version and refreshes the list", async () => {
      const mutate = mockChanged("quote")
      const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
      vi.stubGlobal("fetch", fetchMock)

      render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)
      fireEvent.click(screen.getByRole("button", { name: "Leave as is" }))

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }]
      expect(url).toBe("/api/jobs/b1/document-versions/acknowledge")
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body)).toEqual({ versionId: "latest-1" })
    })

    it("does not refresh, and says why, when 'Leave as is' fails", async () => {
      const mutate = mockChanged("voucher")
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, json: async () => ({ error: "Document not found" }) })),
      )

      render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)
      fireEvent.click(screen.getByRole("button", { name: "Leave as is" }))

      await waitFor(() => expect(screen.getByRole("button", { name: "Leave as is" })).toBeEnabled())
      expect(mutate).not.toHaveBeenCalled()
    })
  })

  describe("a document sent before copies were kept", () => {
    function mockLegacy() {
      dataMocks.useJobDocumentVersions.mockReturnValue({
        data: { versions: [legacyVersion("quote")], emailedDocTypes: ["quote"] },
        error: undefined,
        mutate: vi.fn(),
      })
    }

    it("is listed with its send date and recipients, and no download", () => {
      mockLegacy()
      render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)

      expect(screen.getByText(/^Sent before copies were kept . /)).toHaveTextContent("ada@example.test")
      expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
    })

    it("is marked 'Not checked' in a neutral way, never as out of date or up to date", () => {
      mockLegacy()
      const { container } = render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)

      expect(screen.getByText("Not checked")).toBeTruthy()
      expect(screen.queryByText("Out of date")).toBeNull()
      expect(screen.queryByText("Up to date")).toBeNull()
      expect(screen.queryByText(/The booking has changed since this was sent/)).toBeNull()
      expect(screen.queryByRole("status")).toBeNull()
      expect(container.querySelector('[data-slot="card"]')?.className).not.toContain("amber")
      expect(
        screen.getByText(
          "Sent before copies were kept, so we can't tell whether it is still current. Update it to send the client the latest version, or save it without sending.",
        ),
      ).toBeTruthy()
    })

    it("still offers the update path", () => {
      mockLegacy()
      const onReview = vi.fn()
      render(<IssuedDocumentsSection bookingId="b1" onReview={onReview} />)

      fireEvent.click(screen.getByRole("button", { name: "Update and send quote" }))
      expect(onReview).toHaveBeenCalledWith("quote")
    })

    it("does not offer 'Leave as is', which would need a kept copy to record against", () => {
      mockLegacy()
      render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)

      expect(screen.queryByRole("button", { name: "Leave as is" })).toBeNull()
      expect(screen.queryByText(/or leave it as is/)).toBeNull()
    })

    it("keeps the entry as an earlier one, under the saved version, when the update was only saved", () => {
      dataMocks.useJobDocumentVersions.mockReturnValue({
        data: {
          versions: [
            version({ id: "q1", docType: "quote", versionNo: 1, issueKind: "saved", sends: [], contentChanged: false }),
            legacyVersion("quote"),
          ],
          emailedDocTypes: ["quote"],
        },
        error: undefined,
        mutate: vi.fn(),
      })
      render(<IssuedDocumentsSection bookingId="b1" onReview={vi.fn()} />)

      // The saved version is the newest and is up to date; the old email is not "Not checked" any more.
      expect(screen.getByText(/Saved, not emailed/)).toBeTruthy()
      expect(screen.getByText("Up to date")).toBeTruthy()
      expect(screen.queryByText("Not checked")).toBeNull()
      expect(screen.getByRole("button", { name: /^Download Quote version 1 from / })).toBeTruthy()

      fireEvent.click(screen.getByRole("button", { name: "Show earlier versions (1)" }))
      expect(screen.getByText(/^Sent before copies were kept . /)).toHaveTextContent("ada@example.test")
      // Only the saved version can be downloaded; the old entry has no file.
      expect(screen.getAllByRole("button", { name: /^Download/ })).toHaveLength(1)
    })
  })

  it("opens the stored version through a signed link when downloading", async () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({
      data: { versions: [version({ id: "i1", docType: "invoice", versionNo: 1 })] },
      error: undefined,
    })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ signedUrl: "https://signed.example/i1.pdf" }) }))
    vi.stubGlobal("fetch", fetchMock)
    const open = vi.fn()
    vi.stubGlobal("open", open)

    render(<IssuedDocumentsSection bookingId="b1" />)
    fireEvent.click(screen.getByRole("button", { name: /^Download Invoice from / }))

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://signed.example/i1.pdf", "_blank", "noopener,noreferrer"))
    expect(fetchMock).toHaveBeenCalledWith("/api/document-versions/i1")
  })
})
