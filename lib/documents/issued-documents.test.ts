import { describe, expect, it } from "vitest"
import {
  countChangedDocuments,
  formatFileSize,
  groupIssuedDocuments,
  versionForCorrespondence,
  type IssuedDocumentVersion,
} from "./issued-documents"

function version(overrides: Partial<IssuedDocumentVersion> & Pick<IssuedDocumentVersion, "id" | "docType" | "versionNo">): IssuedDocumentVersion {
  return {
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

describe("groupIssuedDocuments", () => {
  it("returns nothing when nothing has been issued", () => {
    expect(groupIssuedDocuments([])).toEqual([])
  })

  it("groups by type in quote, invoice, voucher order with the highest copy as latest", () => {
    const groups = groupIssuedDocuments([
      version({ id: "v1", docType: "voucher", versionNo: 1 }),
      version({ id: "q1", docType: "quote", versionNo: 1 }),
      version({ id: "i2", docType: "invoice", versionNo: 2 }),
      version({ id: "q3", docType: "quote", versionNo: 3 }),
      version({ id: "i1", docType: "invoice", versionNo: 1 }),
      version({ id: "q2", docType: "quote", versionNo: 2 }),
    ])

    expect(groups.map((group) => group.docType)).toEqual(["quote", "invoice", "voucher"])
    expect(groups[0].latest.id).toBe("q3")
    expect(groups[0].earlier.map((v) => v.id)).toEqual(["q2", "q1"])
    expect(groups[1].latest.id).toBe("i2")
    expect(groups[2].earlier).toEqual([])
  })

  it("leaves out a document type that was never issued", () => {
    const groups = groupIssuedDocuments([version({ id: "i1", docType: "invoice", versionNo: 1 })])
    expect(groups.map((group) => group.label)).toEqual(["Invoice"])
  })
})

describe("countChangedDocuments", () => {
  it("counts documents whose latest copy has changed, ignoring unknown and earlier copies", () => {
    expect(
      countChangedDocuments([
        version({ id: "q1", docType: "quote", versionNo: 1, contentChanged: true }),
        version({ id: "q2", docType: "quote", versionNo: 2, contentChanged: false }),
        version({ id: "i1", docType: "invoice", versionNo: 1, contentChanged: true }),
        version({ id: "v1", docType: "voucher", versionNo: 1, contentChanged: null }),
      ]),
    ).toBe(1)
  })
})

describe("versionForCorrespondence", () => {
  it("finds the copy an email carried and ignores emails that carried none", () => {
    const versions = [
      version({
        id: "i1",
        docType: "invoice",
        versionNo: 1,
        sends: [{ correspondenceId: "cor-1", subject: "Invoice", sentAt: null, recipients: [] }],
      }),
      version({ id: "q1", docType: "quote", versionNo: 1 }),
    ]
    expect(versionForCorrespondence(versions, "cor-1")?.id).toBe("i1")
    expect(versionForCorrespondence(versions, "cor-2")).toBeNull()
  })
})

describe("formatFileSize", () => {
  it("shows KB below a megabyte and MB above, never 0 KB", () => {
    expect(formatFileSize(10)).toBe("1 KB")
    expect(formatFileSize(86_000)).toBe("84 KB")
    expect(formatFileSize(1_572_864)).toBe("1.5 MB")
  })
})
