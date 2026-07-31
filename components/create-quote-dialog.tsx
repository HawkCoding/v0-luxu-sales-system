"use client"

import { useState } from "react"
import { Loader2, PlusCircle } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { QuoteValidityPicker } from "@/components/ui/quote-validity-picker"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import { DEFAULT_QUOTE_VALIDITY_DAYS, isoDateDaysFromNow } from "@/lib/quotes/quote-validity"

interface CreateQuoteDialogProps {
  jobId: string
  onCreated: (quoteId: string) => void
}

function defaultValidityDate(): string {
  return isoDateDaysFromNow(DEFAULT_QUOTE_VALIDITY_DAYS)
}

async function createQuote(
  jobId: string,
  validityUntil?: string,
): Promise<{ error?: string; id?: string }> {
  const res = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      // Validity is hidden: the server stamps the silent org default.
      ...(QUOTE_VALIDITY_ENABLED && validityUntil ? { validityUntil } : {}),
      status: "draft",
    }),
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    return { error: body.error ?? "Failed to create quote. Please try again." }
  }
  return { id: body.id as string }
}

export function CreateQuoteDialog({ jobId, onCreated }: CreateQuoteDialogProps) {
  if (!QUOTE_VALIDITY_ENABLED) {
    return <CreateQuoteButton jobId={jobId} onCreated={onCreated} />
  }
  return <CreateQuoteWithValidityDialog jobId={jobId} onCreated={onCreated} />
}

function CreateQuoteButton({ jobId, onCreated }: CreateQuoteDialogProps) {
  const [saving, setSaving] = useState(false)

  async function handleClick() {
    setSaving(true)
    const { error, id } = await createQuote(jobId)
    setSaving(false)

    if (error || !id) {
      toast.error(error ?? "Failed to create quote. Please try again.")
      return
    }
    toast.success("Draft quote created.")
    onCreated(id)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="create-quote-button"
      disabled={saving}
      onClick={() => void handleClick()}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <PlusCircle className="h-4 w-4 mr-1.5" />
      )}
      {saving ? "Creating…" : "Create New Quote"}
    </Button>
  )
}

function CreateQuoteWithValidityDialog({ jobId, onCreated }: CreateQuoteDialogProps) {
  const [open, setOpen] = useState(false)
  const [validityUntil, setValidityUntil] = useState<string>(defaultValidityDate())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setValidityUntil(defaultValidityDate())
      setError(null)
    }
    setOpen(next)
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)

    const { error, id } = await createQuote(jobId, validityUntil)
    setSaving(false)

    if (error || !id) {
      const message = error ?? "Failed to create quote. Please try again."
      setError(message)
      toast.error(message)
      return
    }

    toast.success("Draft quote created.")
    setOpen(false)
    onCreated(id)
  }

  // No validity picker to confirm right now, so skip the intermediate dialog
  // and create the quote directly on click — the caller auto-opens Build Booking after.
  if (!QUOTE_VALIDITY_ENABLED) {
    return (
      <Button
        variant="outline"
        size="sm"
        data-testid="create-quote-button"
        onClick={handleSubmit}
        disabled={saving}
      >
        <PlusCircle className="h-4 w-4 mr-1.5" />
        {saving ? "Creating…" : "Create New Quote"}
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="create-quote-button">
          <PlusCircle className="h-4 w-4 mr-1.5" />
          Create New Quote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Quote</DialogTitle>
          <DialogDescription>
            Start a new draft quote, then add pricing by applying a package.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {QUOTE_VALIDITY_ENABLED && (
            <div className="space-y-1.5">
              <Label htmlFor="validity">Valid until</Label>
              <QuoteValidityPicker
                id="validity"
                value={validityUntil}
                onChange={value => setValidityUntil(value ?? "")}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create New Quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
