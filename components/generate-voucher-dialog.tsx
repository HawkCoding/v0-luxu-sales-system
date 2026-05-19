"use client"

import { useState } from "react"
import { FileOutput } from "lucide-react"
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
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import type { DocRecord } from "@/lib/types"
import { SendVoucherButton } from "@/components/booking-package-section"

interface GenerateVoucherDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  jobId: string
  bookingNumber: string
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
  email: {
    to: string
    subject: string
    bodyHtml: string
  }
  error?: string
}

export function GenerateVoucherDialog({
  open,
  onOpenChange,
  trigger = true,
  jobId,
  bookingNumber,
  disabled,
  onSent,
  onGenerated,
}: GenerateVoucherDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GenerateVoucherResponse | null>(null)
  const [previewSendOpen, setPreviewSendOpen] = useState(false)
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
      const payload = (await response.json()) as GenerateVoucherResponse

      if (!response.ok) {
        throw new Error(payload.error ?? "Voucher could not be generated")
      }

      setGenerated(payload)
      await onGenerated?.()
      toast.success("Voucher PDF generated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be generated")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSent() {
    await onSent()
    setGenerated(null)
  }

  return (
    <>
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
              Create the PDF voucher for {bookingNumber}, preview it, then send it to the customer.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[420px] overflow-hidden rounded-md border bg-muted">
            {generated ? (
              <iframe
                className="h-[60vh] min-h-[420px] w-full bg-white"
                src={generated.voucher.dataUrl}
                title="Voucher PDF preview"
              />
            ) : (
              <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Generate the voucher to preview the PDF before sending.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generating}>
              Close
            </Button>
            <Button onClick={generateVoucher} disabled={generating || disabled}>
              {generating ? "Generating..." : generated ? "Regenerate PDF" : "Generate PDF"}
            </Button>
            <Button
              onClick={() => {
                setDialogOpen(false)
                setPreviewSendOpen(true)
              }}
              disabled={!generated || generating}
            >
              Preview & Send
            </Button>
            <SendVoucherButton
              voucherId={generated?.voucherRecord?.id ?? null}
              bookingNumber={bookingNumber}
              disabled={generating}
              onSent={async () => {
                setDialogOpen(false)
                await handleSent()
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {generated ? (
        <PreviewAndSendDialog
          open={previewSendOpen}
          onOpenChange={setPreviewSendOpen}
          title="Preview and send voucher"
          description={`Review the voucher email for ${bookingNumber}. The generated PDF will be attached.`}
          bookingId={jobId}
          initialSubject={generated.email.subject}
          bodyHtml={generated.email.bodyHtml}
          kind="voucher"
          moveStage="voucher_sent"
          attachments={[
            {
              filename: generated.voucher.filename,
              contentBase64: generated.voucher.contentBase64,
              contentType: generated.voucher.contentType,
            },
          ]}
          onSent={handleSent}
        />
      ) : null}
    </>
  )
}
