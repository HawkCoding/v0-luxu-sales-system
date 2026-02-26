"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Search, Globe, Filter, X } from "lucide-react"
import { useState } from "react"
import { CONSULTANTS, type ConsultantAbbreviation } from "@/lib/types"
import { format } from "date-fns"
import { CustomerImportDialogTrigger } from "@/components/customer-import-dialog"

export default function CustomersPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")
  const [consultantFilter, setConsultantFilter] = useState<"all" | ConsultantAbbreviation>("all")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [createdDateFrom, setCreatedDateFrom] = useState<Date | undefined>(undefined)
  const [createdDateTo, setCreatedDateTo] = useState<Date | undefined>(undefined)

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const customers = data.customers.map((c: any) => {
    const customerBookings = data.bookings.filter((b: any) => b.customerId === c.id)
    const jobCount = customerBookings.length

    const consultants = [...new Set(customerBookings.map((b: any) => b.consultant).filter(Boolean))]

    const suppliers = new Set<string>()
    customerBookings.forEach((b: any) => {
      if (b.direction) {
        if (b.direction.toLowerCase().includes("blue")) {
          suppliers.add("Blue Train")
        } else {
          suppliers.add("Rovos Rail")
        }
      }
    })

    return {
      ...c,
      jobCount,
      consultants,
      suppliers: Array.from(suppliers),
      jobs: customerBookings.map((b: any) => ({ ...b, jobNumber: b.bookingNumber })),
    }
  })

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
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Customers</h1>
          <p className="text-base text-muted-foreground mt-2">
            {filtered.length} of {customers.length} customers
          </p>
        </div>
        <CustomerImportDialogTrigger />
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
                    <SelectItem value="Rovos Rail">Rovos Rail</SelectItem>
                    <SelectItem value="Blue Train">Blue Train</SelectItem>
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
                        {createdDateFrom ? format(createdDateFrom, "dd/MM/yy") : "From"}
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
                        {createdDateTo ? format(createdDateTo, "dd/MM/yy") : "To"}
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
        
        {filtered.map((c: any) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow">
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
                      {c.consultants.length > 0 && (
                        <div className="flex items-center gap-1">
                          {c.consultants.map((cons: string) => (
                            <Badge key={cons} variant="default" className="text-[10px] h-4 px-1.5 font-bold">
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
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Globe className="w-2.5 h-2.5" /> {c.country}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">{c.jobCount} jobs</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
