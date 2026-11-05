import { describe, expect, it } from "vitest"
import {
  countChangedDocuments,
  documentChangedSinceSent,
  findResendableInvoice,
  formatFileSize,
  groupIssuedDocuments,
  hasKeptVersion,
  versionForCorrespondence,
  wasDocumentEmailed,
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

describe("documents sent before copies were kept", () => {
  const legacy = version({
    id: "legacy-quote",
    docType: "quote",
    versionNo: 0,
    legacy: true,
    contentChanged: null,
    sends: [{ correspondenceId: "cor-old", subject: "Quote", sentAt: null, recipients: [] }],
  })

  it("is not counted as changed on the tab badge, since nothing was compared", () => {
    expect(countChangedDocuments([legacy])).toBe(0)
    expect(
      countChangedDocuments([legacy, version({ id: "i1", docType: "invoice", versionNo: 1, contentChanged: true })]),
    ).toBe(1)
  })

  it("is never counted as changed even if a stray true is attached to it", () => {
    expect(countChangedDocuments([{ ...legacy, contentChanged: true }])).toBe(0)
  })

  it("has no file, so an email is never matched to it for a download", () => {
    expect(versionForCorrespondence([legacy], "cor-old")).toBeNull()
  })

  it("sorts below a version that was only saved, which is then the latest", () => {
    const saved = version({ id: "q1", docType: "quote", versionNo: 1, issueKind: "saved", contentChanged: false })
    const [group] = groupIssuedDocuments([legacy, saved])
    expect(group.latest.id).toBe("q1")
    expect(group.earlier.map((v) => v.id)).toEqual(["legacy-quote"])
  })

  it("leaves the changed-since-sent answer unknown for the quote page", () => {
    expect(documentChangedSinceSent([legacy], "quote")).toBeUndefined()
    expect(documentChangedSinceSent([{ ...legacy, contentChanged: true }], "quote")).toBeUndefined()
  })
})

describe("documentChangedSinceSent", () => {
  it("passes on a determined answer for the latest version and leaves an unknown one undefined", () => {
    const versions = [
      version({ id: "q1", docType: "quote", versionNo: 1, contentChanged: true }),
      version({ id: "q2", docType: "quote", versionNo: 2, contentChanged: false }),
      version({ id: "i1", docType: "invoice", versionNo: 1, contentChanged: true }),
      version({ id: "v1", docType: "voucher", versionNo: 1, contentChanged: null }),
    ]
    expect(documentChangedSinceSent(versions, "quote")).toBe(false)
    expect(documentChangedSinceSent(versions, "invoice")).toBe(true)
    expect(documentChangedSinceSent(versions, "voucher")).toBeUndefined()
    expect(documentChangedSinceSent([], "quote")).toBeUndefined()
  })
})

describe("hasKeptVersion", () => {
  const legacy = version({ id: "legacy-invoice", docType: "invoice", versionNo: 0, legacy: true })

  it("is true for a real version, whether it was emailed or only saved", () => {
    expect(hasKeptVersion([version({ id: "i1", docType: "invoice", versionNo: 1 })], "invoice")).toBe(true)
    expect(hasKeptVersion([version({ id: "i1", docType: "invoice", versionNo: 1, issueKind: "saved" })], "invoice")).toBe(
      true,
    )
  })

  it("is false for a stand-in entry, another document type, or nothing", () => {
    expect(hasKeptVersion([legacy], "invoice")).toBe(false)
    expect(hasKeptVersion([version({ id: "q1", docType: "quote", versionNo: 1 })], "invoice")).toBe(false)
    expect(hasKeptVersion([], "invoice")).toBe(false)
  })
})

describe("wasDocumentEmailed", () => {
  it("uses the response's own list when it has one, even with no kept copy", () => {
    expect(wasDocumentEmailed({ versions: [], emailedDocTypes: ["invoice"] }, "invoice")).toBe(true)
    expect(wasDocumentEmailed({ versions: [], emailedDocTypes: ["invoice"] }, "quote")).toBe(false)
  })

  it("falls back to kept copies that were emailed, and ignores ones only saved", () => {
    expect(wasDocumentEmailed({ versions: [version({ id: "i1", docType: "invoice", versionNo: 1 })] }, "invoice")).toBe(true)
    expect(
      wasDocumentEmailed({ versions: [version({ id: "i1", docType: "invoice", versionNo: 1, issueKind: "saved" })] }, "invoice"),
    ).toBe(false)
    expect(wasDocumentEmailed(undefined, "invoice")).toBe(false)
    expect(wasDocumentEmailed({ versions: [] }, null)).toBe(false)
  })
})

describe("findResendableInvoice", () => {
  const sent = { kind: "deposit", status: "sent" }

  it("is available for a sent or paid deposit or full invoice, with no changed flag needed", () => {
    expect(findResendableInvoice([sent], false)).toBe(sent)
    const paid = { kind: "full", status: "paid" }
    expect(findResendableInvoice([{ kind: "deposit", status: "draft" }, paid], false)).toBe(paid)
  })

  it("is not available for a draft or void invoice, or while the invoice is being amended", () => {
    expect(findResendableInvoice([{ kind: "deposit", status: "draft" }, { kind: "full", status: "void" }], false)).toBeNull()
    expect(findResendableInvoice([sent], true)).toBeNull()
    expect(findResendableInvoice([], false)).toBeNull()
  })
})

describe("formatFileSize", () => {
  it("shows KB below a megabyte and MB above, never 0 KB", () => {
    expect(formatFileSize(10)).toBe("1 KB")
    expect(formatFileSize(86_000)).toBe("84 KB")
    expect(formatFileSize(1_572_864)).toBe("1.5 MB")
  })
})
