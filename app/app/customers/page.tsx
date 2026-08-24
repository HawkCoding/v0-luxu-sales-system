"use client"

import { useData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { AlertCircle, Search, Globe, UserPlus, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { CONSULTANTS } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import Link from "next/link"
import { FacetedFilter } from "@/components/ui/faceted-filter"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ListFilterBar, type FilterChip } from "@/components/list-filter-bar"
import { useFilterParams } from "@/hooks/use-filter-params"
import { matchesSearch, isWithinDateRange } from "@/lib/list-filters"
import { formatDisplayDateShort } from "@/lib/date-format"
import { CustomerDetailView } from "@/components/customer-detail-view"
import { CreateCustomerDialog } from "@/components/create-customer-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

const PAGE_SIZE = 100

// Key names match the pre-existing `?search=` link-in param other pages/emails already use.
const DEFAULT_FILTERS = {
  search: "",
  consultant: "",
  supplier: "",
  createdFrom: "",
  createdTo: "",
}

function getCustomerIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/app\/customers\/([^/]+)\/?$/)
  return match ? match[1] : null
}

export default function CustomersPage() {
  const { data, isLoading, error, mutate } = useData(["bookings", "customers"])
  const { can } = useRole()
  const { values, setValue, clear, hasActive } = useFilterParams(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const canEditCustomers = can("edit:customers")

  useEffect(() => {
    const handlePopState = () => {
      setSelectedCustomerId(getCustomerIdFromPath(window.location.pathname))
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const bookings = data?.bookings ?? []
  const customers = (data?.customers ?? []).map((c: any) => {
    const customerBookings = bookings.filter((b: any) => b.customerId === c.id)
    const jobCount = customerBookings.length

    const consultants = [...new Set(customerBookings.map((b: any) => b.consultant).filter(Boolean))]

    const suppliers = new Set<string>()
    customerBookings.forEach((b: any) => {
      const name = b.supplierName?.trim()
      if (name) suppliers.add(name)
    })

    return {
      ...c,
      jobCount,
      consultants,
      suppliers: Array.from(suppliers),
      jobs: customerBookings.map((b: any) => ({ ...b, jobNumber: b.bookingNumber })),
    }
  })

  const supplierOptions = (
    Array.from(
      new Set(customers.flatMap((c: any) => ((c.suppliers as string[] | undefined) ?? []))),
    ) as string[]
  ).sort((a, b) => a.localeCompare(b))

  const filtered = customers.filter((c: any) => {
    const matchSearch = matchesSearch([c.firstName, c.lastName, c.email, c.phone, c.country], values.search)
    const matchConsultant = !values.consultant || c.consultants.includes(values.consultant)
    const matchSupplier = !values.supplier || c.suppliers.includes(values.supplier)
    const matchCreated = isWithinDateRange(c.createdAt, values.createdFrom, values.createdTo)

    return matchSearch && matchConsultant && matchSupplier && matchCreated
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const paginatedCustomers = filtered.slice(startIndex, endIndex)
  const pageStartDisplay = filtered.length === 0 ? 0 : startIndex + 1
  const pageEndDisplay = filtered.length === 0 ? 0 : Math.min(endIndex, filtered.length)
  const pageWindowStart = Math.max(2, currentPage - 1)
  const pageWindowEnd = Math.min(totalPages - 1, currentPage + 1)

  const visibleMiddlePages =
    pageWindowStart <= pageWindowEnd
      ? Array.from(
          { length: pageWindowEnd - pageWindowStart + 1 },
          (_, index) => pageWindowStart + index,
        )
      : []
  const showLeftEllipsis = pageWindowStart > 2
  const showRightEllipsis = pageWindowEnd < totalPages - 1

  useEffect(() => {
    setPage(1)
  }, [values.search, values.consultant, values.supplier, values.createdFrom, values.createdTo])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const openCustomerModal = (customerId: string) => {
    setSelectedCustomerId(customerId)
    const nextPath = `/app/customers/${customerId}`
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath)
    }
  }

  const closeCustomerModal = () => {
    if (!selectedCustomerId) return
    window.history.back()
  }

  const handleCustomerCreated = (customerId: string) => {
    mutate()
    openCustomerModal(customerId)
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load customers</AlertTitle>
          <AlertDescription>
            Refresh the page or try again later.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) return
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const hasActiveFilters = hasActive
  const clearFilters = clear

  const consultantOptions = CONSULTANTS.map((c) => ({ value: c.key, label: `${c.key} - ${c.name}` }))

  const chips: FilterChip[] = []
  if (values.consultant) {
    const label = consultantOptions.find((o) => o.value === values.consultant)?.label ?? values.consultant
    chips.push({ key: "consultant", label: `Consultant: ${label}`, onRemove: () => setValue("consultant", undefined) })
  }
  if (values.supplier) {
    chips.push({ key: "supplier", label: `Supplier: ${values.supplier}`, onRemove: () => setValue("supplier", undefined) })
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

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Customers</h1>
          <p className="text-base text-muted-foreground mt-2">
            Showing {pageStartDisplay}-{pageEndDisplay} of {filtered.length} customers (Page{" "}
            {currentPage} of {totalPages})
          </p>
        </div>
        {canEditCustomers ? (
          <div className="flex-shrink-0">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              New Customer
            </Button>
          </div>
        ) : null}
      </div>

      <ListFilterBar
        searchValue={values.search}
        onSearchChange={(v) => setValue("search", v, { debounceMs: 250 })}
        searchPlaceholder="Search name, email, or phone..."
        chips={chips}
        onClearAll={clearFilters}
        resultCount={filtered.length}
        totalCount={customers.length}
        noun="customer"
        hasActiveFilters={hasActiveFilters}
      >
        <FacetedFilter
          label="Consultant"
          options={consultantOptions}
          value={values.consultant || undefined}
          onChange={(v) => setValue("consultant", v)}
        />
        <FacetedFilter
          label="Supplier"
          options={supplierOptions.map((name) => ({ value: name, label: name }))}
          value={values.supplier || undefined}
          onChange={(v) => setValue("supplier", v)}
        />
        <DateRangePicker
          placeholder="Created date"
          value={{ from: values.createdFrom || undefined, to: values.createdTo || undefined }}
          onChange={(range) => {
            setValue("createdFrom", range.from)
            setValue("createdTo", range.to)
          }}
        />
      </ListFilterBar>

      {/* Customer Cards */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search className="w-6 h-6" />
              </EmptyMedia>
              <EmptyTitle>No customers found</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "No customers match your filters."
                  : "No customers yet."}
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

        {paginatedCustomers.map((c: any) => (
          <Link
            key={c.id}
            href={`/app/customers/${c.id}`}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return
              }

              event.preventDefault()
              openCustomerModal(c.id)
            }}
          >
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-inter)" }}>
                        {c.firstName?.[0]}{c.lastName?.[0]}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground">{c.firstName} {c.lastName}</p>
                        {c.vipStatus ? (
                          <Badge variant="secondary" className="text-xs h-5 px-1.5 gap-1">
                            <Star className="w-3 h-3" />
                            VIP
                          </Badge>
                        ) : null}
                        {c.isRepeatClient ? (
                          <Badge variant="outline" className="text-xs h-5 px-1.5">
                            Repeat
                          </Badge>
                        ) : null}
                        {c.consultants.length > 0 && (
                          <div className="flex items-center gap-1">
                            {c.consultants.map((cons: string) => (
                              <Badge key={cons} variant="default" className="text-xs h-5 px-1.5 font-bold">
                                {cons}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{c.email} • {c.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.country && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Globe className="w-3 h-3" /> {c.country}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">{c.jobCount} booking{c.jobCount !== 1 ? "s" : ""}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={currentPage === 1}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  handlePageChange(currentPage - 1)
                }}
              />
            </PaginationItem>

            <PaginationItem>
              <PaginationLink
                href="#"
                isActive={currentPage === 1}
                onClick={(event) => {
                  event.preventDefault()
                  handlePageChange(1)
                }}
              >
                1
              </PaginationLink>
            </PaginationItem>

            {showLeftEllipsis && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {visibleMiddlePages.map((pageNumber) => (
              <PaginationItem key={pageNumber}>
                <PaginationLink
                  href="#"
                  isActive={currentPage === pageNumber}
                  onClick={(event) => {
                    event.preventDefault()
                    handlePageChange(pageNumber)
                  }}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            ))}

            {showRightEllipsis && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {totalPages > 1 && (
              <PaginationItem>
                <PaginationLink
                  href="#"
                  isActive={currentPage === totalPages}
                  onClick={(event) => {
                    event.preventDefault()
                    handlePageChange(totalPages)
                  }}
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={currentPage === totalPages}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  handlePageChange(currentPage + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <Dialog open={Boolean(selectedCustomerId)} onOpenChange={(open) => !open && closeCustomerModal()}>
        <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Customer details</DialogTitle>
            <DialogDescription>
              View customer details, bookings, and notes.
            </DialogDescription>
          </DialogHeader>
          {selectedCustomerId ? (
            <CustomerDetailView customerId={selectedCustomerId} presentation="modal" />
          ) : null}
        </DialogContent>
      </Dialog>

      {canEditCustomers ? (
        <CreateCustomerDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={handleCustomerCreated}
        />
      ) : null}
    </div>
  )
}
