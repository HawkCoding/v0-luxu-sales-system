"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { AlertCircle, Search, Globe, Filter, X, UserPlus, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { CONSULTANTS, type ConsultantAbbreviation } from "@/lib/types"
import { formatDisplayDate } from "@/lib/date-format"
import { useRole } from "@/lib/role-context"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
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

function getCustomerIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/app\/customers\/([^/]+)\/?$/)
  return match ? match[1] : null
}

export default function CustomersPage() {
  const { data, isLoading, error, mutate } = useAllData()
  const { can } = useRole()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const [consultantFilter, setConsultantFilter] = useState<"all" | ConsultantAbbreviation>("all")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [createdDateFrom, setCreatedDateFrom] = useState<Date | undefined>(undefined)
  const [createdDateTo, setCreatedDateTo] = useState<Date | undefined>(undefined)
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

  useEffect(() => {
    const searchFromQuery = searchParams.get("search")?.trim() ?? ""
    if (searchFromQuery.length > 0) setSearch(searchFromQuery)
  }, [searchParams])

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
    // Search filter (name, email, phone)
    const matchSearch = !search || [c.firstName, c.lastName, c.email, c.phone, c.country]
      .some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))

    // Consultant filter
    const matchConsultant = consultantFilter === "all" || c.consultants.includes(consultantFilter)

    // Supplier filter
    const matchSupplier = supplierFilter === "all" || c.suppliers.includes(supplierFilter)

    // Created date range filter
    const createdDate = new Date(c.createdAt)
    const matchCreatedDateFrom = !createdDateFrom || createdDate >= createdDateFrom
    const matchCreatedDateTo = !createdDateTo || createdDate <= createdDateTo

    return matchSearch && matchConsultant && matchSupplier && matchCreatedDateFrom && matchCreatedDateTo
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
  }, [search, consultantFilter, supplierFilter, createdDateFrom, createdDateTo])

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

  const hasActiveFilters = search || consultantFilter !== "all" || supplierFilter !== "all" || 
    createdDateFrom || createdDateTo

  const clearFilters = () => {
    setSearch("")
    setConsultantFilter("all")
    setSupplierFilter("all")
    setCreatedDateFrom(undefined)
    setCreatedDateTo(undefined)
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

      {/* Filter Bar */}
      <Card className="border-2 border-primary/10 bg-primary/5">
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Filter className="w-4 h-4" />
                Filters
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Clear filters
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Consultant Filter */}
              <div>
                <Select value={consultantFilter} onValueChange={(v) => setConsultantFilter(v as any)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Consultant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Consultants</SelectItem>
                    {CONSULTANTS.map(c => (
                      <SelectItem key={c.key} value={c.key}>{c.key} - {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Supplier Filter */}
              <div>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {supplierOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date Range Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Created Date Range */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Created Date Range
                </label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-xs flex-1 justify-start">
                        {createdDateFrom ? formatDisplayDate(createdDateFrom) : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={createdDateFrom}
                        onSelect={setCreatedDateFrom}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">-</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-xs flex-1 justify-start">
                        {createdDateTo ? formatDisplayDate(createdDateTo) : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={createdDateTo}
                        onSelect={setCreatedDateTo}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Cards */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center space-y-2">
                <Search className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-base font-medium text-foreground">No customers found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters or search criteria
                </p>
              </div>
            </CardContent>
          </Card>
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
                        {c.firstName[0]}{c.lastName[0]}
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
