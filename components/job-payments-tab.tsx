"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Payment } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { useState, useRef } from "react"
import { Plus, Trash2, Upload, FileCheck2, AlertCircle, CheckCircle2 } from "lucide-react"
import { formatDisplayDate } from "@/lib/date-format"

interface JobPaymentsTabProps {
  payments: Payment[]
  jobId: string
  depositPaid: boolean
  invoiceBalance: number | null
  mutate: () => void
}

export function JobPaymentsTab({ payments, jobId, depositPaid, invoiceBalance, mutate }: JobPaymentsTabProps) {
  const { can } = useRole()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: "", method: "EFT", reference: "", notes: "" })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<string | null>(null)

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)

  const handleSubmit = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          amount: Number(form.amount),
          method: form.method,
          reference: form.reference || null,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFormError((body as { error?: string }).error ?? "Failed to record payment")
        return
      }
      mutate()
      setOpen(false)
      setForm({ amount: "", method: "EFT", reference: "", notes: "" })
    } catch {
      setFormError("Network error — please try again")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/payments/${deleteId}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setDeleteError((body as { error?: string }).error ?? "Failed to delete payment")
        return
      }
      mutate()
      setDeleteId(null)
    } catch {
      setDeleteError("Network error — please try again")
    } finally {
      setDeleting(false)
    }
  }

  const handleProofSelect = (paymentId: string) => {
    uploadTargetId.current = paymentId
    fileInputRef.current?.click()
  }

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = uploadTargetId.current
    if (!file || !targetId) return

    setUploadingId(targetId)
    setUploadError(null)
    const formData = new FormData()
    formData.append("proof", file)
    try {
      const res = await fetch(`/api/payments/${targetId}/proof`, { method: "PUT", body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setUploadError((body as { error?: string }).error ?? "Upload failed")
      } else {
        mutate()
      }
    } catch {
      setUploadError("Network error — upload failed")
    } finally {
      setUploadingId(null)
      uploadTargetId.current = null
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleProofDownload = async (paymentId: string) => {
    try {
      const res = await fetch(`/api/payments/${paymentId}/proof`)
      if (!res.ok) return
      const { signedUrl } = await res.json() as { signedUrl: string }
      window.open(signedUrl, "_blank", "noopener,noreferrer")
    } catch {
      // silent — link will just not open
    }
  }

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Total Received:{" "}
            <span className={totalPaid >= 0 ? "text-payment-green" : "text-payment-red"}>
              R {totalPaid.toLocaleString()}
            </span>
          </p>
          {invoiceBalance !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Outstanding balance:{" "}
              <span className={invoiceBalance === 0 ? "text-payment-green" : "text-amber-600 dark:text-amber-400"}>
                R {invoiceBalance.toLocaleString()}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {depositPaid ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Deposit Paid
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 gap-1">
              <AlertCircle className="w-3 h-3" />
              Deposit Outstanding
            </Badge>
          )}
          {invoiceBalance === 0 && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Paid in Full
            </Badge>
          )}
        </div>

        {can("edit:payments") && (
          <div className="ml-auto">
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFormError(null); setForm({ amount: "", method: "EFT", reference: "", notes: "" }) } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Record Payment</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Payment</DialogTitle>
                  <DialogDescription>Enter the payment details for this booking.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Amount (ZAR)</label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="mt-1"
                    />
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
                    <Input
                      value={form.reference}
                      onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Notes</label>
                    <Input
                      value={form.notes}
                      onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  {formError && (
                    <Alert variant="destructive">
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSubmit} disabled={saving || !form.amount}>
                    {saving ? "Saving…" : "Record"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Hidden file input for proof upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleProofUpload}
      />

      {uploadError && (
        <Alert variant="destructive">
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      {/* Payment list */}
      {payments.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No payments recorded</div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${p.amount >= 0 ? "text-payment-green" : "text-payment-red"}`}>
                      {p.amount >= 0 ? "+" : ""}R {Number(p.amount).toLocaleString()}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{p.method}</Badge>
                    {p.proofStoragePath && (
                      <Badge variant="outline" className="text-[10px] gap-0.5 cursor-pointer" onClick={() => handleProofDownload(p.id)}>
                        <FileCheck2 className="w-3 h-3" />
                        Proof
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.reference ? `Ref: ${p.reference}` : ""}
                    {p.reference && p.notes ? " | " : ""}
                    {p.notes ?? ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{formatDisplayDate(p.receivedAt)}</span>

                  {can("edit:payments") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      disabled={uploadingId === p.id}
                      onClick={() => handleProofSelect(p.id)}
                      title="Upload proof of payment"
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  {can("delete:payments") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => { setDeleteId(p.id); setDeleteError(null) }}
                      title="Delete payment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteId)} onOpenChange={(v) => { if (!v) { setDeleteId(null); setDeleteError(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
            <DialogDescription>
              This will permanently remove the payment record and recalculate the booking balance. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
