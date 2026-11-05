"use client"

import { useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DocRecord, DocumentKind, Enquiry, Job, Customer } from "@/lib/types"
import { AlertCircle, ClipboardList, Download, FileText, Send, Trash2, Upload } from "lucide-react"
import { GenerateVoucherDialog } from "@/components/generate-voucher-dialog"
import { IssuedDocumentsSection } from "@/components/issued-documents-section"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"
import { useJobLegReferences } from "@/lib/use-data"
import { useRole } from "@/lib/role-context"
import { formatDisplayDateTime } from "@/lib/date-format"
import { getRecordTabHref } from "@/lib/booking-visibility"
import { isUploadedDocument } from "@/lib/documents/uploaded-documents"

const VOUCHER_STAGES = new Set(["final_paid", "voucher_sent", "closed"])

const UPLOADABLE_KINDS: { value: DocumentKind; label: string }[] = [
  { value: "other", label: "Other" },
  { value: "proof_of_payment", label: "Proof of payment" },
]

function formatKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

function generatedLabel(document: DocRecord): string {
  return document.kind === "summary_pdf" ? "Booking Worksheet" : formatKind(document.kind)
}

async function downloadDocument(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/documents/${id}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      toast.error(typeof payload?.error === "string" ? payload.error : "Download failed")
      return
    }
    const data = (await response.json()) as { signedUrl?: string }
    if (data.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    }
  } catch {
    toast.error("Download failed")
  }
}

interface DocumentDownloadButtonProps {
  document: DocRecord
  label: string
}

function DocumentDownloadButton({ document, label }: DocumentDownloadButtonProps) {
  // Placeholder rows have no stored file, so there is nothing to fetch.
  if (!document.urlOrBlobRef) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void downloadDocument(document.id)
      }}
      aria-label={`Download ${label}`}
    >
      <Download className="w-4 h-4" />
    </Button>
  )
}

interface DocumentUploadFormProps {
  bookingId: string
  onChange?: () => Promise<void> | void
}

function DocumentUploadForm({ bookingId, onChange }: DocumentUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [kind, setKind] = useState<DocumentKind>("other")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleUpload = async () => {
    if (!file) {
      toast.error("Choose a file to upload")
      return
    }
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("booking_id", bookingId)
      formData.append("kind", kind)
      const response = await fetch("/api/documents/upload", { method: "POST", body: formData })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = typeof payload?.error === "string" ? payload.error : "Upload failed"
        toast.error(message)
        return
      }
      toast.success("File uploaded")
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      await onChange?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
          <div className="space-y-1">
            <Label htmlFor="attachment-file" className="text-xs">
              Upload a file
            </Label>
            <Input
              id="attachment-file"
              ref={fileInputRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="attachment-kind" className="text-xs">
              Kind
            </Label>
            <Select value={kind} onValueChange={(value) => setKind(value as DocumentKind)} disabled={submitting}>
              <SelectTrigger id="attachment-kind" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPLOADABLE_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleUpload} disabled={submitting || !file}>
            <Upload className="w-4 h-4 mr-1" />
            {submitting ? "Uploading..." : "Upload"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          PDF, JPG, PNG, WebP, DOCX, or XLSX. Default limit 10 MB.
        </p>
      </CardContent>
    </Card>
  )
}

interface JobDocumentsTabProps {
  documents: DocRecord[]
  job?: Job
  enquiry?: Enquiry
  customer?: Customer
  onChange?: () => Promise<void> | void
  /** Opens the flow for sending an updated quote or invoice (the voucher's is handled here). */
  onReviewDocument?: (docType: IssuedDocumentType) => void
  loading?: boolean
  error?: Error | null
}

