"use client"

import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

export type PdfPreviewType = "voucher" | "itinerary" | "quote" | "invoice"

const LABELS: Record<PdfPreviewType, string> = {
  voucher: "Voucher",
  itinerary: "Itinerary",
  quote: "Quote",
  invoice: "Invoice",
}

const ALL_TYPES: PdfPreviewType[] = ["voucher", "itinerary", "quote", "invoice"]

interface PdfPreviewButtonsProps {
  /** Which document types to offer; defaults to all four. */
  types?: PdfPreviewType[]
}

/**
 * Opens /api/pdf-preview/[type] in a new tab — renders the PDF with sample
 * booking data and the current template/document-text settings.
 */
export function PdfPreviewButtons({ types = ALL_TYPES }: PdfPreviewButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {types.map((type) => (
        <Button
          key={type}
          variant="outline"
          size="sm"
          onClick={() => window.open(`/api/pdf-preview/${type}`, "_blank", "noopener")}
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Preview {LABELS[type]} PDF
        </Button>
      ))}
    </div>
  )
}
