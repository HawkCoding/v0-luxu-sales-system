"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
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
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { QuoteLineSupplierPicker, type QuoteExtraSelection } from "@/components/quote-line-supplier-picker"
import type { QuoteLineItem } from "@/lib/types"

interface AddQuoteLineDialogProps {
  quoteId: string
  expectedUpdatedAt?: string
  existingLineItems: QuoteLineItem[]
  /** Soft-filter suppliers to these destination location IDs (optional). */
  destinationLocationIds?: string[]
  onAdded: () => void
}

interface QuotePatchPayload {
  lineItems: QuoteLineItem[]
}

interface QuotePatchResponse {
  id: string
  updatedAt: string
}

export function AddQuoteLineDialog({
  quoteId,
  expectedUpdatedAt,
  existingLineItems,
  destinationLocationIds = [],
  onAdded,
}: AddQuoteLineDialogProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<QuoteLineItem[]>([])
  const [pricing, setPricing] = useState(false)
  const { save, isSaving } = useVersionedSave<QuotePatchPayload, QuotePatchResponse>({
    url: `/api/quotes/${quoteId}`,
    method: "PATCH",
    entity: "quote",
    recordId: quoteId,
    expectedUpdatedAt,
  })

  function reset() {
    setPending([])
  }

  async function handleAdd(selection: QuoteExtraSelection) {
    setPricing(true)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/price-line`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selection.supplierId,
          routeId: selection.routeId,
          suiteTypeId: selection.suiteTypeId,
          quantity: selection.quantity,
        }),
      })
      const payload = (await res.json()) as { lineItems?: QuoteLineItem[]; error?: string }
      if (!res.ok || !payload.lineItems) {
        toast.error(payload.error ?? "Could not price this line")
        return
      }
      if (payload.lineItems.length === 0) {
        toast.error("This selection produced no priced lines (check passenger counts)")
        return
      }
      setPending((prev) => [...prev, ...payload.lineItems!])
    } finally {
      setPricing(false)
    }
  }

  async function handleSave() {
    if (pending.length === 0) return
    try {
      await save({ lineItems: [...existingLineItems, ...pending] })
      toast.success(pending.length === 1 ? "Line added" : `${pending.length} lines added`)
      setOpen(false)
      reset()
      onAdded()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add line")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Line
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a line to this quote</DialogTitle>
          <DialogDescription>
            Pick a supplier already in the system — its rate card prices the line. Not listed? Use “New supplier”.
          </DialogDescription>
        </DialogHeader>

        <QuoteLineSupplierPicker
          destinationLocationIds={destinationLocationIds}
          onAdd={handleAdd}
          addLabel="Price & add"
          busy={pricing}
        />

        {pending.length > 0 ? (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((li, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2 text-xs">{li.description}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{li.qty}</td>
                    <td className="px-3 py-2 text-right text-xs font-medium">R {li.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setPending((prev) => prev.filter((_, index) => index !== i))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending.length === 0 || isSaving}>
            {isSaving ? "Saving…" : pending.length > 0 ? `Add ${pending.length} to quote` : "Add to quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
