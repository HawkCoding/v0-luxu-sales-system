"use client"

import { useState } from "react"
import { Map } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import type { DocRecord } from "@/lib/types"

interface GenerateItineraryDialogProps {
  jobId: string
  bookingNumber: string
  disabled?: boolean
  initialTripTitle?: string
  initialTripNotes?: string
  onGenerated?: () => Promise<void> | void
  onSent?: () => Promise<void> | void
  /** Controlled open state — omit to let the dialog manage its own trigger/open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Set false to hide the built-in trigger button when embedding this dialog elsewhere (e.g. inside the voucher dialog). */
  trigger?: boolean
  /** Shown once a PDF has been generated — lets an embedding flow (e.g. the voucher dialog) swap back to itself. */
  onContinueTo?: { label: string; onClick: () => void }
}

interface GenerateItineraryResponse {
  document: DocRecord & { storagePath?: string | null }
  itinerary: { id: string; tripTitle: string }
  file: {
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

export function GenerateItineraryDialog({
  jobId,
  bookingNumber,
  disabled,
  initialTripTitle = "",
  initialTripNotes = "",
  onGenerated,
  onSent,
  open,
  onOpenChange,
  trigger = true,
  onContinueTo,
}: GenerateItineraryDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [tripTitle, setTripTitle] = useState(initialTripTitle)
  const [tripNotes, setTripNotes] = useState(initialTripNotes)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GenerateItineraryResponse | null>(null)
  const [previewSendOpen, setPreviewSendOpen] = useState(false)
  const dialogOpen = open ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  function handleOpenChange(next: boolean) {
    if (!next) {
      setGenerated(null)
    }
    setOpen(next)
  }

  async function handleGenerate() {
    if (!tripTitle.trim()) {
      toast.error("Please enter a trip title before generating.")
      return
    }
    setGenerating(true)
    try {
      const response = await fetch("/api/itinerary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, tripTitle: tripTitle.trim(), tripNotes: tripNotes.trim() }),
      })
      const payload = (await response.json()) as GenerateItineraryResponse
      if (!response.ok) throw new Error(payload.error ?? "Itinerary could not be generated")
      setGenerated(payload)
      await onGenerated?.()
      toast.success("Itinerary PDF generated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Itinerary could not be generated")
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    if (!generated) return
    const a = document.createElement("a")
    a.href = generated.file.dataUrl
    a.download = generated.file.filename
    a.click()
  }

  async function handleSent() {
    setGenerated(null)
    await onSent?.()
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(next) => !generating && handleOpenChange(next)}>
        {trigger ? (
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={disabled}>
              <Map data-icon="inline-start" />
              Generate Itinerary
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Generate client itinerary</DialogTitle>
            <DialogDescription>
              Create a personalised trip overview PDF for {bookingNumber} to send to your client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="itinerary-title">Trip title</Label>
                <Input
                  id="itinerary-title"
                  placeholder="e.g. Victoria Falls Explorer — Smith Family"
                  value={tripTitle}
                  onChange={(e) => setTripTitle(e.target.value)}
                  disabled={generating}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="itinerary-notes">Notes (optional)</Label>
              <Textarea
                id="itinerary-notes"
                placeholder="Add personalised notes for the client — special requests, highlights, what to bring…"
                rows={3}
                value={tripNotes}
                onChange={(e) => setTripNotes(e.target.value)}
                disabled={generating}
              />
            </div>
          </div>

          <div className="min-h-[420px] overflow-hidden rounded-md border bg-muted">
            {generated ? (
              <iframe
                className="h-[60vh] min-h-[420px] w-full bg-white"
                src={generated.file.dataUrl}
                title="Itinerary PDF preview"
              />
            ) : (
              <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Fill in the trip title above, then generate to preview the PDF.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={generating}>
              Close
            </Button>
            {generated && (
              <Button variant="outline" onClick={handleDownload} disabled={generating}>
                Download PDF
              </Button>
            )}
            <Button onClick={handleGenerate} disabled={generating || disabled}>
              {generating ? "Generating…" : generated ? "Regenerate PDF" : "Generate PDF"}
            </Button>
            <Button
              onClick={() => {
                handleOpenChange(false)
                setPreviewSendOpen(true)
              }}
              disabled={!generated || generating}
            >
              Preview &amp; Send
            </Button>
            {onContinueTo && generated && (
              <Button
                variant="secondary"
                onClick={() => {
                  handleOpenChange(false)
                  onContinueTo.onClick()
                }}
                disabled={generating}
              >
                {onContinueTo.label}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {generated ? (
        <PreviewAndSendDialog
          open={previewSendOpen}
          onOpenChange={setPreviewSendOpen}
          title="Preview and send itinerary"
          description={`Review the itinerary email for ${bookingNumber}. The generated PDF will be attached.`}
          bookingId={jobId}
          initialSubject={generated.email.subject}
          bodyHtml={generated.email.bodyHtml}
          bodyContentHtml={generated.email.bodyContentHtml}
          to={generated.email.to}
          kind="itinerary"
          attachments={[
            {
              filename: generated.file.filename,
              contentBase64: generated.file.contentBase64,
              contentType: generated.file.contentType,
            },
          ]}
          onSent={handleSent}
        />
      ) : null}
    </>
  )
}
