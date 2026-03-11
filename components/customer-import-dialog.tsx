"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { mutate } from "swr"

type ImportSource =
  | "web_form"
  | "paste_import"
  | "advertisement"
  | "walk_in"
  | "referral"
  | "social_media"
  | "phone_call"
  | "email"
  | "travel_agent"

interface EditableImportRow {
  id: string
  selected: boolean
  title: string
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
  booking_reference: string
  departure_date: string
  route: string
  consultant: string
  source: string
  adults: string
  children: string
  suites: string
  cabin_type: string
  isContinuation: boolean
  sourceLabel: string
}

interface ImportResult {
  createdCustomers: number
  matchedCustomers: number
  importedBookings: number
  duplicates: string[]
  skippedInvalid: number
}

interface CustomerSeed {
  title: string
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
}

const CUSTOMER_HEADERS = ["title", "first_name", "last_name", "email", "phone", "country"] as const
const BOOKING_HEADERS = [
  "booking_reference",
  "departure_date",
  "route",
  "consultant",
  "source",
  "adults",
  "children",
  "suites",
  "cabin_type",
] as const
const REQUIRED_HEADERS = [...CUSTOMER_HEADERS, ...BOOKING_HEADERS]
const VALID_SOURCES: ImportSource[] = [
  "web_form",
  "paste_import",
  "advertisement",
  "walk_in",
  "referral",
  "social_media",
  "phone_call",
  "email",
  "travel_agent",
]
type FieldHintKey =
  | "first_name"
  | "last_name"
  | "email"
  | "booking_reference"
  | "departure_date"
  | "route"
  | "consultant"
  | "source"
  | "adults"
  | "children"
  | "suites"
  | "cabin_type"

const FIELD_HINTS: Record<FieldHintKey, string> = {
  first_name: "Required. Example: John",
  last_name: "Required. Example: Smith",
  email: "Valid email required. Example: john@example.com",
  booking_reference: "Required. Example: BK-20250301-001",
  departure_date: "Date in YYYY-MM-DD format. Example: 2025-06-15",
  route: "Required. Example: Pretoria to Cape Town",
  consultant: "Required. Example: JD",
  source: `Must be one of: ${VALID_SOURCES.join(", ")}`,
  adults: "Whole number, 0 or more. Example: 2",
  children: "Whole number, 0 or more. Example: 1",
  suites: "Whole number, 1 or more. Example: 1",
  cabin_type: "Required. Example: Deluxe Suite",
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function isNonNegativeInteger(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value.trim())
}

function normalizeImportSource(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (normalized === "web" || normalized === "webform") return "web_form"
  if (normalized === "paste" || normalized === "manual_import" || normalized === "csv_import" || normalized === "csv") return "paste_import"
  if (normalized === "ad" || normalized === "ads" || normalized === "advert" || normalized === "advertising") return "advertisement"
  if (normalized === "walkin" || normalized === "walk_in_client" || normalized === "walk_in_customer") return "walk_in"
  if (normalized === "referal" || normalized === "word_of_mouth") return "referral"
  if (normalized === "social" || normalized === "socials" || normalized === "socials_media") return "social_media"
  if (normalized === "phone" || normalized === "call" || normalized === "telephone") return "phone_call"
  if (normalized === "mail" || normalized === "email_enquiry" || normalized === "email_inquiry") return "email"
  if (normalized === "agent" || normalized === "travelagency" || normalized === "travel_agency") return "travel_agent"
  return normalized
}

function getUniqueCustomerCount(rows: EditableImportRow[]): number {
  return new Set(rows.map((row) => row.email.trim().toLowerCase())).size
}