export function JobDocumentsTab({
  documents,
  job,
  enquiry,
  customer,
  onChange,
  onReviewDocument,
  loading = false,
  error = null,
}: JobDocumentsTabProps) {
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [generatingWorksheet, setGeneratingWorksheet] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { can } = useRole()
  const canUpload = can("upload:documents")
  const canDelete = can("delete:documents")

  const canGenerateVoucher = job && enquiry && customer && VOUCHER_STAGES.has(job.stage ?? "")

  // Preflight so this card states the blocker up front rather than offering a Generate button that
  // opens a dialog only to report the same thing. Fetched only on the stages where it's offered.
  const { data: legReferences } = useJobLegReferences(canGenerateVoucher ? job?.id : null)
  const missingReferenceCount = (legReferences?.rows ?? []).filter(
    (row) => !row.supplierReference?.trim(),
  ).length

  const uploadedDocuments = documents.filter(isUploadedDocument)
  const generatedDocuments = documents.filter((d) => !isUploadedDocument(d))

  async function downloadWorksheet() {
    if (!job) return
    setGeneratingWorksheet(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}/worksheet`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to generate worksheet")
      if (payload.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer")
      }
      await onChange?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate worksheet")
    } finally {
      setGeneratingWorksheet(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Delete failed")
        return
      }
      toast.success("File deleted")
      await onChange?.()
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full">
                <Skeleton className="w-8 h-8 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-5 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Could not load documents</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error.message || "Something went wrong while loading documents."}</p>
          {onChange ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void onChange()
              }}
            >
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {job ? (
        <IssuedDocumentsSection
          bookingId={job.id}
          // The voucher dialog lives on this tab; the quote and invoice flows live elsewhere on the page.
          onReview={(docType) => (docType === "voucher" ? setVoucherOpen(true) : onReviewDocument?.(docType))}
        />
      ) : null}

      <div className="space-y-3">
        {job && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Booking Worksheet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Internal place-of-record: pax, invoices, payments, suppliers, gross profit
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generatingWorksheet}
                  onClick={() => {
                    void downloadWorksheet()
                  }}
                >
                  <ClipboardList data-icon="inline-start" />
                  {generatingWorksheet ? "Generating…" : "Generate Worksheet"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {canGenerateVoucher && (
          <Card className={missingReferenceCount > 0 ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Travel Voucher</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {missingReferenceCount > 0
                      ? `${missingReferenceCount} ${missingReferenceCount === 1 ? "leg is" : "legs are"} missing a supplier reference number`
                      : "Builds the voucher PDF from the latest booking details, then opens the email for review"}
                  </p>
                </div>
                {missingReferenceCount > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(getRecordTabHref(pathname, job.id, "?tab=references"))}
                  >
                    <AlertCircle data-icon="inline-start" />
                    Add reference numbers
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setVoucherOpen(true)}>
                    <Send data-icon="inline-start" aria-hidden />
                    Preview &amp; Send Voucher
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {canGenerateVoucher && (
          <GenerateVoucherDialog
            open={voucherOpen}
            onOpenChange={setVoucherOpen}
            jobId={job.id}
            bookingNumber={job.jobNumber}
            invoiceNumber={job.customerInvoiceNumber}
            onGenerated={onChange}
            onSent={async () => {
              await onChange?.()
            }}
          />
        )}
      </div>

      <section className="space-y-3" aria-labelledby="generated-documents-heading">
        <h3 id="generated-documents-heading" className="text-sm font-semibold text-foreground">
          Generated
        </h3>
        {generatedDocuments.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">No documents generated</div>
        ) : (
          generatedDocuments.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{generatedLabel(d)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Generated: {formatDisplayDateTime(d.generatedAt)}
                      {d.fileName ? ` · ${d.fileName}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    PDF
                  </Badge>
                  <DocumentDownloadButton document={d} label={generatedLabel(d)} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3" aria-labelledby="uploaded-documents-heading">
        <h3 id="uploaded-documents-heading" className="text-sm font-semibold text-foreground">
          Uploaded
        </h3>
        {job && canUpload ? <DocumentUploadForm bookingId={job.id} onChange={onChange} /> : null}
        {uploadedDocuments.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">No files uploaded yet</div>
        ) : (
          uploadedDocuments.map((d) => {
            const label = d.fileName ?? formatKind(d.kind)
            return (
              <Card key={d.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDisplayDateTime(d.generatedAt)}
                        {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      {formatKind(d.kind)}
                    </Badge>
                    <DocumentDownloadButton document={d} label={label} />
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(d.id)}
                        disabled={deletingId === d.id}
                        aria-label={`Delete ${label}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </section>
    </div>
  )
}
