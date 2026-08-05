"use client"

import { useState } from "react"
import { FileOutput, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { DocRecord } from "@/lib/types"
import { SendVoucherButton } from "@/components/send-voucher-button"

interface VoucherReadinessWarning {
  code: string
  message: string
  fixHint: string
}

interface GenerateVoucherDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  jobId: string
  bookingNumber: string
  invoiceNumber?: string | null
  disabled?: boolean
  onSent: () => Promise<void> | void
  onGenerated?: () => Promise<void> | void
}

interface GenerateVoucherResponse {
  document: DocRecord & {
    storagePath?: string | null
  }
  voucherRecord?: {
    id: string
    voucherNumber: string
    generatedAt: string | null
    sentAt: string | null
    serviceBlockCount: number
  }
  voucher: {
    filename: string
    contentType: string
    contentBase64: string
    dataUrl: string
  }
  readinessWarnings?: VoucherReadinessWarning[]
  error?: string
}

export function GenerateVoucherDialog({
  open,
  onOpenChange,
  trigger = true,
  jobId,
  bookingNumber,
  invoiceNumber,
  disabled,
  onSent,
  onGenerated,
}: GenerateVoucherDialogProps) {
  const displayNumber = invoiceNumber || bookingNumber
  const [internalOpen, setInternalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GenerateVoucherResponse | null>(null)
  const dialogOpen = open ?? internalOpen
  const setDialogOpen = onOpenChange ?? setInternalOpen

  async function generateVoucher() {
    setGenerating(true)
    try {
      const response = await fetch("/api/voucher/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      const payload = (await response.json().catch(() => ({}))) as GenerateVoucherResponse
      if (!response.ok) {
        toast.error(payload.error ?? "Voucher could not be generated")
        return
      }
      setGenerated(payload)
      await onGenerated?.()
      toast.success("Voucher PDF generated")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSent() {
    await onSent()
    setGenerated(null)
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={(nextOpen) => !generating && setDialogOpen(nextOpen)}>
      {trigger ? (
        <DialogTrigger asChild>
          <Button size="sm" disabled={disabled}>
            <FileOutput data-icon="inline-start" />
            Generate Voucher
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Generate travel voucher</DialogTitle>
          <DialogDescription>
            The voucher email for {displayNumber} carries both the travel voucher and the client
            itinerary — the itinerary is generated automatically if it doesn't exist yet.
          </DialogDescription>
        </DialogHeader>

        {generated?.readinessWarnings && generated.readinessWarnings.length > 0 ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600">
            <TriangleAlert className="size-4" />
            <AlertTitle>This voucher is missing some details</AlertTitle>
            <AlertDescription className="text-amber-800">
              <ul className="list-disc space-y-1 pl-4">
                {generated.readinessWarnings.map((warning) => (
                  <li key={warning.code}>
                    {warning.message} <span className="text-amber-700/80">{warning.fixHint}</span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="min-h-[420px] overflow-hidden rounded-md border bg-muted">
          {generated ? (
            <iframe
              className="h-[60vh] min-h-[420px] w-full bg-white"
              src={generated.voucher.dataUrl}
              title="Voucher PDF preview"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Generate to preview the voucher PDF before sending.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generating}>
            Close
          </Button>
          <Button onClick={generateVoucher} disabled={generating || disabled}>
            {generating ? "Generating…" : generated ? "Regenerate PDF" : "Generate PDF"}
          </Button>
          <SendVoucherButton
            voucherId={generated?.voucherRecord?.id ?? null}
            bookingNumber={bookingNumber}
            invoiceNumber={invoiceNumber}
            disabled={generating}
            onSent={async () => {
              setDialogOpen(false)
              await handleSent()
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
