"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, FileText, Clipboard, Send, AlertCircle, Download, HelpCircle } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"
import { useAuth } from "@/lib/auth-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"
import { downloadAuditLog } from "@/lib/export-audit"
import { formatDisplayDate } from "@/lib/date-format"

export default function EnquiriesPage() {
  const { data, isLoading, mutate } = useAllData()
  const { can } = useRole()
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [pasting, setPasting] = useState(false)
  const [sending, setSending] = useState<string | null>(null)

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-secondary rounded-lg" />)}</div></div>
  }

  // Enquiry intake queue: bookings in "enquiry" stage
  const enquiries = data.bookings
    .filter((b: any) => b.stage === "enquiry")
    .map((b: any) => {
      const customer = data.customers.find((c: any) => c.id === b.customerId)
      const quotes = data.quotes?.filter((q: any) => q.bookingId === b.id) || []
      const totalQuote = quotes.reduce((sum: number, q: any) => sum + (q.total || 0), 0)
      return {
        ...b,
        // Legacy field names used by the UI below
        jobNumber: b.bookingNumber,
        jobId: b.id,
        name: customer?.firstName || "",
        surname: customer?.lastName || "",
        email: customer?.email || "",
        title: customer?.title || "",
        totalQuote,
        quotes,
      }
    })

  const filtered = enquiries.filter((e: any) => {
    const matchSearch = !search || [e.name, e.surname, e.email, e.bookingNumber, e.direction].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchSource = sourceFilter === "all" || e.source === sourceFilter
    return matchSearch && matchSource
  })

  const handlePasteImport = async () => {
    if (!pasteText.trim()) return
    setPasting(true)
    try {
      const lines = pasteText.split("\n").map((l: string) => l.trim()).filter(Boolean)
      const nameMatch = pasteText.match(/(?:regards|sincerely|cheers),?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)/i)
      const emailMatch = pasteText.match(/[\w.-]+@[\w.-]+\.\w+/)
      const phoneMatch = pasteText.match(/\+[\d\s-]{8,}/)

      await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: pasteText,
          purpose: "quote",
          title: "Mr",
          name: nameMatch?.[1] || "Unknown",
          surname: nameMatch?.[2] || "Unknown",
          contactNumber: phoneMatch?.[0] || "",
          email: emailMatch?.[0] || "",
          country: null,
          direction: "Pretoria to Cape Town",
          departureDate: "2026-06-01",
          noOfSuites: 1,
          noOfAdults: 2,
          noOfChildren: 0,
          suiteTypes: ["Pullman Twin Suite"],
          termsAccepted: true,
        }),
      })
      mutate()
      setPasteOpen(false)
      setPasteText("")
    } finally {
      setPasting(false)
    }
  }

  const handleDownloadAudit = (e: React.MouseEvent, enquiry: any) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const jobAuditLogs = (data.auditLogs || []).filter((log: any) => 
        log.entityId === enquiry.id || (log.entityType === 'Booking' && log.entityId === enquiry.id)
      )
      downloadAuditLog(jobAuditLogs, enquiry.bookingNumber)
      toast.success("Audit log downloaded")
    } catch (error) {
      console.error("[v0] Failed to download audit:", error)
      toast.error("Failed to download audit log")
    }
  }

  const handleSendDepositRequest = async (enquiry: any) => {
    // Validation: Check if quote exists and has a total
    if (!enquiry.totalQuote || enquiry.totalQuote === 0) {
      toast.error("Cannot send deposit request", {
        description: "A quote with a total amount is required before sending deposit request."
      })
      return
    }

    const depositAmount = Math.round(enquiry.totalQuote * 0.25) // 25% deposit

    setSending(enquiry.id)
    try {
      // 1. Create correspondence entry (mock email)
      await fetch("/api/correspondence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: enquiry.id,
          channel: "email",
          subject: "Invoice / Deposit Request",
          bodyHtml: `<p>Dear ${enquiry.title} ${enquiry.surname},</p>
<p>Thank you for your enquiry. We are pleased to provide you with the deposit request for your booking.</p>
<p><strong>Deposit Amount: R ${depositAmount.toLocaleString()}</strong> (25% of total quote)</p>
<p>Please process payment at your earliest convenience.</p>
<p>Kind regards,<br/>Luxus Travel & Tours</p>`,
          status: "sent",
          sentAt: new Date().toISOString(),
        }),
      })

      // 2. Update booking stage to "deposit_requested"
      await fetch(`/api/jobs/${enquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "deposit_requested",
        }),
      })

      // 3. Log audit entry
      await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: user?.name || "Unknown",
          entityType: "Booking",
          entityId: enquiry.id,
          action: "send_deposit_request",
          metaJson: JSON.stringify({ depositAmount, totalQuote: enquiry.totalQuote }),
        }),
      })

      mutate()
      toast.success("Deposit request sent successfully", {
        description: "Moved to the Pipeline."
      })
    } catch (error) {
      console.error("Failed to send deposit request:", error)
      toast.error("Failed to send deposit request", {
        description: "Please try again."
      })
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Enquiries</h1>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-base text-muted-foreground">New enquiries ready for sales review and follow-up</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="Show enquiry queue note"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 text-sm leading-6">
                <p>
                  This queue shows newly captured enquiries, including unreviewed enquiries and enquiries that need attention. Once you send a deposit request, the job will move to the Pipeline.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {can("create:enquiry") && (
          <Link href="/enquire/rovos">
            <Button size="default">
              <Plus className="w-4 h-4 mr-2" /> New Enquiry
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search enquiries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="web_form">Web Form</SelectItem>
            <SelectItem value="paste_import">Paste Import</SelectItem>
            <SelectItem value="advertisement">Advertisement</SelectItem>
            <SelectItem value="walk_in">Walk In</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
            <SelectItem value="social_media">Social Media</SelectItem>
            <SelectItem value="phone_call">Phone Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="travel_agent">Travel Agent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map((e: any) => {
          const canSendDeposit = e.totalQuote && e.totalQuote > 0
          const depositAmount = canSendDeposit ? Math.round(e.totalQuote * 0.25) : 0
          const isSending = sending === e.id

          return (
            <Card key={e.id} className="group hover:shadow-md transition-shadow border-2 relative">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
                      {e.source === "paste_import" ? <Clipboard className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                      {/* Grey status circle for new enquiry */}
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gray-400 border-2 border-white" title="New enquiry" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link href={`/app/bookings/${e.jobId}`} className="text-base font-semibold text-foreground hover:text-primary transition-colors">
                          {e.jobNumber}
                        </Link>
                        {e.consultant && (
                          <Badge variant="default" className="text-xs font-bold">{e.consultant}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{e.source.replace("_", " ")}</Badge>
                        <Badge variant="secondary" className="text-xs">{e.purpose}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {e.title} {e.name} {e.surname} • {e.email}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{e.direction}</span>
                        <span>•</span>
                        <span>{formatDisplayDate(e.departureDate)}</span>
                        <span>•</span>
                        <span>{e.noOfAdults} adults, {e.noOfChildren} children</span>
                      </div>
                      {!canSendDeposit && (
                        <Alert className="mt-3 py-2">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription className="text-xs">
                            Quote with total amount required before sending deposit request
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="text-right">
                      {canSendDeposit && (
                        <p className="text-sm font-semibold text-foreground">
                          Deposit: R {depositAmount.toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created {formatDisplayDate(e.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSendDepositRequest(e)}
                      disabled={!canSendDeposit || isSending}
                      className="w-full"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {isSending ? "Sending..." : "Send Deposit Request"}
                    </Button>
                  </div>
                </div>
                <button
                  onClick={(ev) => handleDownloadAudit(ev, e)}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-secondary rounded"
                  title="Download audit log"
                >
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </CardContent>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center space-y-2">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-base font-medium text-foreground">No enquiries in queue</p>
                <p className="text-sm text-muted-foreground">
                  All enquiries have been processed or there are no new enquiries yet
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
