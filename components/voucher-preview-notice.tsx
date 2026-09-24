"use client"

import { ExternalLink, FileText, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export interface VoucherReadinessWarning {
  code: string
  message: string
  fixHint: string
}

export interface VoucherPdf {
  filename: string
  contentBase64: string
  contentType?: string
}

interface VoucherPreviewNoticeProps {
  warnings: VoucherReadinessWarning[]
  pdf: VoucherPdf | null
}

/** Opens the freshly generated voucher PDF in a new tab so it can be read before sending. */
function openPdf(pdf: VoucherPdf) {
  try {
    const bytes = Uint8Array.from(atob(pdf.contentBase64), (char) => char.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: pdf.contentType ?? "application/pdf" }))
    window.open(url, "_blank", "noopener,noreferrer")
    // The new tab has loaded the blob by then; release it rather than holding the PDF in memory.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    toast.error("The voucher PDF could not be opened")
  }
}

/**
 * Sits at the top of the voucher's preview-and-send dialog: the missing-detail warnings from
 * generation (so they are read before the email goes, not hidden behind the preview) and a way to
 * read the PDF that was just rebuilt from the latest booking details.
 */
export function VoucherPreviewNotice({ warnings, pdf }: VoucherPreviewNoticeProps) {
  return (
    <div className="flex flex-col gap-3">
      {warnings.length > 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400 dark:[&>svg]:text-amber-500">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>This voucher is missing some details</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-400">
            <ul className="list-disc space-y-1 pl-4">
              {warnings.map((warning) => (
                <li key={warning.code}>
                  {warning.message} <span className="text-amber-700/80 dark:text-amber-400/80">{warning.fixHint}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2">Fix them on the booking and preview again to rebuild the PDF, or send it as it is.</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {pdf ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4 shrink-0" aria-hidden />
            <span>Voucher PDF rebuilt from the latest booking details.</span>
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openPdf(pdf)}
            aria-label="View voucher PDF (opens in a new tab)"
          >
            <ExternalLink data-icon="inline-start" aria-hidden />
            View PDF
          </Button>
        </div>
      ) : null}
    </div>
  )
}
