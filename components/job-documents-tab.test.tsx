// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DocRecord, Job } from "@/lib/types"
import type { IssuedDocumentVersion } from "@/lib/documents/issued-documents"

const dataMocks = vi.hoisted(() => ({ useJobDocumentVersions: vi.fn() }))

vi.mock("next/navigation", () => ({ usePathname: () => "/app/jobs/b1", useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/lib/role-context", () => ({ useRole: () => ({ can: () => true }) }))
vi.mock("@/lib/use-data", () => ({
  useJobLegReferences: () => ({ data: undefined }),
  useJobDocumentVersions: dataMocks.useJobDocumentVersions,
}))
vi.mock("@/components/issued-documents-section", () => ({
  IssuedDocumentsSection: () => <section aria-label="issued">Sent to the client</section>,
}))
vi.mock("@/components/generate-voucher-dialog", () => ({ GenerateVoucherDialog: () => null }))

import { JobDocumentsTab } from "./job-documents-tab"

function doc(overrides: Partial<DocRecord> & Pick<DocRecord, "id" | "kind">): DocRecord {
  return {
    jobId: "b1",
    status: "generated",
    fileName: `${overrides.id}.pdf`,
    generatedAt: "2026-11-01T10:00:00.000Z",
    urlOrBlobRef: "path/file.pdf",
    ...overrides,
  }
}

const job = { id: "b1", jobNumber: "LTT-26-0001", stage: "quote_sent" } as unknown as Job

function keptVersion(
  docType: IssuedDocumentVersion["docType"],
  overrides: Partial<IssuedDocumentVersion> = {},
): IssuedDocumentVersion {
  return {
    id: `ver-${docType}`,
    docType,
    versionNo: 1,
    fileName: "File.pdf",
    sizeBytes: 90_000,
    issuedAt: "2026-11-01T10:00:00.000Z",
    issueKind: "sent",
    quoteNumber: null,
    contentChanged: null,
    sends: [],
    ...overrides,
  }
}

function legacyEntry(docType: IssuedDocumentVersion["docType"]): IssuedDocumentVersion {
  return keptVersion(docType, { id: `legacy-${docType}`, versionNo: 0, fileName: "", sizeBytes: 0, legacy: true })
}

function mockVersions(versions: IssuedDocumentVersion[]) {
  dataMocks.useJobDocumentVersions.mockReturnValue({ data: { versions }, error: undefined })
}

const quoteAndInvoiceRows = [
  doc({ id: "quote-row", kind: "quote_pdf" }),
  doc({ id: "invoice-row", kind: "invoice_pdf" }),
  doc({ id: "voucher-row", kind: "voucher_pdf" }),
  doc({ id: "itinerary-row", kind: "itinerary_pdf" }),
  doc({ id: "worksheet-row", kind: "summary_pdf" }),
]

describe("JobDocumentsTab", () => {
  beforeEach(() => {
    dataMocks.useJobDocumentVersions.mockReset()
    mockVersions([])
  })
  afterEach(() => cleanup())

  it("leaves the quote and invoice rows out of the booking records once the sent list holds a kept version of each", () => {
    mockVersions([keptVersion("quote"), keptVersion("invoice")])
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.queryByText("Quote Pdf")).toBeNull()
    expect(screen.queryByText("Invoice Pdf")).toBeNull()
    expect(screen.getByText("Voucher Pdf")).toBeTruthy()
    expect(screen.getByText("Itinerary Pdf")).toBeTruthy()
    // The worksheet card plus its earlier row.
    expect(screen.getAllByText("Booking Worksheet")).toHaveLength(2)
    expect(screen.getAllByText(/^Created /)).toHaveLength(3)
  })

  it("treats a version that was only saved as a kept version too, since it has its own download", () => {
    mockVersions([keptVersion("quote", { issueKind: "saved" })])
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.queryByText("Quote Pdf")).toBeNull()
    expect(screen.getByText("Invoice Pdf")).toBeTruthy()
  })

  it("keeps the quote and invoice rows when no version of them has been kept", () => {
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.getByText("Quote Pdf")).toBeTruthy()
    expect(screen.getByText("Invoice Pdf")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Download Quote Pdf" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Download Invoice Pdf" })).toBeTruthy()
  })

  it("keeps the rows of a document emailed before copies were kept, since its entry has no download", () => {
    mockVersions([legacyEntry("quote"), legacyEntry("invoice")])
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.getByText("Quote Pdf")).toBeTruthy()
    expect(screen.getByText("Invoice Pdf")).toBeTruthy()
  })

  it("decides each document on its own: a kept quote hides only the quote row", () => {
    mockVersions([keptVersion("quote"), legacyEntry("invoice")])
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.queryByText("Quote Pdf")).toBeNull()
    expect(screen.getByText("Invoice Pdf")).toBeTruthy()
  })

  it("keeps the rows while the versions are loading, so nothing flashes away", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({ data: undefined, error: undefined, isLoading: true })
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.getByText("Quote Pdf")).toBeTruthy()
    expect(screen.getByText("Invoice Pdf")).toBeTruthy()
  })

  it("keeps the rows when the versions could not be loaded", () => {
    dataMocks.useJobDocumentVersions.mockReturnValue({ data: undefined, error: new Error("boom") })
    render(<JobDocumentsTab job={job} documents={quoteAndInvoiceRows} />)

    expect(screen.getByText("Quote Pdf")).toBeTruthy()
    expect(screen.getByText("Invoice Pdf")).toBeTruthy()
  })

  it("asks for the versions of this booking only when there is one", () => {
    render(<JobDocumentsTab job={job} documents={[]} />)
    expect(dataMocks.useJobDocumentVersions).toHaveBeenLastCalledWith("b1")

    render(<JobDocumentsTab documents={[]} />)
    expect(dataMocks.useJobDocumentVersions).toHaveBeenLastCalledWith(undefined)
  })

  it("uses the new section names and worksheet wording", () => {
    render(<JobDocumentsTab job={job} documents={[]} />)

    expect(screen.getByRole("heading", { name: "Booking records" })).toBeTruthy()
    expect(screen.getByText("For your own use. These are not sent to the client.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Files you uploaded" })).toBeTruthy()
    expect(screen.getByLabelText("Type of file")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create worksheet" })).toBeTruthy()
    expect(screen.queryByText("Nothing else has been created for this booking yet.")).toBeNull()
  })

  it("says nothing else was created when there is no booking card to stand in for it", () => {
    render(<JobDocumentsTab documents={[]} />)
    expect(screen.getByText("Nothing else has been created for this booking yet.")).toBeTruthy()
  })

  it("shows 'Ready to send' only when the voucher applies", () => {
    const { rerender } = render(<JobDocumentsTab job={job} documents={[]} />)
    expect(screen.queryByText("Ready to send")).toBeNull()

    rerender(
      <JobDocumentsTab
        job={{ ...job, stage: "final_paid" } as unknown as Job}
        enquiry={{} as never}
        customer={{} as never}
        documents={[]}
      />,
    )
    expect(screen.getByText("Ready to send")).toBeTruthy()
    expect(
      screen.getByText("Creates the travel voucher from the current booking and lets you check the email before it goes."),
    ).toBeTruthy()
  })
})
