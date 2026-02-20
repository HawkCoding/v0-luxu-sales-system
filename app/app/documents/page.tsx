"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { FileText, Search, Filter, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CONSULTANTS, type ConsultantAbbreviation } from "@/lib/types"
import { format } from "date-fns"

export default function DocumentsPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")
  const [docTypeFilter, setDocTypeFilter] = useState("all")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [consultantFilter, setConsultantFilter] = useState<"all" | ConsultantAbbreviation>("all")
  const [generatedDateFrom, setGeneratedDateFrom] = useState<Date | undefined>(undefined)
  const [generatedDateTo, setGeneratedDateTo] = useState<Date | undefined>(undefined)

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const docs = data.documents.map((d: any) => {
    const job = data.jobs.find((j: any) => j.id === d.jobId)
    const customer = data.customers.find((c: any) => c.id === job?.customerId)
    const enquiry = data.enquiries.find((e: any) => e.jobId === d.jobId)
    
    // Infer supplier from enquiry direction
    let supplier = "Rovos Rail" // Default
    if (enquiry?.direction) {
      if (enquiry.direction.toLowerCase().includes('blue')) {
        supplier = "Blue Train"
      }
    }
    
    return {
      ...d,
      jobNumber: job?.jobNumber,
      consultant: job?.consultant,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      customerEmail: customer?.email || "",
      supplier
    }
  }).sort((a: any, b: any) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())

  const filtered = docs.filter((d: any) => {
    // Search filter (job number or customer name/email)
    const matchSearch = !search || 
      [d.jobNumber, d.customerName, d.customerEmail]
        .some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    
    // Document type filter
    const matchDocType = docTypeFilter === "all" || d.kind === docTypeFilter
    
    // Supplier filter
    const matchSupplier = supplierFilter === "all" || d.supplier === supplierFilter
    
    // Consultant filter
    const matchConsultant = consultantFilter === "all" || d.consultant === consultantFilter
    
    // Generated date range filter
    const generatedDate = new Date(d.generatedAt)
    const matchGeneratedDateFrom = !generatedDateFrom || generatedDate >= generatedDateFrom
    const matchGeneratedDateTo = !generatedDateTo || generatedDate <= generatedDateTo
    
    return matchSearch && matchDocType && matchSupplier && matchConsultant && 
      matchGeneratedDateFrom && matchGeneratedDateTo
  })

  const hasActiveFilters = search || docTypeFilter !== "all" || supplierFilter !== "all" || 
    consultantFilter !== "all" || generatedDateFrom || generatedDateTo

  const clearFilters = () => {
    setSearch("")
    setDocTypeFilter("all")
    setSupplierFilter("all")
    setConsultantFilter("all")
    setGeneratedDateFrom(undefined)
    setGeneratedDateTo(undefined)
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Documents</h1>
        <p className="text-base text-muted-foreground mt-2">
          {filtered.length} of {docs.length} documents
        </p>
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
                  placeholder="Search job number or customer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Document Type Filter */}
              <div>
                <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Document Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="quote_pdf">Quote PDF</SelectItem>
                    <SelectItem value="voucher_pdf">Voucher PDF</SelectItem>
                    <SelectItem value="invoice_pdf">Invoice PDF</SelectItem>
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

            {/* Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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

              {/* Generated Date Range */}
              <div className="lg:col-span-3">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Generated Date Range
                </label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-xs flex-1 justify-start">
                        {generatedDateFrom ? format(generatedDateFrom, "dd/MM/yy") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={generatedDateFrom}
                        onSelect={setGeneratedDateFrom}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">-</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-xs flex-1 justify-start">
                        {generatedDateTo ? format(generatedDateTo, "dd/MM/yy") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={generatedDateTo}
                        onSelect={setGeneratedDateTo}
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

      {/* Document Cards */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center space-y-2">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-base font-medium text-foreground">No documents found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters or search criteria
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {filtered.map((d: any) => (
          <Link key={d.id} href={`/app/jobs/${d.jobId}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {d.kind.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </span>
                      <Badge variant="outline" className="text-[10px]">PDF</Badge>
                      {d.consultant && (
                        <Badge variant="default" className="text-[10px] h-4 px-1.5 font-bold">
                          {d.consultant}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {d.supplier}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.jobNumber} • {d.customerName}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(d.generatedAt).toLocaleDateString("en-ZA", { 
                    day: "numeric", 
                    month: "short", 
                    year: "numeric" 
                  })}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
