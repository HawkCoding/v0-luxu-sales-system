"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRight, CalendarCheck, FileText, type LucideIcon } from "lucide-react"
import { useAssignableUsers, useData } from "@/lib/use-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { FacetedFilter } from "@/components/ui/faceted-filter"
import { Skeleton } from "@/components/ui/skeleton"
import { ListFilterBar, type FilterChip } from "@/components/list-filter-bar"
import { useFilterParams } from "@/hooks/use-filter-params"
import { RECORD_SECTIONS } from "@/lib/booking-visibility"
import {
  isPaymentStatus,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "@/lib/booking-payment-status"
import { formatDisplayDate, formatDisplayDateShort } from "@/lib/date-format"
import { buildSectionRows, type JobListSection, type JobSectionRow } from "@/lib/job-section-rows"
import { isWithinDateRange, matchesSearch } from "@/lib/list-filters"
import { formatMoney } from "@/lib/money"
import { getPipelineStageLabel } from "@/lib/types"
import { cn } from "@/lib/utils"

type SectionFilters = {
  q: string
  status: string
  supplier: string
  /** Bookings only — Quotes leaves it out so a stray `?payment=` can't filter a page with no facet. */
  payment?: string
  consultant: string
  createdFrom: string
  createdTo: string
  departFrom: string
  departTo: string
}

// Module-level so `useFilterParams` sees a stable defaults object across renders.
const QUOTES_DEFAULT_FILTERS: SectionFilters = {
  q: "",
  status: "",
  supplier: "",
  consultant: "",
  createdFrom: "",
  createdTo: "",
  departFrom: "",
  departTo: "",
}

const BOOKINGS_DEFAULT_FILTERS: SectionFilters = { ...QUOTES_DEFAULT_FILTERS, payment: "" }

const DEFAULT_FILTERS: Record<JobListSection, SectionFilters> = {
  quotes: QUOTES_DEFAULT_FILTERS,
  bookings: BOOKINGS_DEFAULT_FILTERS,
}

interface SectionCopy {
  icon: LucideIcon
  subtitle: string
  emptyTitle: string
  emptyDescription: string
}

const SECTION_COPY: Record<JobListSection, SectionCopy> = {
  quotes: {
    icon: FileText,
    subtitle: "Quotes sent to clients, waiting for their go-ahead and deposit",
    emptyTitle: "No open quotes",
    emptyDescription: "An enquiry moves here once its quote is sent to the client.",
  },
  bookings: {
    icon: CalendarCheck,
    subtitle: "Confirmed trips — the client's deposit has been received",
    emptyTitle: "No bookings yet",
    emptyDescription: "A quote becomes a booking when it reaches Deposit Paid.",
  },
}

const PAYMENT_BADGE_VARIANT: Record<PaymentStatus, "default" | "secondary" | "outline"> = {
  not_paid: "outline",
  part_paid: "secondary",
  deposit_paid: "secondary",
  paid_in_full: "default",
  refund_or_credit: "outline",
}

type FacetKey = "status" | "payment"

function matchesFilters(row: JobSectionRow, values: SectionFilters, skip?: FacetKey): boolean {
  if (!matchesSearch([row.bookingNumber, row.customerName, row.customerEmail], values.q)) return false
  if (skip !== "status" && values.status && row.canonicalStage !== values.status) return false
  if (skip !== "payment" && values.payment && row.paymentStatus !== values.payment) return false
  if (values.supplier && row.supplier !== values.supplier) return false
  if (values.consultant) {
    const matchesConsultant =
      values.consultant === "unassigned"
        ? !row.assignedSalespersonId
        : row.assignedSalespersonId === values.consultant
    if (!matchesConsultant) return false
  }
  if (!isWithinDateRange(row.createdAt, values.createdFrom, values.createdTo)) return false
  return isWithinDateRange(row.departureDate, values.departFrom, values.departTo)
}

function formatRange(from: string | undefined, to: string | undefined): string {
  return `${from ? formatDisplayDateShort(from) : "…"} – ${to ? formatDisplayDateShort(to) : "…"}`
}

interface JobSectionListProps {
  section: JobListSection
}

/**
 * The Quotes and Bookings list pages. Both read the same `/api/data` payload (one shared SWR
 * cache entry) and differ only in which records they show — see `lib/booking-visibility.ts` — and
 * in the money column: a quote shows its total and when it went out, a booking what's paid and
 * what's still owed.
 */
export function JobSectionList({ section }: JobSectionListProps) {
  const { data, isLoading, error, mutate } = useData(["bookings", "customers", "payments", "quotes"])
  const { data: assignableData } = useAssignableUsers()
  const { values, setValue, clear, hasActive } = useFilterParams(DEFAULT_FILTERS[section])

  const config = RECORD_SECTIONS[section]
  const copy = SECTION_COPY[section]
  const SectionIcon = copy.icon
  const nounPlural = config.label.toLowerCase()

  const rows = useMemo(() => (data ? buildSectionRows(data, section, new Date()) : []), [data, section])

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="text-center space-y-2">
              <SectionIcon className="w-12 h-12 text-muted-foreground/40 mx-auto" aria-hidden="true" />
              <p className="text-base font-medium text-foreground">Failed to load {nounPlural}</p>
              <p className="text-sm text-muted-foreground">
                Something went wrong while loading {nounPlural}. Try again.
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
      <div className="p-6 space-y-5 max-w-7xl mx-auto" aria-busy="true">
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

  const supplierOptions = Array.from(new Set(rows.map((row) => row.supplier).filter((name): name is string => Boolean(name))))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }))

  const consultantOptions = [
    { value: "unassigned", label: "Unassigned" },
    ...(assignableData?.users ?? []).map((user) => ({ value: user.userId, label: user.name })),
  ]

  // Facet counts honour every other active filter, so each option shows what clicking it yields.
  const rowsForStatusCounts = rows.filter((row) => matchesFilters(row, values, "status"))
  const statusOptions = config.stages.map((stage) => ({
    value: stage,
    label: getPipelineStageLabel(stage),
    count: rowsForStatusCounts.filter((row) => row.canonicalStage === stage).length,
  }))

  const rowsForPaymentCounts = rows.filter((row) => matchesFilters(row, values, "payment"))
  const paymentOptions = PAYMENT_STATUSES.map((status) => ({
    value: status,
    label: PAYMENT_STATUS_LABELS[status],
    count: rowsForPaymentCounts.filter((row) => row.paymentStatus === status).length,
  })).filter((option) => option.count > 0 || option.value === values.payment)

  const filtered = rows.filter((row) => matchesFilters(row, values))

  const chips: FilterChip[] = []
  if (values.status) {
    chips.push({
      key: "status",
      label: `Status: ${getPipelineStageLabel(values.status)}`,
      onRemove: () => setValue("status", undefined),
    })
  }
  if (values.payment) {
    const label = isPaymentStatus(values.payment) ? PAYMENT_STATUS_LABELS[values.payment] : values.payment
    chips.push({ key: "payment", label: `Payment: ${label}`, onRemove: () => setValue("payment", undefined) })
  }
  if (values.supplier) {
    chips.push({ key: "supplier", label: `Supplier: ${values.supplier}`, onRemove: () => setValue("supplier", undefined) })
  }
  if (values.consultant) {
    const label = consultantOptions.find((o) => o.value === values.consultant)?.label ?? values.consultant
    chips.push({ key: "consultant", label: `Consultant: ${label}`, onRemove: () => setValue("consultant", undefined) })
  }
  if (values.createdFrom || values.createdTo) {
    chips.push({
      key: "created",
      label: `Created: ${formatRange(values.createdFrom, values.createdTo)}`,
      onRemove: () => {
        setValue("createdFrom", undefined)
        setValue("createdTo", undefined)
      },
    })
  }
  if (values.departFrom || values.departTo) {
    chips.push({
      key: "depart",
      label: `Departs: ${formatRange(values.departFrom, values.departTo)}`,
      onRemove: () => {
        setValue("departFrom", undefined)
        setValue("departTo", undefined)
      },
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">{config.label}</h1>
        <p className="text-base text-muted-foreground mt-2">{copy.subtitle}</p>
      </div>

      <ListFilterBar
        searchValue={values.q}
        onSearchChange={(v) => setValue("q", v, { debounceMs: 250 })}
        searchPlaceholder="Search by job number, customer name, or email..."
        chips={chips}
        onClearAll={clear}
        resultCount={filtered.length}
        totalCount={rows.length}
        noun={config.noun}
        hasActiveFilters={hasActive}
      >
        <FacetedFilter
          label="Status"
          options={statusOptions}
          value={values.status || undefined}
          onChange={(v) => setValue("status", v)}
        />
        {section === "bookings" ? (
          <FacetedFilter
            label="Payment"
            options={paymentOptions}
            value={values.payment || undefined}
            onChange={(v) => setValue("payment", v)}
          />
        ) : null}
        <FacetedFilter
          label="Supplier"
          options={supplierOptions}
          value={values.supplier || undefined}
          onChange={(v) => setValue("supplier", v)}
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

      <div className="space-y-3">
        {filtered.map((row) => (
          <JobSectionCard key={row.id} row={row} section={section} icon={SectionIcon} />
        ))}

        {filtered.length === 0 && (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SectionIcon className="w-6 h-6" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{hasActive ? `No ${nounPlural} found` : copy.emptyTitle}</EmptyTitle>
              <EmptyDescription>
                {hasActive ? `No ${nounPlural} match your filters.` : copy.emptyDescription}
              </EmptyDescription>
            </EmptyHeader>
            {hasActive ? (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={clear}>
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

interface JobSectionCardProps {
  row: JobSectionRow
  section: JobListSection
  icon: LucideIcon
}

function JobSectionCard({ row, section, icon: Icon }: JobSectionCardProps) {
  // The badge only shows what the stage badge doesn't already say. On Quotes that's any money in
  // ahead of the stage; on Bookings the stage already reads Deposit Paid / Paid in Full, so only a
  // refund or credit adds anything.
  const showPaymentBadge =
    section === "quotes" ? row.paymentStatus !== "not_paid" : row.paymentStatus === "refund_or_credit"

  return (
    <Link
      href={row.href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-base font-semibold text-foreground">{row.bookingNumber}</span>
                  {row.consultant && (
                    <Badge variant="default" className="text-xs font-bold">
                      {row.consultant}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {row.stageLabel}
                  </Badge>
                  {showPaymentBadge && (
                    <Badge variant={PAYMENT_BADGE_VARIANT[row.paymentStatus]} className="text-xs">
                      {PAYMENT_STATUS_LABELS[row.paymentStatus]}
                    </Badge>
                  )}
                  {row.supplier && (
                    <Badge variant="outline" className="text-xs max-w-full truncate">
                      {row.supplier}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground font-medium mb-1 break-words">{row.customerName}</p>
                {row.customerEmail ? (
                  <p className="text-xs text-muted-foreground mb-2 truncate">{row.customerEmail}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{row.direction || "No direction specified"}</span>
                  {row.departureDate && (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>Departs: {formatDisplayDate(row.departureDate)}</span>
                    </>
                  )}
                </div>
                {row.nextStep ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-foreground">
                    <ArrowRight className="mt-px h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
                    <span>{row.nextStep}</span>
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-1 pl-13 sm:pl-0 sm:items-end sm:text-right flex-shrink-0">
              {section === "quotes" ? <QuoteFigures row={row} /> : <BookingFigures row={row} />}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function QuoteFigures({ row }: { row: JobSectionRow }) {
  return (
    <>
      {row.quoteTotal === null ? (
        <p className="text-sm text-muted-foreground">No priced quote</p>
      ) : (
        <p className="text-sm font-semibold text-foreground">{formatMoney(row.quoteTotal, row.currency)}</p>
      )}
      <p className="text-xs text-muted-foreground">{row.sentLabel ?? "Not sent yet"}</p>
      {row.totalPaid !== 0 ? (
        <p className="text-xs text-muted-foreground">Paid {formatMoney(row.totalPaid, row.currency)}</p>
      ) : null}
    </>
  )
}

function BookingFigures({ row }: { row: JobSectionRow }) {
  return (
    <>
      <p className="text-sm font-semibold text-foreground">
        <span className="sr-only">Paid </span>
        {formatMoney(row.totalPaid, row.currency)}
      </p>
      {row.quoteTotal === null ? (
        <p className="text-xs text-muted-foreground">No priced quote</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">of {formatMoney(row.quoteTotal, row.currency)}</p>
          <p className={cn("text-xs", row.balance ? "font-medium text-foreground" : "text-muted-foreground")}>
            Balance {formatMoney(row.balance ?? 0, row.currency)}
          </p>
        </>
      )}
    </>
  )
}
