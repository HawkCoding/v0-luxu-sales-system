"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, FileText, Info, Send } from "lucide-react"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import {
  groupIssuedDocuments,
  type IssuedDocumentGroup,
  type IssuedDocumentVersion,
} from "@/lib/documents/issued-documents"
import { useJobDocumentVersions } from "@/lib/use-data"
import { cn } from "@/lib/utils"

const SEPARATOR = "·"

/** Opens the stored copy of an issued document: the PDF the client received, not a fresh render. */
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

  if (version.legacy) {
    const when = formatDisplayDateTime(latestSend?.sentAt ?? version.issuedAt)
    const to = latestSend && latestSend.recipients.length > 0 ? ` to ${latestSend.recipients.join(", ")}` : ""
    return `Sent before copies were kept ${SEPARATOR} ${when}${to}`
  }

  if (!latestSend) return `Saved, not emailed ${SEPARATOR} ${formatDisplayDateTime(version.issuedAt)}`

  const when = formatDisplayDateTime(latestSend.sentAt ?? version.issuedAt)
  const to = latestSend.recipients.length > 0 ? ` to ${latestSend.recipients.join(", ")}` : ""
  const more = version.sends.length > 1 ? ` ${SEPARATOR} sent ${version.sends.length} times` : ""
  return `Sent ${when}${to}${more}`
}

interface VersionRowProps {
  version: IssuedDocumentVersion
  label: string
  /** Show "Version n" in the title; the latest of a single version leaves it out. */
  showVersion: boolean
  isNewest?: boolean
}

function VersionRow({ version, label, showVersion, isNewest = false }: VersionRowProps) {
  const title = [
    label,
    showVersion && !version.legacy ? `Version ${version.versionNo}` : null,
    version.quoteNumber,
  ]
    .filter(Boolean)
    .join(` ${SEPARATOR} `)

  const downloadDate = formatDisplayDate(version.sends[0]?.sentAt ?? version.issuedAt)
  const downloadLabel = `Download ${label}${showVersion ? ` version ${version.versionNo}` : ""} from ${downloadDate}`

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="truncate">{title}</span>
          {isNewest ? (
            <Badge variant="secondary" className="text-[10px]">
              Newest
            </Badge>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{sentSummary(version)}</p>
      </div>
      {version.legacy ? null : (
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => void openIssuedDocument(version.id)}
          aria-label={downloadLabel}
        >
          <Download className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

interface GroupCardProps {
  group: IssuedDocumentGroup
  bookingId: string
  /** Opens the flow that previews and sends (or saves) the updated document. */
  onReview?: (docType: IssuedDocumentType) => void
  /** Refetches the copies after a decision, so the flag and the tab count update. */
  onDecided: () => Promise<unknown> | void
}

function GroupCard({ group, bookingId, onReview, onDecided }: GroupCardProps) {
  const [showEarlier, setShowEarlier] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const earlierCount = group.earlier.length
  const hasEarlier = earlierCount > 0
  // A document sent before copies were kept was never compared with the booking, so it is neither
  // "Out of date" nor "Up to date": it gets its own neutral "Not checked" state, driven by the flag.
  const notChecked = group.latest.legacy === true
  const outOfDate = !notChecked && group.latest.contentChanged === true
  const upToDate = !notChecked && group.latest.contentChanged === false
  // "Leave as is" is recorded against a kept copy, and an entry for a document sent before copies
  // were kept has none, so it is not offered there. Sending the update replaces the entry.
  const canLeaveAsIs = !notChecked
  const lowerLabel = group.label.toLowerCase()

  async function leaveAsIs() {
    setLeaving(true)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/document-versions/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: group.latest.id }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? "Could not record that")

      toast.success(`Left as is. The ${lowerLabel} the client holds stays the current one.`)
      await onDecided()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record that")
    } finally {
      setLeaving(false)
    }
  }

  return (
    <Card className={cn(outOfDate && "border-amber-500/50")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{group.label}</p>
              {outOfDate ? (
                <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" aria-hidden />
                  Out of date
                </Badge>
              ) : null}
              {notChecked ? (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  <Info className="w-3 h-3" aria-hidden />
                  Not checked
                </Badge>
              ) : null}
              {upToDate ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5" aria-hidden />
                  Up to date
                </span>
              ) : null}
            </div>
            {outOfDate || notChecked ? (
              <div className="space-y-2">
                <p role={outOfDate ? "status" : undefined} className="text-xs text-muted-foreground">
                  {outOfDate
                    ? "The booking has changed since this was sent. The client may still have the old version."
                    : "Sent before copies were kept, so we can't tell whether it is still current. Update it to send the client the latest version, or save it without sending."}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {onReview ? (
                    <Button size="sm" className="w-full sm:w-auto" onClick={() => onReview(group.docType)}>
                      <Send data-icon="inline-start" aria-hidden />
                      Update and send {lowerLabel}
                    </Button>
                  ) : null}
                  {canLeaveAsIs ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() => void leaveAsIs()}
                      disabled={leaving}
                    >
                      {leaving ? "Saving..." : "Leave as is"}
                    </Button>
                  ) : null}
                </div>
                {outOfDate ? (
                  <p className="text-xs text-muted-foreground">
                    Not ready to send? Open it, save it without sending, or leave it as is.
                  </p>
                ) : null}
              </div>
            ) : null}
            <VersionRow version={group.latest} label={group.label} showVersion={hasEarlier} isNewest={hasEarlier} />
          </div>
        </div>

        {hasEarlier ? (
          <div className="sm:pl-11 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-2 text-xs sm:h-7"
              aria-expanded={showEarlier}
              onClick={() => setShowEarlier((open) => !open)}
            >
              {showEarlier ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden />
              )}
              {showEarlier ? "Hide earlier versions" : `Show earlier versions (${earlierCount})`}
            </Button>
            {showEarlier ? (
              <div className="space-y-3 border-l pl-3">
                {group.earlier.map((version) => (
                  <VersionRow key={version.id} version={version} label={group.label} showVersion />
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
  /** Opens the flow that previews and sends (or saves) an updated document of this type. */
  onReview?: (docType: IssuedDocumentType) => void
}

/**
 * The quote, invoice and voucher PDFs the client has been sent, newest first, with every earlier
 * version kept below. Renders nothing until a document has gone out, so a booking that has sent
 * nothing looks exactly as it did. It also renders nothing while loading or when the lookup failed;
 * the Documents tab therefore keeps listing the generated quote and invoice PDFs until a kept
 * version of that document exists, so a stored PDF is never reachable from nowhere.
 */
export function IssuedDocumentsSection({ bookingId, onReview }: IssuedDocumentsSectionProps) {
  const { data, error, mutate } = useJobDocumentVersions(bookingId)
  const groups = groupIssuedDocuments(data?.versions ?? [])

  if (error || groups.length === 0) return null

  return (
    <section className="space-y-3" aria-labelledby="issued-documents-heading">
      <div>
        <h3 id="issued-documents-heading" className="text-sm font-semibold text-foreground">
          Sent to the client
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          The quotes, invoices and vouchers this client has received. Open any version to see exactly what they were
          sent, even if the booking has changed since.
        </p>
      </div>
      {groups.map((group) => (
        <GroupCard
          key={group.docType}
          group={group}
          bookingId={bookingId}
          onReview={onReview}
          onDecided={() => mutate()}
        />
      ))}
    </section>
  )
}
