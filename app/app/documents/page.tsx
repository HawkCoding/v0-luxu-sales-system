"use client"

import { useData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Download, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { CONSULTANTS } from "@/lib/types"
import { FacetedFilter } from "@/components/ui/faceted-filter"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ListFilterBar, type FilterChip } from "@/components/list-filter-bar"
import { useFilterParams } from "@/hooks/use-filter-params"
import { matchesSearch, isWithinDateRange } from "@/lib/list-filters"
import { formatDisplayDate, formatDisplayDateShort } from "@/lib/date-format"

const DOC_TYPE_OPTIONS = [
  { value: "quote_pdf", label: "Quote PDF" },
  { value: "voucher_pdf", label: "Voucher PDF" },
  { value: "invoice_pdf", label: "Invoice PDF" },
]

const DEFAULT_FILTERS = {
  q: "",
  type: "",
  supplier: "",
  consultant: "",
  generatedFrom: "",
  generatedTo: "",
}

export default function DocumentsPage() {
  const { data, isLoading } = useData(["bookings", "customers", "documents"])
  const { values, setValue, clear, hasActive } = useFilterParams(DEFAULT_FILTERS)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownload = async (event: React.MouseEvent, documentId: string) => {
    // The card is wrapped in a booking link — keep the click on the button.
    event.preventDefault()
    event.stopPropagation()
    setDownloadingId(documentId)
    try {
      const res = await fetch(`/api/documents/${documentId}`)
      const payload = (await res.json().catch(() => null)) as { signedUrl?: string; error?: string } | null
      if (!res.ok || !payload?.signedUrl) {
        throw new Error(payload?.error ?? "Document could not be downloaded")
      }
      window.open(payload.signedUrl, "_blank", "noopener")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document could not be downloaded")
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const docs = data.documents.map((d: any) => {
    const booking = data.bookings.find((b: any) => b.id === d.bookingId)
    const customer = data.customers.find((c: any) => c.id === booking?.customerId)

    const supplier = booking?.supplierName?.trim() || null

    return {
      ...d,
      jobId: d.bookingId,
      jobNumber: booking?.bookingNumber,
      consultant: booking?.consultant,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      customerEmail: customer?.email || "",
      generatedAt: d.createdAt,
      supplier,
    }
  }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const supplierOptions = Array.from(
    new Set(docs.map((d: any) => d.supplier).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b))

  const consultantOptions = CONSULTANTS.map((c) => ({ value: c.key, label: `${c.key} - ${c.name}` }))

  const filtered = docs.filter((d: any) => {
    const matchSearch = matchesSearch([d.jobNumber, d.customerName, d.customerEmail], values.q)
    const matchDocType = !values.type || d.kind === values.type
    const matchSupplier = !values.supplier || d.supplier === values.supplier
    const matchConsultant = !values.consultant || d.consultant === values.consultant
    const matchGenerated = isWithinDateRange(d.generatedAt, values.generatedFrom, values.generatedTo)

    return matchSearch && matchDocType && matchSupplier && matchConsultant && matchGenerated
  })

  const hasActiveFilters = hasActive
  const clearFilters = clear

  const chips: FilterChip[] = []
  if (values.type) {
    const label = DOC_TYPE_OPTIONS.find((o) => o.value === values.type)?.label ?? values.type
    chips.push({ key: "type", label: `Type: ${label}`, onRemove: () => setValue("type", undefined) })
  }
  if (values.supplier) {
    chips.push({ key: "supplier", label: `Supplier: ${values.supplier}`, onRemove: () => setValue("supplier", undefined) })
  }
  if (values.consultant) {
    const label = consultantOptions.find((o) => o.value === values.consultant)?.label ?? values.consultant
    chips.push({ key: "consultant", label: `Consultant: ${label}`, onRemove: () => setValue("consultant", undefined) })
  }
  if (values.generatedFrom || values.generatedTo) {
    chips.push({
      key: "generated",
      label: `Generated: ${values.generatedFrom ? formatDisplayDateShort(values.generatedFrom) : "…"} – ${values.generatedTo ? formatDisplayDateShort(values.generatedTo) : "…"}`,
      onRemove: () => {
        setValue("generatedFrom", undefined)
        setValue("generatedTo", undefined)
      },
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Documents</h1>
        <p className="text-base text-muted-foreground mt-2">
          {filtered.length} of {docs.length} documents
        </p>
      </div>

      <ListFilterBar
        searchValue={values.q}
        onSearchChange={(v) => setValue("q", v, { debounceMs: 250 })}
        searchPlaceholder="Search job number or customer..."
        chips={chips}
        onClearAll={clearFilters}
        resultCount={filtered.length}
        totalCount={docs.length}
        noun="document"
        hasActiveFilters={hasActiveFilters}
      >
        <FacetedFilter
          label="Type"
          options={DOC_TYPE_OPTIONS}
          value={values.type || undefined}
          onChange={(v) => setValue("type", v)}
        />
        <FacetedFilter
          label="Supplier"
          options={supplierOptions.map((name) => ({ value: name, label: name }))}
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
          placeholder="Generated date"
          value={{ from: values.generatedFrom || undefined, to: values.generatedTo || undefined }}
          onChange={(range) => {
            setValue("generatedFrom", range.from)
            setValue("generatedTo", range.to)
          }}
        />
      </ListFilterBar>

      {/* Document Cards */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText className="w-6 h-6" />
              </EmptyMedia>
              <EmptyTitle>No documents found</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "No documents match your filters."
                  : "No documents have been generated yet."}
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

        {filtered.map((d: any) => (
          <Link key={d.id} href={`/app/bookings/${d.jobId}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {d.kind
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())
                          .replace(/\bPdf\b/g, "PDF")}
                      </span>
                      {d.storagePath ? (
                        <Badge variant="outline" className="text-xs">PDF</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">No file</Badge>
                      )}
                      {d.consultant && (
                        <Badge variant="default" className="text-xs h-5 px-1.5 font-bold">
                          {d.consultant}
                        </Badge>
                      )}
                      {d.supplier && (
                        <Badge variant="secondary" className="text-xs">
                          {d.supplier}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.jobNumber} • {d.customerName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {d.storagePath && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={(event) => handleDownload(event, d.id)}
                      disabled={downloadingId === d.id}
                      aria-label={`Download ${d.kind.replace(/_/g, " ")}`}
                    >
                      {downloadingId === d.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDisplayDate(d.generatedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
