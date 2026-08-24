"use client"

import { useData, useAssignableUsers } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarCheck } from "lucide-react"
import Link from "next/link"
import { getPipelineStageLabel } from "@/lib/types"
import { FacetedFilter } from "@/components/ui/faceted-filter"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ListFilterBar, type FilterChip } from "@/components/list-filter-bar"
import { useFilterParams } from "@/hooks/use-filter-params"
import { matchesSearch, isWithinDateRange } from "@/lib/list-filters"
import { formatDisplayDate, formatDisplayDateShort } from "@/lib/date-format"
import { isVisibleInBookings } from "@/lib/booking-visibility"
import { BASE_CURRENCY, formatMoney } from "@/lib/money"

const PAYMENT_STATUS_OPTIONS = [
  { value: "Not Paid", label: "Not Paid" },
  { value: "Deposit Paid", label: "Deposit Paid" },
  { value: "Full Paid", label: "Full Paid" },
]

const DEFAULT_FILTERS = {
  q: "",
  supplier: "",
  payment: "",
  consultant: "",
  createdFrom: "",
  createdTo: "",
  departFrom: "",
  departTo: "",
}

export default function BookingsPage() {
  const { data, isLoading, error, mutate } = useData(["bookings", "customers", "payments", "quotes"])
  const { data: assignableData } = useAssignableUsers()
  const { values, setValue, clear, hasActive } = useFilterParams(DEFAULT_FILTERS)

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

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-5 max-w-7xl mx-auto">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
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

      const supplier = b.supplierName?.trim() || null

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

  const supplierOptions = Array.from(
    new Set(bookings.map((b: any) => b.supplier).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b))

  const consultantOptions = [
    { value: "unassigned", label: "Unassigned" },
    ...(assignableData?.users ?? []).map((u: any) => ({ value: u.userId, label: u.name })),
  ]

  // Apply filters
  const filtered = bookings.filter((booking: any) => {
    const matchSearch = matchesSearch(
      [booking.bookingNumber, booking.customerName, booking.customerEmail],
      values.q,
    )

    const matchSupplier = !values.supplier || booking.supplier === values.supplier
    const matchPayment = !values.payment || booking.paymentStatus === values.payment
    const matchConsultant =
      !values.consultant ||
      (values.consultant === "unassigned"
        ? !booking.assignedSalespersonId
        : booking.assignedSalespersonId === values.consultant)

    const matchCreated = isWithinDateRange(booking.createdAt, values.createdFrom, values.createdTo)
    const matchDepart = isWithinDateRange(booking.departureDate, values.departFrom, values.departTo)

    return (
      matchSearch && matchSupplier && matchPayment && matchConsultant && matchCreated && matchDepart
    )
  })

  const hasActiveFilters = hasActive
  const clearFilters = clear

  const chips: FilterChip[] = []
  if (values.supplier) {
    chips.push({ key: "supplier", label: `Supplier: ${values.supplier}`, onRemove: () => setValue("supplier", undefined) })
  }
  if (values.payment) {
    chips.push({ key: "payment", label: `Payment: ${values.payment}`, onRemove: () => setValue("payment", undefined) })
  }
  if (values.consultant) {
    const label = consultantOptions.find((o) => o.value === values.consultant)?.label ?? values.consultant
    chips.push({ key: "consultant", label: `Consultant: ${label}`, onRemove: () => setValue("consultant", undefined) })
  }
  if (values.createdFrom || values.createdTo) {
    chips.push({
      key: "created",
      label: `Created: ${values.createdFrom ? formatDisplayDateShort(values.createdFrom) : "…"} – ${values.createdTo ? formatDisplayDateShort(values.createdTo) : "…"}`,
      onRemove: () => {
        setValue("createdFrom", undefined)
        setValue("createdTo", undefined)
      },
    })
  }
  if (values.departFrom || values.departTo) {
    chips.push({
      key: "depart",
      label: `Departs: ${values.departFrom ? formatDisplayDateShort(values.departFrom) : "…"} – ${values.departTo ? formatDisplayDateShort(values.departTo) : "…"}`,
      onRemove: () => {
        setValue("departFrom", undefined)
        setValue("departTo", undefined)
      },
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Bookings</h1>
          <p className="text-base text-muted-foreground mt-2">
            Jobs from quote sent onward, excluding open enquiries and lost jobs
          </p>
          {/* Spans every booking, so per-booking currencies can't be shown without the column
              becoming an apples-to-oranges mix. Stated in the base currency instead. */}
          <p className="text-xs text-muted-foreground mt-1">All amounts in {BASE_CURRENCY}</p>
        </div>
      </div>

      <ListFilterBar
        searchValue={values.q}
        onSearchChange={(v) => setValue("q", v, { debounceMs: 250 })}
        searchPlaceholder="Search by job number, customer name, or email..."
        chips={chips}
        onClearAll={clearFilters}
        resultCount={filtered.length}
        totalCount={bookings.length}
        noun="booking"
        hasActiveFilters={hasActiveFilters}
      >
        <FacetedFilter
          label="Supplier"
          options={supplierOptions.map((name) => ({ value: name, label: name }))}
          value={values.supplier || undefined}
          onChange={(v) => setValue("supplier", v)}
        />
        <FacetedFilter
          label="Payment"
          options={PAYMENT_STATUS_OPTIONS}
          value={values.payment || undefined}
          onChange={(v) => setValue("payment", v)}
        />
        <FacetedFilter
          label="Consultant"
          options={consultantOptions}
          value={values.consultant || undefined}
          onChange={(v) => setValue("consultant", v)}
        />
        <DateRangePicker
          placeholder="Created date"
          value={{ from: values.createdFrom || undefined, to: values.createdTo || undefined }}
          onChange={(range) => {
            setValue("createdFrom", range.from)
            setValue("createdTo", range.to)
          }}
        />
        <DateRangePicker
          placeholder="Departure date"
          value={{ from: values.departFrom || undefined, to: values.departTo || undefined }}
          onChange={(range) => {
            setValue("departFrom", range.from)
            setValue("departTo", range.to)
          }}
        />
      </ListFilterBar>

      {/* Bookings List */}
      <div className="space-y-3">
        {filtered.map((booking: any) => (
          <Link key={booking.id} href={`/app/bookings/${booking.id}`}>
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CalendarCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-base font-semibold text-foreground">
                          {booking.bookingNumber}
                        </span>
                        {booking.consultant && (
                          <Badge variant="default" className="text-xs font-bold">
                            {booking.consultant}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {booking.lifecycleStatus}
                        </Badge>
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
                          {booking.paymentStatus}
                        </Badge>
                        {booking.supplier && (
                          <Badge variant="outline" className="text-xs">
                            {booking.supplier}
                          </Badge>
                        )}
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
                      {formatMoney(booking.totalPaid)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      of {formatMoney(booking.totalQuote)}
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
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck className="w-6 h-6" />
              </EmptyMedia>
              <EmptyTitle>No bookings found</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "No bookings match your filters."
                  : "No jobs have moved beyond enquiry yet."}
              </EmptyDescription>
            </EmptyHeader>
            {hasActiveFilters ? (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear all filters
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </div>
    </div>
  )
}
