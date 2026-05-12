"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, CalendarCheck, Filter, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CONSULTANTS, getPipelineStageLabel, type ConsultantAbbreviation } from "@/lib/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { formatDisplayDate } from "@/lib/date-format"
import { isVisibleInBookings } from "@/lib/booking-visibility"

export default function BookingsPage() {
  const { data, isLoading, error, mutate } = useAllData()
  const [search, setSearch] = useState("")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all")
  const [consultantFilter, setConsultantFilter] = useState<"all" | ConsultantAbbreviation>("all")
  const [createdDateFrom, setCreatedDateFrom] = useState<Date | undefined>(undefined)
  const [createdDateTo, setCreatedDateTo] = useState<Date | undefined>(undefined)
  const [departureDateFrom, setDepartureDateFrom] = useState<Date | undefined>(undefined)
  const [departureDateTo, setDepartureDateTo] = useState<Date | undefined>(undefined)

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-secondary rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="text-center space-y-2">
              <CalendarCheck className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <p className="text-base font-medium text-foreground">Failed to load bookings</p>
              <p className="text-sm text-muted-foreground">
                Something went wrong while loading bookings. Try again.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => mutate()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return null
  }

  // Bookings list starts once a quote has been sent, excluding enquiry and lost jobs.
  const bookings = data.bookings
    .filter(isVisibleInBookings)
    .map((b: any) => {
      const customer = data.customers.find((c: any) => c.id === b.customerId)
      const payments = data.payments?.filter((p: any) => p.bookingId === b.id) || []
      const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0)
      const quotes = data.quotes?.filter((q: any) => q.bookingId === b.id) || []
      const totalQuote = quotes.reduce((sum: number, q: any) => sum + (q.total || 0), 0)

      // Infer supplier from route direction name
      let supplier = "Unknown"
      if (b.direction) {
        if (b.direction.toLowerCase().includes("blue train")) {
          supplier = "Blue Train"
        } else {
          supplier = "Rovos Rail"
        }
      }

      const paymentStatus =
        b.stage === "final_paid" || b.stage === "voucher_sent" || b.stage === "closed"
          ? "Full Paid"
          : b.stage === "deposit_paid"
            ? "Deposit Paid"
            : "Not Paid"

      return {
        ...b,
        jobNumber: b.bookingNumber,
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
        customerEmail: customer?.email || "",
        supplier,
        paymentStatus,
        lifecycleStatus: getPipelineStageLabel(b.stage),
        totalPaid,
        totalQuote,
      }
    })

  // Apply filters
  const filtered = bookings.filter((booking: any) => {
    // Search filter (job number, customer name, email)
    const matchSearch =
      !search ||
      booking.bookingNumber.toLowerCase().includes(search.toLowerCase()) ||
      booking.customerName.toLowerCase().includes(search.toLowerCase()) ||
      booking.customerEmail.toLowerCase().includes(search.toLowerCase())

    // Supplier filter
    const matchSupplier = supplierFilter === "all" || booking.supplier === supplierFilter

    // Payment status filter
    const matchPaymentStatus =
      paymentStatusFilter === "all" || booking.paymentStatus === paymentStatusFilter

    // Consultant filter
    const matchConsultant = consultantFilter === "all" || booking.consultant === consultantFilter

    // Created date range filter
    const createdDate = new Date(booking.createdAt)
    const matchCreatedDateFrom = !createdDateFrom || createdDate >= createdDateFrom
    const matchCreatedDateTo = !createdDateTo || createdDate <= createdDateTo

    // Departure date range filter
    const departureDate = booking.departureDate ? new Date(booking.departureDate) : null
    const matchDepartureDateFrom = !departureDateFrom || (departureDate && departureDate >= departureDateFrom)
    const matchDepartureDateTo = !departureDateTo || (departureDate && departureDate <= departureDateTo)

    return (
      matchSearch &&
      matchSupplier &&
      matchPaymentStatus &&
      matchConsultant &&
      matchCreatedDateFrom &&
      matchCreatedDateTo &&
      matchDepartureDateFrom &&
      matchDepartureDateTo
    )
  })

  const hasActiveFilters =
    supplierFilter !== "all" ||
    paymentStatusFilter !== "all" ||
    consultantFilter !== "all" ||
    createdDateFrom ||
    createdDateTo ||
    departureDateFrom ||
    departureDateTo

  const clearFilters = () => {
    setSupplierFilter("all")
    setPaymentStatusFilter("all")
    setConsultantFilter("all")
    setCreatedDateFrom(undefined)
    setCreatedDateTo(undefined)
    setDepartureDateFrom(undefined)
    setDepartureDateTo(undefined)
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Bookings</h1>
          <p className="text-base text-muted-foreground mt-2">
            Jobs from quote sent onward, excluding open enquiries and lost jobs
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-2">
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by job number, customer name, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {/* Supplier Filter */}
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  <SelectItem value="Rovos Rail">Rovos Rail</SelectItem>
                  <SelectItem value="Blue Train">Blue Train</SelectItem>
                </SelectContent>
              </Select>

              {/* Payment Status Filter */}
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Deposit Paid">Deposit Paid</SelectItem>
                  <SelectItem value="Full Paid">Full Paid</SelectItem>
                </SelectContent>
              </Select>

              {/* Consultant Filter */}
              <Select value={consultantFilter} onValueChange={(v) => setConsultantFilter(v as any)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Consultant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Consultants</SelectItem>
                  {CONSULTANTS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.key} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Created Date Range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 justify-start text-left font-normal">
                    <CalendarCheck className="mr-2 h-4 w-4" />
                    {createdDateFrom || createdDateTo ? (
                      <span className="text-xs">
                        {createdDateFrom && formatDisplayDate(createdDateFrom)}
                        {createdDateFrom && createdDateTo && " - "}
                        {createdDateTo && formatDisplayDate(createdDateTo)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Created Date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="start">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">From</label>
                      <Calendar
                        mode="single"
                        selected={createdDateFrom}
                        onSelect={setCreatedDateFrom}
                        className="rounded-md border"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">To</label>
                      <Calendar
                        mode="single"
                        selected={createdDateTo}
                        onSelect={setCreatedDateTo}
                        className="rounded-md border"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Departure Date Range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 justify-start text-left font-normal">
                    <CalendarCheck className="mr-2 h-4 w-4" />
                    {departureDateFrom || departureDateTo ? (
                      <span className="text-xs">
                        {departureDateFrom && formatDisplayDate(departureDateFrom)}
                        {departureDateFrom && departureDateTo && " - "}
                        {departureDateTo && formatDisplayDate(departureDateTo)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Departure Date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="start">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">From</label>
                      <Calendar
                        mode="single"
                        selected={departureDateFrom}
                        onSelect={setDepartureDateFrom}
                        className="rounded-md border"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">To</label>
                      <Calendar
                        mode="single"
                        selected={departureDateTo}
                        onSelect={setDepartureDateTo}
                        className="rounded-md border"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {filtered.length} of {bookings.length} bookings
                </p>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                  <X className="w-4 h-4" />
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} {filtered.length === 1 ? "booking" : "bookings"}
        </p>
      </div>

      {/* Bookings List */}
      <div className="space-y-3">
        {filtered.map((booking: any) => (
          <Link key={booking.id} href={`/app/bookings/${booking.id}`}>
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CalendarCheck className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-semibold text-foreground">
                          {booking.bookingNumber}
                        </span>
                        {booking.consultant && (
                          <Badge variant="default" className="text-xs font-bold">
                            {booking.consultant}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            booking.paymentStatus === "Full Paid"
                              ? "default"
                              : booking.paymentStatus === "Deposit Paid"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-xs"
                        >
                          {booking.lifecycleStatus}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {booking.supplier}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground font-medium mb-1">
                        {booking.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {booking.customerEmail}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{booking.direction || "No direction specified"}</span>
                        {booking.departureDate && (
                          <>
                            <span>•</span>
                            <span>
                              Departs:{" "}
                              {formatDisplayDate(booking.departureDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      R {booking.totalPaid.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      of R {booking.totalQuote.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {formatDisplayDate(booking.createdAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center space-y-2">
                <CalendarCheck className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-base font-medium text-foreground">No bookings found</p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Try adjusting your filters to see more results"
                    : "No jobs have moved beyond enquiry yet"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
