"use client"

import { useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useRole } from "@/lib/role-context"
import type { DocRecord, DocumentKind } from "@/lib/types"
import { formatDisplayDateTime } from "@/lib/date-format"
import { AlertCircle, Download, FileText, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

const UPLOADABLE_KINDS: { value: DocumentKind; label: string }[] = [
  { value: "other", label: "Other" },
  { value: "proof_of_payment", label: "Proof of payment" },
  { value: "summary_pdf", label: "Summary PDF" },
  { value: "invoice_pdf", label: "Invoice PDF" },
  { value: "quote_pdf", label: "Quote PDF" },
  { value: "voucher_pdf", label: "Voucher PDF" },
]

function formatKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

interface JobAttachmentsTabProps {
  bookingId: string
  documents: DocRecord[]
  loading?: boolean
  error?: Error | null
  onChange?: () => Promise<void> | void
}

export function JobAttachmentsTab({
  bookingId,
  documents,
  loading = false,
  error = null,
  onChange,
}: JobAttachmentsTabProps) {
  const { can } = useRole()
  const canUpload = can("upload:documents")
  const canDelete = can("delete:documents")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [kind, setKind] = useState<DocumentKind>("other")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const handleDownload = async (id: string) => {
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

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Delete failed")
        return
      }
      toast.success("Attachment deleted")
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
            <CardContent className="p-4">
              <Skeleton className="h-5 w-1/2 mb-2" />
              <Skeleton className="h-3 w-1/3" />
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
        <AlertTitle>Could not load attachments</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error.message || "Something went wrong while loading attachments."}</p>
          {onChange ? (
            <Button variant="outline" size="sm" onClick={() => void onChange()}>
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {canUpload ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
              <div className="space-y-1">
                <Label htmlFor="attachment-file" className="text-xs">
                  Add an attachment
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
                  <SelectTrigger id="attachment-kind" className="w-44">
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
      ) : null}

      {documents.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No attachments yet</div>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {d.fileName ?? formatKind(d.kind)}
                    </p>
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
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(d.id)} aria-label="Download">
                    <Download className="w-4 h-4" />
                  </Button>
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(d.id)}
                      disabled={deletingId === d.id}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
