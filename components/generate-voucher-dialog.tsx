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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import { GenerateItineraryDialog } from "@/components/generate-itinerary-dialog"
import type { DocRecord } from "@/lib/types"
import { SendVoucherButton } from "@/components/send-voucher-button"

interface GenerateVoucherDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  jobId: string
  bookingNumber: string
  disabled?: boolean
  onSent: () => Promise<void> | void
  onGenerated?: () => Promise<void> | void
  /** Whether an itinerary PDF already exists for this booking — the voucher email attaches both. */
  hasItinerary?: boolean
  initialItineraryTitle?: string
  initialItineraryNotes?: string
  onItineraryGenerated?: () => Promise<void> | void
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
    bodyContentHtml?: string
    warnings?: string[]
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
  hasItinerary = false,
  initialItineraryTitle = "",
  initialItineraryNotes = "",
  onItineraryGenerated,
}: GenerateVoucherDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GenerateVoucherResponse | null>(null)
  const [previewSendOpen, setPreviewSendOpen] = useState(false)
  const [itineraryOpen, setItineraryOpen] = useState(false)
  const [itineraryGeneratedLocally, setItineraryGeneratedLocally] = useState(false)
  const itineraryReady = hasItinerary || itineraryGeneratedLocally
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

          {!itineraryReady && (
            <Alert>
              <TriangleAlert />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>Itinerary not generated yet — the voucher email attaches both PDFs.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false)
                    setItineraryOpen(true)
                  }}
                >
                  Generate Itinerary
                </Button>
              </AlertDescription>
            </Alert>
          )}

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
              onMissingItinerary={() => {
                setDialogOpen(false)
                setItineraryOpen(true)
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GenerateItineraryDialog
        trigger={false}
        open={itineraryOpen}
        onOpenChange={setItineraryOpen}
        jobId={jobId}
        bookingNumber={bookingNumber}
        initialTripTitle={initialItineraryTitle}
        initialTripNotes={initialItineraryNotes}
        onGenerated={async () => {
          setItineraryGeneratedLocally(true)
          await onItineraryGenerated?.()
        }}
        onSent={onItineraryGenerated}
        onContinueTo={{
          label: "Continue to Voucher",
          onClick: () => setDialogOpen(true),
        }}
      />

      {generated ? (
        <PreviewAndSendDialog
          open={previewSendOpen}
          onOpenChange={setPreviewSendOpen}
          title="Preview and send voucher"
          description={`Review the voucher email for ${bookingNumber}. The generated PDF will be attached.`}
          bookingId={jobId}
          initialSubject={generated.email.subject}
          bodyHtml={generated.email.bodyHtml}
          bodyContentHtml={generated.email.bodyContentHtml}
          to={generated.email.to}
          kind="voucher"
          moveStage="voucher_sent"
          voucherId={generated.voucherRecord?.id}
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
