"use client"

import { useEnquiries, type EnquiryFilter, type EnquiryListItem } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Search,
  Plus,
  FileText,
  Clipboard,
  Send,
  AlertCircle,
  Download,
  HelpCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useRole } from "@/lib/role-context"
import { NewEnquiryDialog } from "@/components/new-enquiry-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"
import { downloadAuditLog } from "@/lib/export-audit"
import { formatDisplayDate } from "@/lib/date-format"
import { describeReviewReasons, REVIEW_REASON } from "@/lib/inbound-email/review-reasons"
import type { AuditLog } from "@/lib/types"

const FILTER_CHIPS: { value: EnquiryFilter; label: string }[] = [
  { value: "needs_review", label: "Needs Review" },
  { value: "complete", label: "Complete" },
  { value: "unassigned", label: "Unassigned" },
  { value: "my_enquiries", label: "My Enquiries" },
  { value: "possible_duplicates", label: "Possible Duplicates" },
]

export default function EnquiriesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeFilter = (searchParams.get("filter") as EnquiryFilter | null) ?? undefined

  const { data: enquiriesData, isLoading, error, mutate: mutateEnquiries } = useEnquiries(activeFilter)
  const { can } = useRole()

  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [newEnquiryOpen, setNewEnquiryOpen] = useState(false)

  const setFilter = useCallback(
    (value: EnquiryFilter | undefined) => {
      if (value) {
        router.replace(`/app/enquiries?filter=${value}`)
      } else {
        router.replace("/app/enquiries")
      }
    },
    [router],
  )

  const refreshAll = useCallback(() => {
    mutateEnquiries()
  }, [mutateEnquiries])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-secondary rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load enquiries: {error instanceof Error ? error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const rawEnquiries: EnquiryListItem[] = enquiriesData?.enquiries ?? []

  const filtered = rawEnquiries.filter((e) => {
    const customer = e.customer
    const matchSearch =
      !search ||
      [customer?.firstName, customer?.lastName, customer?.email, e.bookingNumber, e.direction].some((f) =>
        f?.toLowerCase().includes(search.toLowerCase()),
      )
    const matchSource = sourceFilter === "all" || e.source === sourceFilter
    return matchSearch && matchSource
  })

  const handleDownloadAudit = async (ev: React.MouseEvent, enquiry: EnquiryListItem) => {
    ev.preventDefault()
    ev.stopPropagation()
    try {
      const response = await fetch(
        `/api/audit?entityType=Booking&entityId=${encodeURIComponent(enquiry.id)}&pageSize=250`,
      )
      if (!response.ok) throw new Error("Failed to load audit logs")
      const payload = (await response.json()) as { logs?: AuditLog[] }
      downloadAuditLog(payload.logs ?? [], enquiry.bookingNumber)
      toast.success("Audit log downloaded")
    } catch {
      toast.error("Failed to download audit log")
    }
  }

  const handleResolveReview = async (enquiryId: string) => {
    // The PATCH is manager/admin only. Without this check a consultant got a 403 and a success
    // toast, and the badge silently stayed put.
    const response = await fetch(`/api/jobs/${enquiryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolveEmailImportReview: true }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      toast.error(body.error || "Failed to resolve review")
      return
    }
    refreshAll()
    toast.success("Import review resolved")
  }

  const handleRejectImportedEnquiry = async (enquiryId: string) => {
    const response = await fetch(`/api/jobs/${enquiryId}`, { method: "DELETE" })
    if (!response.ok) {
      const body = (await response.json()) as { error?: string }
      toast.error(body.error || "Failed to reject enquiry")
      return
    }
    refreshAll()
    toast.success("Imported enquiry rejected")
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
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
                  This queue shows newly captured enquiries, including unreviewed enquiries and enquiries that need
                  attention. Once you send a quote, the job will move to the Pipeline.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {can("create:enquiry") && (
          <>
            <Button size="default" onClick={() => setNewEnquiryOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Enquiry
            </Button>
            <NewEnquiryDialog
              open={newEnquiryOpen}
              onOpenChange={setNewEnquiryOpen}
              onSaved={(jobId) => router.push(`/app/bookings/${jobId}?tab=quotes`)}
            />
          </>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={!activeFilter ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter(undefined)}
          aria-pressed={!activeFilter}
        >
          All
        </Button>
        {FILTER_CHIPS.map((chip) => (
          <Button
            key={chip.value}
            variant={activeFilter === chip.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(activeFilter === chip.value ? undefined : chip.value)}
            aria-pressed={activeFilter === chip.value}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search enquiries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
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
        {filtered.map((e) => {
          const customer = e.customer
          const name = customer?.firstName ?? ""
          const surname = customer?.lastName ?? ""
          const email = customer?.email ?? ""
          const title = customer?.title ?? ""

          return (
            <Card key={e.id} className="group hover:shadow-md transition-shadow border-2 relative">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
                      {e.source === "paste_import" ? (
                        <Clipboard className="w-5 h-5 text-primary" />
                      ) : (
                        <FileText className="w-5 h-5 text-primary" />
                      )}
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gray-400 border-2 border-white" title="New enquiry" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link
                          href={`/app/bookings/${e.id}`}
                          className="text-base font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {e.bookingNumber}
                        </Link>
                        {e.consultant && (
                          <Badge variant="default" className="text-xs font-bold">
                            {e.consultant}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {e.source.replace("_", " ")}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {e.purpose}
                        </Badge>
                        {e.emailImportNeedsReview && (
                          <Badge variant="destructive" className="text-xs">
                            Needs Review
                          </Badge>
                        )}
                        {e.emailImportDuplicateOfBookingId && (
                          <Badge variant="outline" className="text-xs">
                            Possible duplicate
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {title} {name} {surname} • {email}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{e.direction}</span>
                        <span>•</span>
                        <span>{formatDisplayDate(e.departureDate)}</span>
                        <span>•</span>
                        <span>
                          {e.noOfAdults} adults, {e.noOfChildren} children
                        </span>
                      </div>
                      {e.emailImportNeedsReview && (
                        <Alert className="mt-3 py-2 border-destructive/40">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription className="text-xs">
                            <p className="font-medium">
                              Needs review before this enquiry can move to Quote Sent
                            </p>
                            <ul className="mt-1.5 space-y-1">
                              {describeReviewReasons(e.emailImportMissingFields, e.emailImportWarnings).map(
                                (reason) => (
                                  <li key={reason.reason}>
                                    <span className="font-medium">{reason.label}</span>{" "}
                                    <span className="text-muted-foreground">{reason.fixHint}</span>
                                    {reason.reason === REVIEW_REASON.possibleDuplicate &&
                                      e.emailImportDuplicateOfBookingId && (
                                        <>
                                          {" "}
                                          <Link
                                            href={`/app/bookings/${e.emailImportDuplicateOfBookingId}`}
                                            className="underline underline-offset-2 hover:text-primary"
                                          >
                                            View possible duplicate
                                          </Link>
                                        </>
                                      )}
                                  </li>
                                ),
                              )}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                      {!e.emailImportNeedsReview && (
                        <Alert className="mt-3 py-2">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription className="text-xs">
                            To proceed with this enquiry, click Open Job to build and send a quote.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mt-0.5">Created {formatDisplayDate(e.createdAt)}</p>
                    </div>
                    <Button size="sm" asChild className="w-full">
                      <Link href={`/app/jobs/${e.id}`}>
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Open Job
                      </Link>
                    </Button>
                    {e.emailImportNeedsReview && can("resolve:import_review") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolveReview(e.id)}
                        className="w-full"
                        title="Clears the review flag so the booking can advance"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Mark reviewed
                      </Button>
                    )}
                    {e.source === "email" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRejectImportedEnquiry(e.id)}
                        className="w-full text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Reject Import
                      </Button>
                    )}
                  </div>
                </div>
                {/* GET /api/audit is admin/manager only -- rendering this for a consultant just
                    bought them a 403 and a failure toast. */}
                {can("view:audit") && (
                  <button
                    onClick={(ev) => handleDownloadAudit(ev, e)}
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-secondary rounded"
                    title="Download audit log"
                    aria-label={`Download audit log for ${e.bookingNumber}`}
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
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
                  {activeFilter
                    ? "No enquiries match this filter"
                    : "All enquiries have been processed or there are no new enquiries yet"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
