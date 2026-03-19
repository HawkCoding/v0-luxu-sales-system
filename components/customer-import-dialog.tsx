"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, X } from "lucide-react"
import { useActiveSuppliers, useSupplierDetail } from "@/lib/use-data"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { mutate } from "swr"

const SUPPLIER_NONE_VALUE = "__none_supplier__"
const ROUTE_NONE_VALUE = "__none_route__"

interface EditableImportRow {
  id: string
  selected: boolean
  title: string
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
  sourceLabel: string
}

interface ImportResult {
  createdCustomers: number
  matchedCustomers: number
  importedBookings: number
  duplicates: string[]
  skippedInvalid: number
}

const REQUIRED_HEADERS = ["first_name", "last_name", "email"] as const
const HEADER_ALIASES: Record<string, "title" | "first_name" | "last_name" | "email" | "phone" | "country"> = {
  title: "title",
  name: "first_name",
  first_name: "first_name",
  firstname: "first_name",
  surname: "last_name",
  last_name: "last_name",
  lastname: "last_name",
  email: "email",
  email_email: "email",
  contact_number: "phone",
  phone: "phone",
  country: "country",
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function isEmail(value: string): boolean {
  return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value.trim())
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function getUniqueCustomerCount(rows: EditableImportRow[]): number {
  return new Set(rows.map((row) => row.email.trim().toLowerCase())).size
}

function isRowValid(row: EditableImportRow): boolean {
  return row.first_name.trim().length > 0 && row.last_name.trim().length > 0 && isEmail(row.email)
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random()}`
}

export function CustomerBulkImportPanel() {
  const { data: suppliers = [] } = useActiveSuppliers()
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<EditableImportRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedSupplierSlug = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId)?.slug ?? "",
    [selectedSupplierId, suppliers],
  )
  const { data: supplierDetail } = useSupplierDetail(selectedSupplierSlug)

  const routeOptions = useMemo(() => {
    if (!supplierDetail || "error" in supplierDetail) return []
    return supplierDetail.packages.flatMap((pkg) =>
      pkg.routes.map((route) => ({
        id: route.id,
        label: `${route.name} (${pkg.name})`,
      })),
    )
  }, [supplierDetail])

  const handleSupplierChange = (value: string) => {
    const nextSupplierId = value === SUPPLIER_NONE_VALUE ? null : value
    setSelectedSupplierId(nextSupplierId)
    setSelectedRouteId(null)
  }

  const handleRouteChange = (value: string) => {
    setSelectedRouteId(value === ROUTE_NONE_VALUE ? null : value)
  }

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return
    setResult(null)
    setFiles([incoming[0]])
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFiles(e.dataTransfer.files ?? null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files ?? null)
    // Reset input so the same file can be re-selected after clearing
    e.target.value = ""
  }

  const handleClear = () => {
    setFiles([])
    setRows([])
    setResult(null)
    setSelectedSupplierId(null)
    setSelectedRouteId(null)
  }

  const parseCsvFile = async (file: File): Promise<EditableImportRow[]> => {
    const text = await file.text()
    const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean)
    if (lines.length < 2) return []

    const rawHeaders = parseCsvLine(lines[0]).map((header) => normalizeHeader(header))
    const mappedHeaders = rawHeaders.map((header) => HEADER_ALIASES[header] ?? null)
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !mappedHeaders.includes(header))
    if (missingHeaders.length > 0) {
      throw new Error(`CSV headers must include ${missingHeaders.join(", ")}`)
    }

    const headerIndex = new Map<string, number>()
    mappedHeaders.forEach((header, index) => {
      if (header) headerIndex.set(header, index)
    })
    const getValue = (values: string[], header: keyof EditableImportRow) =>
      values[headerIndex.get(header) ?? -1]?.trim() ?? ""
    return lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line)
      return {
        id: newRowId(),
        selected: true,
        title: getValue(values, "title"),
        first_name: getValue(values, "first_name"),
        last_name: getValue(values, "last_name"),
        email: getValue(values, "email").toLowerCase(),
        phone: getValue(values, "phone"),
        country: getValue(values, "country"),
        sourceLabel: `${file.name} row ${index + 2}`,
      }
    })
  }

  const handlePrepareRows = async () => {
    if (files.length === 0) return
    setIsProcessing(true)
    setResult(null)
    try {
      const nextRows = await parseCsvFile(files[0])
      if (nextRows.length === 0) {
        toast.error("No records found", { description: "Please check the uploaded file content." })
        return
      }
      setRows(nextRows)
      toast.success("Records extracted", {
        description: `${getUniqueCustomerCount(nextRows)} customers and ${nextRows.length} historical bookings ready for review.`,
      })
    } catch (error) {
      toast.error("Failed to process file(s)", {
        description: error instanceof Error ? error.message : "Please try another file format.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const updateRow = (id: string, patch: Partial<EditableImportRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const removeRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  const selectedValidRows = useMemo(
    () => rows.filter((row) => row.selected && isRowValid(row)),
    [rows]
  )

  const selectedInvalidCount = useMemo(
    () => rows.filter((row) => row.selected && !isRowValid(row)).length,
    [rows]
  )

  const handleImport = async () => {
    if (selectedValidRows.length === 0) {
      toast.error("No valid rows selected", {
        description: "Fix invalid rows or select at least one valid customer row.",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplierId,
          routeId: selectedRouteId,
          rows: selectedValidRows.map((row) => ({
            title: row.title.trim() || null,
            first_name: row.first_name.trim(),
            last_name: row.last_name.trim(),
            email: row.email.trim().toLowerCase(),
            phone: row.phone.trim() || null,
            country: row.country.trim() || null,
          })),
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error ?? "Import failed")
      }

      const nextResult: ImportResult = {
        createdCustomers: payload.createdCustomers ?? 0,
        matchedCustomers: payload.matchedCustomers ?? 0,
        importedBookings: payload.importedBookings ?? 0,
        duplicates: Array.isArray(payload.duplicates) ? payload.duplicates : [],
        skippedInvalid: selectedInvalidCount,
      }
      setResult(nextResult)

      await mutate("/api/data")
      toast.success("Customer and booking import complete", {
        description:
          `${nextResult.createdCustomers} customers created, ` +
          `${nextResult.matchedCustomers} matched, ` +
          `${nextResult.importedBookings} historical bookings imported, ` +
          `${nextResult.duplicates.length} conflicting customer rows, ` +
          `${nextResult.skippedInvalid} invalid skipped.`,
      })
    } catch (error) {
      toast.error("Import failed", {
        description: error instanceof Error ? error.message : "Unexpected error during import.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Leads Bulk Import</h2>
        <p className="text-sm text-muted-foreground">
          Upload one CSV file with customer details from supplier exports, review the rows, then import historical booking records.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Required CSV fields are first name, surname/last name, and email. Supported headers include template headers and supplier headers like
        Title, Name, Surname, Contact Number, Email (Email), Country.
      </div>

      <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Supplier (optional)</p>
          <Select value={selectedSupplierId ?? SUPPLIER_NONE_VALUE} onValueChange={handleSupplierChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SUPPLIER_NONE_VALUE}>No supplier selected</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Route (optional)</p>
          <Select
            value={selectedRouteId ?? ROUTE_NONE_VALUE}
            onValueChange={handleRouteChange}
            disabled={!selectedSupplierId}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectedSupplierId ? "Select route" : "Select supplier first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROUTE_NONE_VALUE}>No route selected</SelectItem>
              {routeOptions.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="CSV file drop area"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40"
        )}
      >
        <FileText className={cn("h-9 w-9 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")} />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isDragOver ? "Release to drop CSV" : "Drag & drop your CSV file"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the template for best results:{" "}
            <a href="/customer-import-template.csv" download className="text-primary underline" onClick={(e) => e.stopPropagation()}>
              Download template
            </a>
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple={false}
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {files.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{files.length} file(s) selected</p>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          </div>
          <div className="max-h-32 space-y-1 overflow-auto">
            {files.map((selectedFile) => (
              <div key={`${selectedFile.name}-${selectedFile.size}`} className="text-xs text-muted-foreground">
                {selectedFile.name} ({formatBytes(selectedFile.size)})
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Review extracted import rows ({getUniqueCustomerCount(rows)} customers, {rows.length} bookings)
            </p>
            <p className="text-xs text-muted-foreground">
              Valid selected: {selectedValidRows.length} | Invalid selected: {selectedInvalidCount}
            </p>
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-md border">
            <Table className="min-w-[980px] table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10">Use</TableHead>
                  <TableHead className="w-24">Title</TableHead>
                  <TableHead className="w-36">First</TableHead>
                  <TableHead className="w-36">Last</TableHead>
                  <TableHead className="w-72">Email</TableHead>
                  <TableHead className="w-40">Phone</TableHead>
                  <TableHead className="w-32">Country</TableHead>
                  <TableHead className="w-56">Source</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const valid = isRowValid(row)
                  return (
                    <TableRow key={row.id} className={!valid ? "bg-destructive/5" : ""}>
                      <TableCell className="w-10">
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={(checked) => updateRow(row.id, { selected: checked === true })}
                        />
                      </TableCell>
                      <TableCell className="w-24">
                        <Input value={row.title} onChange={(e) => updateRow(row.id, { title: e.target.value })} className="h-8 w-full" />
                      </TableCell>
                      <TableCell className="w-36">
                        <Input
                          value={row.first_name}
                          onChange={(e) => updateRow(row.id, { first_name: e.target.value })}
                          className={cn("h-8 w-full", row.first_name.trim().length > 0 ? "" : "border-destructive")}
                        />
                      </TableCell>
                      <TableCell className="w-36">
                        <Input
                          value={row.last_name}
                          onChange={(e) => updateRow(row.id, { last_name: e.target.value })}
                          className={cn("h-8 w-full", row.last_name.trim().length > 0 ? "" : "border-destructive")}
                        />
                      </TableCell>
                      <TableCell className="w-72">
                        <Input
                          value={row.email}
                          onChange={(e) => updateRow(row.id, { email: e.target.value.toLowerCase() })}
                          className={cn("h-8 w-full", isEmail(row.email) ? "" : "border-destructive")}
                        />
                      </TableCell>
                      <TableCell className="w-40">
                        <Input value={row.phone} onChange={(e) => updateRow(row.id, { phone: e.target.value })} className="h-8 w-full" />
                      </TableCell>
                      <TableCell className="w-32">
                        <Input value={row.country} onChange={(e) => updateRow(row.id, { country: e.target.value })} className="h-8 w-full" />
                      </TableCell>
                      <TableCell className="w-56 truncate text-xs text-muted-foreground" title={row.sourceLabel}>
                        {row.sourceLabel}
                      </TableCell>
                      <TableCell className="w-24">
                        <Button variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-medium">Import complete</p>
          <p className="text-xs text-muted-foreground">
            Customers created: {result.createdCustomers} | Customers matched: {result.matchedCustomers} | Historical bookings imported:{" "}
            {result.importedBookings} | Conflicting customer rows: {result.duplicates.length} | Invalid skipped: {result.skippedInvalid}
          </p>
          {result.duplicates.length > 0 ? (
            <p className="break-all text-xs text-muted-foreground">Conflicting customer emails: {result.duplicates.join(", ")}</p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={files.length === 0 || isProcessing}
          onClick={handlePrepareRows}
        >
          {isProcessing ? "Processing..." : "Extract Rows"}
        </Button>
        <Button
          size="sm"
          disabled={selectedValidRows.length === 0 || isSubmitting || isProcessing}
          onClick={handleImport}
        >
          Import Customers And Bookings
        </Button>
      </div>
    </div>
  )
}
