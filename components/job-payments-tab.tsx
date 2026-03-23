"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import type { Payment } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Plus } from "lucide-react"

export function JobPaymentsTab({ payments, jobId, mutate }: { payments: Payment[]; jobId: string; mutate: () => void }) {
  const { can } = useRole()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: "", method: "EFT", reference: "", notes: "" })
  const [saving, setSaving] = useState(false)

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, amount: Number(form.amount), method: form.method, reference: form.reference, notes: form.notes }),
      })
      mutate()
      setOpen(false)
      setForm({ amount: "", method: "EFT", reference: "", notes: "" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            Total Received: <span className={totalPaid >= 0 ? "text-payment-green" : "text-payment-red"}>R {totalPaid.toLocaleString()}</span>
          </p>
        </div>
        {can("edit:payments") && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Record Payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>Enter the payment details for this job.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Amount (ZAR)</label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Method</label>
                  <Select value={form.method} onValueChange={(v) => setForm(f => ({ ...f, method: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EFT">EFT</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="Credit Adjustment">Credit Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Reference</label>
                  <Input value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSubmit} disabled={saving || !form.amount}>
                    {saving ? "Saving..." : "Record"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No payments recorded</div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${p.amount >= 0 ? "text-payment-green" : "text-payment-red"}`}>
                      {p.amount >= 0 ? "+" : ""}R {p.amount.toLocaleString()}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{p.method}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Ref: {p.reference} {p.notes ? `| ${p.notes}` : ""}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(p.receivedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
