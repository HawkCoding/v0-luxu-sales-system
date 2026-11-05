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
   * could not be determined, e.g. a copy kept before fingerprints existed.
   */
  contentChanged: boolean | null
  /** Newest first. Empty for a copy that was saved without being emailed. */
  sends: IssuedDocumentSend[]
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

const GROUP_ORDER: IssuedDocumentType[] = ["quote", "invoice", "voucher"]

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

/** How many documents have changed since they were last sent: the badge on the Documents tab. */
export function countChangedDocuments(versions: IssuedDocumentVersion[]): number {
  return groupIssuedDocuments(versions).filter((group) => group.latest.contentChanged === true).length
}

/** The copy an email carried, or null when it carried none we kept. */
export function versionForCorrespondence(
  versions: IssuedDocumentVersion[],
  correspondenceId: string,
): IssuedDocumentVersion | null {
  return versions.find((version) => version.sends.some((send) => send.correspondenceId === correspondenceId)) ?? null
}

/** "1.2 MB" / "86 KB" for the history rows. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