function isRowValid(row: EditableImportRow): boolean {
  const hasCustomer = row.first_name.trim().length > 0 && row.last_name.trim().length > 0 && isEmail(row.email)
  const hasBooking =
    row.booking_reference.trim().length > 0 &&
    isIsoDate(row.departure_date) &&
    row.route.trim().length > 0 &&
    row.consultant.trim().length > 0 &&
    VALID_SOURCES.includes(row.source.trim() as ImportSource) &&
    isNonNegativeInteger(row.adults) &&
    isNonNegativeInteger(row.children) &&
    isPositiveInteger(row.suites) &&
    row.cabin_type.trim().length > 0
  return hasCustomer && hasBooking
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random()}`
}

interface ValidatedInputProps extends React.ComponentProps<typeof Input> {
  isValid: boolean
  hint?: string
}

function ValidatedInput({ isValid, hint, className, ...inputProps }: ValidatedInputProps) {
  const input = <Input {...inputProps} className={cn(className, isValid ? "" : "border-destructive")} />
  if (isValid || !hint) return input
  return (
    <Tooltip>
      <TooltipTrigger asChild>{input}</TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  )
}

export function CustomerBulkImportPanel() {
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<EditableImportRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
  }

  const parseCsvFile = async (file: File): Promise<EditableImportRow[]> => {
    const text = await file.text()
    const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean)
    if (lines.length < 2) return []

    const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase())
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
    if (missingHeaders.length > 0) {
      throw new Error(`CSV headers must include ${missingHeaders.join(", ")}`)
    }

    const headerIndex = new Map(headers.map((header, index) => [header, index]))
    const getValue = (values: string[], header: string) => values[headerIndex.get(header) ?? -1] ?? ""
    let currentCustomer: CustomerSeed | null = null

    return lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line)
      const nextCustomer: CustomerSeed = {
        title: getValue(values, "title"),
        first_name: getValue(values, "first_name"),
        last_name: getValue(values, "last_name"),
        email: getValue(values, "email").toLowerCase(),
        phone: getValue(values, "phone"),
        country: getValue(values, "country"),
      }
      const hasCustomerValues = Object.values(nextCustomer).some((value) => value.trim().length > 0)
      if (hasCustomerValues) {
        currentCustomer = nextCustomer
      }
      if (!currentCustomer) {
        throw new Error(`Row ${index + 2} must start with customer details before booking-only continuation rows.`)
      }

      return {
        id: newRowId(),
        selected: true,
        ...currentCustomer,
        booking_reference: getValue(values, "booking_reference"),
        departure_date: getValue(values, "departure_date"),
        route: getValue(values, "route"),
        consultant: getValue(values, "consultant"),
        source: normalizeImportSource(getValue(values, "source")),
        adults: getValue(values, "adults"),
        children: getValue(values, "children"),
        suites: getValue(values, "suites"),
        cabin_type: getValue(values, "cabin_type"),
        isContinuation: !hasCustomerValues,
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
          mode: "csv",
          rows: selectedValidRows.map((row) => ({
            title: row.title.trim() || null,
            first_name: row.first_name.trim(),
            last_name: row.last_name.trim(),
            email: row.email.trim().toLowerCase(),
            phone: row.phone.trim() || null,
            country: row.country.trim() || null,
            booking_reference: row.booking_reference.trim(),
            departure_date: row.departure_date.trim(),
            route: row.route.trim(),
            consultant: row.consultant.trim(),
            source: row.source.trim(),
            adults: Number(row.adults.trim()),
            children: Number(row.children.trim()),
            suites: Number(row.suites.trim()),
            cabin_type: row.cabin_type.trim(),
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
        <h2 className="text-lg font-semibold text-foreground">Bulk Import Customers And Historical Bookings</h2>
        <p className="text-sm text-muted-foreground">
          Upload one CSV file with customer details and past train bookings, review the rows, then import them in bulk.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Use one row per booking. The first row for a customer should include the customer details, and any following booking rows for the same
        customer can leave the customer columns blank. Required booking columns are booking reference, departure date, route, consultant,
        source, adults, children, suites, and cabin type.
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
            <Table className="min-w-[1740px] table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10">Use</TableHead>
                  <TableHead className="w-24">Row Type</TableHead>
                  <TableHead className="w-24">Title</TableHead>
                  <TableHead className="w-36">First</TableHead>
                  <TableHead className="w-36">Last</TableHead>
                  <TableHead className="w-72">Email</TableHead>
                  <TableHead className="w-40">Phone</TableHead>
                  <TableHead className="w-32">Country</TableHead>
                  <TableHead className="w-32">Booking Ref</TableHead>
                  <TableHead className="w-32">Departure</TableHead>
                  <TableHead className="w-64">Route</TableHead>
                  <TableHead className="w-24">Consultant</TableHead>
                  <TableHead className="w-28">Source</TableHead>
                  <TableHead className="w-20">Adults</TableHead>
                  <TableHead className="w-20">Children</TableHead>
                  <TableHead className="w-20">Suites</TableHead>
                  <TableHead className="w-40">Cabin Type</TableHead>
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
                      <TableCell className="w-24 text-xs text-muted-foreground">
                        {row.isContinuation ? "Booking only" : "Customer start"}
                      </TableCell>
                      <TableCell className="w-24">
                        <Input value={row.title} onChange={(e) => updateRow(row.id, { title: e.target.value })} className="h-8 w-full" />
                      </TableCell>
                      <TableCell className="w-36">
                        <ValidatedInput
                          value={row.first_name}
                          onChange={(e) => updateRow(row.id, { first_name: e.target.value })}
                          isValid={row.first_name.trim().length > 0}
                          hint={FIELD_HINTS.first_name}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-36">
                        <ValidatedInput
                          value={row.last_name}
                          onChange={(e) => updateRow(row.id, { last_name: e.target.value })}
                          isValid={row.last_name.trim().length > 0}
                          hint={FIELD_HINTS.last_name}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-72">
                        <ValidatedInput
                          value={row.email}
                          onChange={(e) => updateRow(row.id, { email: e.target.value.toLowerCase() })}
                          isValid={isEmail(row.email)}
                          hint={FIELD_HINTS.email}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-40">
                        <Input value={row.phone} onChange={(e) => updateRow(row.id, { phone: e.target.value })} className="h-8 w-full" />
                      </TableCell>
                      <TableCell className="w-32">
                        <Input value={row.country} onChange={(e) => updateRow(row.id, { country: e.target.value })} className="h-8 w-full" />
                      </TableCell>
                      <TableCell className="w-32">
                        <ValidatedInput
                          value={row.booking_reference}
                          onChange={(e) => updateRow(row.id, { booking_reference: e.target.value })}
                          isValid={row.booking_reference.trim().length > 0}
                          hint={FIELD_HINTS.booking_reference}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-32">
                        <ValidatedInput
                          value={row.departure_date}
                          onChange={(e) => updateRow(row.id, { departure_date: e.target.value })}
                          placeholder="YYYY-MM-DD"
                          isValid={isIsoDate(row.departure_date)}
                          hint={FIELD_HINTS.departure_date}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-64">
                        <ValidatedInput
                          value={row.route}
                          onChange={(e) => updateRow(row.id, { route: e.target.value })}
                          isValid={row.route.trim().length > 0}
                          hint={FIELD_HINTS.route}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-24">
                        <ValidatedInput
                          value={row.consultant}
                          onChange={(e) => updateRow(row.id, { consultant: e.target.value.toUpperCase() })}
                          isValid={row.consultant.trim().length > 0}
                          hint={FIELD_HINTS.consultant}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-28">
                        <ValidatedInput
                          value={row.source}
                          onChange={(e) => updateRow(row.id, { source: normalizeImportSource(e.target.value) })}
                          isValid={VALID_SOURCES.includes(row.source.trim() as ImportSource)}
                          hint={FIELD_HINTS.source}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-20">
                        <ValidatedInput
                          value={row.adults}
                          onChange={(e) => updateRow(row.id, { adults: e.target.value })}
                          isValid={isNonNegativeInteger(row.adults)}
                          hint={FIELD_HINTS.adults}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-20">
                        <ValidatedInput
                          value={row.children}
                          onChange={(e) => updateRow(row.id, { children: e.target.value })}
                          isValid={isNonNegativeInteger(row.children)}
                          hint={FIELD_HINTS.children}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-20">
                        <ValidatedInput
                          value={row.suites}
                          onChange={(e) => updateRow(row.id, { suites: e.target.value })}
                          isValid={isPositiveInteger(row.suites)}
                          hint={FIELD_HINTS.suites}
                          className="h-8 w-full"
                        />
                      </TableCell>
                      <TableCell className="w-40">
                        <ValidatedInput
                          value={row.cabin_type}
                          onChange={(e) => updateRow(row.id, { cabin_type: e.target.value })}
                          isValid={row.cabin_type.trim().length > 0}
                          hint={FIELD_HINTS.cabin_type}
                          className="h-8 w-full"
                        />
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
