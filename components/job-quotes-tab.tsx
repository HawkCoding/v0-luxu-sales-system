"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { Quote, Itinerary } from "@/lib/types"
import { useRole } from "@/lib/role-context"

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  pricing_incomplete: { variant: "outline", label: "Pricing Incomplete" },
  ready: { variant: "default", label: "Ready" },
  sent: { variant: "default", label: "Sent" },
  accepted: { variant: "default", label: "Accepted" },
}

export function JobQuotesTab({ quotes, jobId, itineraries, mutate }: { quotes: Quote[]; jobId: string; itineraries: Itinerary[]; mutate: () => void }) {
  const { can } = useRole()

  if (quotes.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No quotes yet</div>
  }

  return (
    <div className="space-y-4">
      {quotes.map(q => {
        const it = itineraries.find(i => i.id === q.itineraryId)
        const badge = STATUS_BADGE[q.status] || { variant: "outline" as const, label: q.status }
        const hasIncomplete = q.lineItems.some(li => li.unitPrice === 0)

        return (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">{it?.name || "Quote"}</CardTitle>
                  <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                  {hasIncomplete && <Badge variant="destructive" className="text-[10px]">Missing pricing</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">Valid until {new Date(q.validityUntil).toLocaleDateString()}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ fontFamily: "var(--font-inter)" }}>
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="pb-2">Description</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Unit Price</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 text-xs text-foreground">{li.description}</td>
                        <td className="py-2 text-xs text-right text-muted-foreground">{li.qty}</td>
                        <td className={`py-2 text-xs text-right ${li.unitPrice === 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {li.unitPrice === 0 ? "TBD" : `R ${li.unitPrice.toLocaleString()}`}
                        </td>
                        <td className="py-2 text-xs text-right text-foreground font-medium">R {li.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Separator className="my-3" />
              <div className="space-y-1 text-right">
                <div className="flex justify-end gap-8 text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium w-24">R {q.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-end gap-8 text-xs">
                  <span className="text-muted-foreground">VAT (15%)</span>
                  <span className="text-foreground w-24">R {q.vat.toLocaleString()}</span>
                </div>
                <div className="flex justify-end gap-8 text-sm font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground w-24">R {q.total.toLocaleString()}</span>
                </div>
              </div>
              {q.overrideReason && (
                <div className="mt-3 p-2 bg-payment-yellow/10 rounded-md">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>Pricing Override</p>
                  <p className="text-xs text-foreground mt-0.5">{q.overrideReason}</p>
                </div>
              )}
              {q.lastSentAt && (
                <p className="text-[10px] text-muted-foreground mt-2">Last sent: {new Date(q.lastSentAt).toLocaleString()}</p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
