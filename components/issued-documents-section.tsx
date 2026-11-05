"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Download, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDisplayDateTime } from "@/lib/date-format"
import {
  formatFileSize,
  groupIssuedDocuments,
  type IssuedDocumentGroup,
  type IssuedDocumentVersion,
} from "@/lib/documents/issued-documents"
import { useJobDocumentVersions } from "@/lib/use-data"

/** Opens the stored copy of an issued document — the PDF the client received, not a fresh render. */
export async function openIssuedDocument(versionId: string): Promise<void> {
  try {
    const response = await fetch(`/api/document-versions/${versionId}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      toast.error(typeof payload?.error === "string" ? payload.error : "Download failed")
      return
    }
    const data = (await response.json()) as { signedUrl?: string }
    if (data.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  } catch {
    toast.error("Download failed")
  }
}

function sentSummary(version: IssuedDocumentVersion): string {
  const latestSend = version.sends[0]
  if (!latestSend) return `Saved ${formatDisplayDateTime(version.issuedAt)}`

  const when = formatDisplayDateTime(latestSend.sentAt ?? version.issuedAt)
  const to = latestSend.recipients.length > 0 ? ` to ${latestSend.recipients.join(", ")}` : ""
  const more = version.sends.length > 1 ? ` · sent ${version.sends.length} times` : ""
  return `Sent ${when}${to}${more}`
}

function VersionRow({ version, label }: { version: IssuedDocumentVersion; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate">
          {label} · copy {version.versionNo}
          {version.quoteNumber ? ` · ${version.quoteNumber}` : ""}
          <span className="text-xs text-muted-foreground"> · {formatFileSize(version.sizeBytes)}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{sentSummary(version)}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void openIssuedDocument(version.id)}
        aria-label={`Download ${label} copy ${version.versionNo}`}
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  )
}

function GroupCard({ group }: { group: IssuedDocumentGroup }) {
  const [showEarlier, setShowEarlier] = useState(false)
  const earlierCount = group.earlier.length

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{group.label}</p>
              <Badge variant="secondary" className="text-[10px]">
                Latest sent: copy {group.latest.versionNo}
              </Badge>
            </div>
            <VersionRow version={group.latest} label={group.label} />
          </div>
        </div>

        {earlierCount > 0 ? (
          <div className="pl-11 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-expanded={showEarlier}
              onClick={() => setShowEarlier((open) => !open)}
            >
              {showEarlier ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden />
              )}
              {earlierCount === 1 ? "1 earlier copy" : `${earlierCount} earlier copies`}
            </Button>
            {showEarlier ? (
              <div className="space-y-3 border-l pl-3">
                {group.earlier.map((version) => (
                  <VersionRow key={version.id} version={version} label={group.label} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface IssuedDocumentsSectionProps {
  bookingId: string
}

/**
 * The quote, invoice and voucher PDFs that have actually been emailed to the client, newest first,
 * with every earlier copy kept below. Renders nothing until a document has gone out, so a booking
 * that has sent nothing looks exactly as it did.
 */
export function IssuedDocumentsSection({ bookingId }: IssuedDocumentsSectionProps) {
  const { data, error } = useJobDocumentVersions(bookingId)
  const groups = groupIssuedDocuments(data?.versions ?? [])

  if (error || groups.length === 0) return null

  return (
    <section className="space-y-3" aria-labelledby="issued-documents-heading">
      <div>
        <h3 id="issued-documents-heading" className="text-sm font-semibold text-foreground">
          Sent to client
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          The exact PDFs that were emailed. Open one to see what the client received, even if the booking has changed
          since.
        </p>
      </div>
      {groups.map((group) => (
        <GroupCard key={group.docType} group={group} />
      ))}
    </section>
  )
}
