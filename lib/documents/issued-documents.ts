import type { IssuedDocumentType } from "@/lib/documents/document-versions"

/**
 * What the booking page knows about the PDFs that have gone out: one entry per distinct copy, with
 * the emails that carried it. Built from `document_versions` (see lib/documents/document-versions.ts).
 */

export interface IssuedDocumentSend {
  correspondenceId: string
  subject: string
  sentAt: string | null
  recipients: string[]
}

export interface IssuedDocumentVersion {
  id: string
  docType: IssuedDocumentType
  versionNo: number
  fileName: string
  sizeBytes: number
  issuedAt: string
  issueKind: "sent" | "saved"
  /** The quote the copy was issued from; null for invoices and vouchers, or if the quote is gone. */
  quoteNumber: string | null
  /**
   * Whether the booking data this was printed from has changed since it was sent. Only worked out
   * for the latest copy of each document; null elsewhere, and null (never "changed") whenever it
   * could not be determined, e.g. a copy kept before fingerprints existed or a legacy entry.
   */
  contentChanged: boolean | null
  /** Newest first. Empty for a copy that was saved without being emailed. */
  sends: IssuedDocumentSend[]
  /**
   * True for an entry standing in for a document that was emailed before copies were kept: there is
   * no file to open (`id` is not a real version id, `fileName` is empty, `sizeBytes` is 0),
   * `versionNo` is 0 and `contentChanged` is null (nothing was ever compared). It disappears as
   * soon as a real version of that document has been emailed; a version only saved without
   * sending leaves it in place as an earlier entry.
   */
  legacy?: boolean
}

/** The GET /document-versions response. */
export interface DocumentVersionsResponse {
  versions: IssuedDocumentVersion[]
  /**
   * Document types that have been emailed to the client at some point, whether or not a copy was
   * kept. Optional so older responses (and tests) without it keep working.
   */
  emailedDocTypes?: IssuedDocumentType[]
}

/**
 * Whether this document type has been emailed before: from the response's own list when it has one,
 * otherwise from the kept copies that were emailed.
 */
export function wasDocumentEmailed(
  data: Pick<DocumentVersionsResponse, "versions" | "emailedDocTypes"> | undefined,
  docType: IssuedDocumentType | null,
): boolean {
  if (!data || !docType) return false
  if (data.emailedDocTypes?.includes(docType)) return true
  return data.versions.some((version) => version.docType === docType && version.issueKind === "sent")
}

export interface IssuedDocumentGroup {
  docType: IssuedDocumentType
  label: string
  latest: IssuedDocumentVersion
  earlier: IssuedDocumentVersion[]
}

/**
 * Which document family an email of this `kind` carries, or null when it carries none. Lives here,
 * not beside the server-side capture code, because the send dialogs (client components) need it too.
 */
export function issuedDocumentTypeForKind(kind: string | null | undefined): IssuedDocumentType | null {
  switch (kind?.toLowerCase()) {
    case "quote":
      return "quote"
    case "invoice":
    case "payment_received":
    case "payment_reminder":
      return "invoice"
    case "voucher":
      return "voucher"
    default:
      return null
  }
}

/**
 * The deposit or full invoice the client holds, which can be sent again as it is. Available whenever
 * one has been emailed (status sent or paid), not only when it is flagged as changed: an invoice
 * sent before copies were kept can never be flagged. Nothing is returned while the invoice is being
 * amended onto a revised quote, because that has its own flow.
 */
export function findResendableInvoice<T extends { kind: string; status: string }>(
  invoices: T[],
  needsAmendment: boolean,
): T | null {
  if (needsAmendment) return null
  return (
    invoices.find(
      (invoice) =>
        (invoice.kind === "deposit" || invoice.kind === "full") &&
        (invoice.status === "sent" || invoice.status === "paid"),
    ) ?? null
  )
}

const GROUP_ORDER:IssuedDocumentType[] = ["quote", "invoice", "voucher"]

const GROUP_LABELS: Record<IssuedDocumentType, string> = {
  quote: "Quote",
  invoice: "Invoice",
  voucher: "Voucher",
}

/** One group per document type that has been issued, in quote → invoice → voucher order, latest first. */
export function groupIssuedDocuments(versions: IssuedDocumentVersion[]): IssuedDocumentGroup[] {
  return GROUP_ORDER.flatMap((docType) => {
    const ofType = versions
      .filter((version) => version.docType === docType)
      .sort((a, b) => b.versionNo - a.versionNo)

    const [latest, ...earlier] = ofType
    if (!latest) return []
    return [{ docType, label: GROUP_LABELS[docType], latest, earlier }]
  })
}

/**
 * How many documents have changed since they were last sent: the badge on the Documents tab. A
 * document sent before copies were kept is never counted, because nothing was compared for it.
 */
export function countChangedDocuments(versions: IssuedDocumentVersion[]): number {
  return groupIssuedDocuments(versions).filter(
    (group) => !group.latest.legacy && group.latest.contentChanged === true,
  ).length
}

/**
 * Whether the booking has changed since the latest document of this type was sent: true or false
 * when that was worked out, undefined when it is unknown (no such document, no fingerprint to
 * compare with, or a document sent before copies were kept).
 */
export function documentChangedSinceSent(
  versions: IssuedDocumentVersion[],
  docType: IssuedDocumentType,
): boolean | undefined {
  const latest = groupIssuedDocuments(versions).find((group) => group.docType === docType)?.latest
  if (!latest || latest.legacy) return undefined
  return typeof latest.contentChanged === "boolean" ? latest.contentChanged : undefined
}

/** Whether a real kept version (one with a file to open) exists for this document type. */
export function hasKeptVersion(versions: IssuedDocumentVersion[], docType: IssuedDocumentType): boolean {
  return versions.some((version) => version.docType === docType && !version.legacy)
}

/** The copy an email carried, or null when it carried none we kept. */
export function versionForCorrespondence(
  versions: IssuedDocumentVersion[],
  correspondenceId: string,
): IssuedDocumentVersion | null {
  return versions.find((version) => !version.legacy && version.sends.some((send) => send.correspondenceId === correspondenceId)) ?? null
}

/** "1.2 MB" / "86 KB" for the history rows. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
