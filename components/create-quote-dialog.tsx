"use client"

import { useState } from "react"
import { PlusCircle } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Itinerary } from "@/lib/types"

interface CreateQuoteDialogProps {
  jobId: string
  itineraries: Itinerary[]
  onCreated: () => void
}

function defaultValidityDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split("T")[0]
}

export function CreateQuoteDialog({ jobId, itineraries, onCreated }: CreateQuoteDialogProps) {
  const [open, setOpen] = useState(false)
  const [itineraryId, setItineraryId] = useState<string>("")
  const [validityUntil, setValidityUntil] = useState<string>(defaultValidityDate())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setItineraryId("")
      setValidityUntil(defaultValidityDate())
      setError(null)
    }
    setOpen(next)
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)

    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        itineraryId: itineraryId || null,
        validityUntil,
        status: "draft",
      }),
    })

    setSaving(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to create quote. Please try again.")
      return
    }

    toast.success("Draft quote created.")
    setOpen(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="create-quote-button">
          <PlusCircle className="h-4 w-4 mr-1.5" />
          Create Quote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Quote</DialogTitle>
          <DialogDescription>
            Start a new draft quote. You can apply a package to it afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="itinerary">Itinerary (optional)</Label>
            <Select value={itineraryId} onValueChange={setItineraryId}>
              <SelectTrigger id="itinerary">
                <SelectValue placeholder="Select itinerary…" />
              </SelectTrigger>
              <SelectContent>
                {itineraries.map(it => (
                  <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              You can attach an itinerary later by applying a package.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="validity">Valid until</Label>
            <Input
              id="validity"
              type="date"
              value={validityUntil}
              onChange={e => setValidityUntil(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create Quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
