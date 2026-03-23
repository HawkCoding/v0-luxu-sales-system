"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, Upload, Link as LinkIcon, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { formatDisplayDate } from "@/lib/date-format"

export default function PaymentsPage() {
  const { data, isLoading, mutate } = useAllData()
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [allocatingPayment, setAllocatingPayment] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [allocationSearch, setAllocationSearch] = useState("")

  const [form, setForm] = useState({
    amount: "",
    receivedAt: new Date().toISOString().split("T")[0],
    method: "EFT",
    reference: "",
    notes: "",
  })

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const payments = data.payments.map((p: any) => {
    const booking = data.bookings.find((b: any) => b.id === p.bookingId)
    const customer = data.customers.find((c: any) => c.id === booking?.customerId)
    const quotes = data.quotes?.filter((q: any) => q.bookingId === p.bookingId) || []
    const totalQuote = quotes.reduce((sum: number, q: any) => sum + (q.total || 0), 0)
    return {
      ...p,
      jobId: p.bookingId,
      jobNumber: booking?.bookingNumber,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      customerEmail: customer?.email,
      totalQuote,
      stage: booking?.stage,
    }
  }).sort((a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())

  const filtered = payments.filter((p: any) => {
    if (!search) return true
    return [p.jobNumber, p.customerName, p.reference, p.method]
      .some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
  })

  const total = filtered.reduce((s: number, p: any) => s + p.amount, 0)

  const handleAddPayment = async () => {
    if (!form.amount || !form.receivedAt || !form.method || !form.reference) {
      toast.error("Please fill in all required fields")
      return
    }

    setSaving(true)
    try {
      // Mock: In real app, this would create an unallocated payment
      // For now, we'll require allocation immediately
      toast.success("Payment entry created", {
        description: "Please allocate this payment to a booking or enquiry."
      })
      
      setAddOpen(false)
      setForm({
        amount: "",
        receivedAt: new Date().toISOString().split("T")[0],
        method: "EFT",
        reference: "",
        notes: "",
      })
    } catch (error) {
      toast.error("Failed to add payment")
    } finally {
      setSaving(false)
    }
  }

  const handleAllocate = (payment: any) => {
    setAllocatingPayment(payment)
    setAllocateOpen(true)
    setAllocationSearch("")
  }

  const handleConfirmAllocation = async (targetJobId: string) => {
    setSaving(true)
    try {
      // Mock: Update payment's jobId
      await fetch(`/api/payments/${allocatingPayment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: targetJobId }),
      })

      // Log audit
      await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: user?.name || "Unknown",
          entityType: "Payment",
          entityId: allocatingPayment.id,
          action: "allocate_payment",
          metaJson: JSON.stringify({ targetBookingId: targetJobId }),
        }),
      })

      mutate()
      setAllocateOpen(false)
      setAllocatingPayment(null)
      toast.success("Payment allocated successfully")
    } catch (error) {
      toast.error("Failed to allocate payment")
    } finally {
      setSaving(false)
    }
  }

  // Get all bookings for allocation search
  const allJobs = data.bookings.map((b: any) => {
    const customer = data.customers.find((c: any) => c.id === b.customerId)
    const quotes = data.quotes?.filter((q: any) => q.bookingId === b.id) || []
    const totalQuote = quotes.reduce((sum: number, q: any) => sum + (q.total || 0), 0)
    return {
      ...b,
      jobNumber: b.bookingNumber,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      totalQuote,
    }
  })

  const filteredJobs = allJobs.filter((j: any) => {
    if (!allocationSearch) return true
    return [j.bookingNumber, j.customerName]
      .some((f: string) => f?.toLowerCase().includes(allocationSearch.toLowerCase()))
  }).slice(0, 10)

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Payments Received</h1>
          <p className="text-base text-muted-foreground mt-2">
            {filtered.length} transactions • Net: <span className={total >= 0 ? "text-payment-green" : "text-payment-red"}>R {total.toLocaleString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="default">
                <Plus className="w-4 h-4 mr-2" /> Add Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Payment</DialogTitle>
                <DialogDescription>Manually enter a payment received</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount" className="text-sm font-medium">Amount (R) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="10000"
                      value={form.amount}
                      onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="receivedAt" className="text-sm font-medium">Date Received *</Label>
                    <Input
                      id="receivedAt"
                      type="date"
                      value={form.receivedAt}
                      onChange={(e) => setForm(f => ({ ...f, receivedAt: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="method" className="text-sm font-medium">Payment Method *</Label>
                  <Select value={form.method} onValueChange={(v) => setForm(f => ({ ...f, method: v }))}>
                    <SelectTrigger id="method" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EFT">EFT</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="Credit Adjustment">Credit Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reference" className="text-sm font-medium">Reference *</Label>
                  <Input
                    id="reference"
                    placeholder="REF-XXX-001"
                    value={form.reference}
                    onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional payment notes..."
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAddPayment} disabled={saving}>
                  {saving ? "Saving..." : "Add Payment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="default" variant="outline">
            <Upload className="w-4 h-4 mr-2" /> Import Payments
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 text-sm" />
      </div>

      <div className="space-y-3">
        {filtered.map((p: any) => {
          const isAllocated = p.jobId && p.jobNumber
          return (
            <Card key={p.id} className="hover:shadow-md transition-shadow border-2">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className={`text-lg font-bold ${p.amount >= 0 ? "text-payment-green" : "text-payment-red"}`}>
                        {p.amount >= 0 ? "+" : ""}R
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg font-bold ${p.amount >= 0 ? "text-payment-green" : "text-payment-red"}`}>
                          {p.amount >= 0 ? "+" : ""}R {Math.abs(p.amount).toLocaleString()}
                        </span>
                        <Badge variant="secondary" className="text-xs">{p.method}</Badge>
                        <Badge variant="outline" className="text-xs">Ref: {p.reference}</Badge>
                      </div>
                      {isAllocated ? (
                        <div className="space-y-1">
                          <Link 
                            href={`/app/bookings/${p.jobId}`}
                            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors group"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                            <span className="font-medium">{p.jobNumber}</span>
                            <span className="text-muted-foreground">• {p.customerName}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {p.totalQuote > 0 && (
                              <span>Total Due: R {p.totalQuote.toLocaleString()}</span>
                            )}
                            {p.customerEmail && (
                              <span>• {p.customerEmail}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Not allocated • {p.notes || "No notes"}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Received: {formatDisplayDate(p.receivedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {!isAllocated && (
                      <Button size="sm" variant="outline" onClick={() => handleAllocate(p)}>
                        <LinkIcon className="w-3.5 h-3.5 mr-1.5" /> Allocate
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-base font-medium text-foreground">No payments found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or add a new payment
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Allocation Modal */}
      <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Allocate Payment</DialogTitle>
            <DialogDescription>
              Search for a booking or enquiry to allocate this payment to
            </DialogDescription>
          </DialogHeader>
          {allocatingPayment && (
            <div className="bg-muted p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Payment Amount</p>
                  <p className="text-2xl font-bold text-payment-green">R {allocatingPayment.amount.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="text-sm font-medium">{allocatingPayment.reference}</p>
                </div>
              </div>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by job number or customer name..." 
              value={allocationSearch}
              onChange={(e) => setAllocationSearch(e.target.value)}
              className="pl-9" 
            />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredJobs.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No jobs found
              </div>
            )}
            {filteredJobs.map((j: any) => (
              <Card 
                key={j.id}
                className="hover:shadow-sm transition-shadow cursor-pointer hover:border-primary"
                onClick={() => handleConfirmAllocation(j.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">{j.jobNumber}</span>
                        <Badge variant="outline" className="text-xs">{j.stage?.replace(/_/g, " ")}</Badge>
                        {j.consultant && (
                          <Badge variant="default" className="text-xs font-bold">{j.consultant}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{j.customerName}</p>
                      {j.direction && (
                        <p className="text-xs text-muted-foreground mt-0.5">{j.direction}</p>
                      )}
                    </div>
                    {j.totalQuote > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total Quote</p>
                        <p className="text-sm font-semibold text-foreground">R {j.totalQuote.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAllocateOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
